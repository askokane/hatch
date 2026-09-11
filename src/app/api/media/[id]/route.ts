import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { ALLOWED_IMAGE_MIME, ALLOWED_VIDEO_MIME } from "@/lib/constants";
import { isTrustedMutationRequest } from "@/lib/request-security";

// GET /api/media/:id — the bytes of one uploaded photo or video.
//
// This is the ONLY place that selects MediaAsset.data. Every listing path selects
// the metadata and lets the browser come here per asset, so a feed page costs the
// size of its text rather than the size of its media.
//
// Access: a session is required. HATCH is a logged-in network and media is posted
// into it, not onto the open web, so an unauthenticated fetch of a guessed id gets
// 401 rather than the file. There is no per-viewer check beyond that, matching how
// a post's text is visible to any signed-in member.

// The stored mimeType was validated on upload, but it is re-checked against the
// allowlist on the way out too. A Content-Type is an instruction to the browser
// about how to execute a response; deriving it from a stored row without
// re-validation would mean any future path that writes a MediaAsset (a migration,
// a seed, a bug) could cause this route to serve text/html from user-supplied
// bytes. Two checks, because the consequences of the second one failing are worse.
function safeContentType(mime: string): string | null {
  const allowed = [...ALLOWED_IMAGE_MIME, ...ALLOWED_VIDEO_MIME] as readonly string[];
  return allowed.includes(mime) ? mime : null;
}

// Parses a single-range `bytes=start-end` header. Multi-range requests (which no
// browser issues for media playback) are treated as no range at all rather than
// half-honoured.
function parseRange(header: string | null, size: number): { start: number; end: number } | "invalid" | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return "invalid";

  let start: number;
  let end: number;
  if (rawStart === "") {
    // Suffix form: `bytes=-500` means the LAST 500 bytes, not "from 0 to 500".
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return "invalid";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? size - 1 : Number(rawEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return "invalid";
    // A start past the end of the file is unsatisfiable; an end past it is simply
    // clamped, which is what the spec asks for.
    if (start >= size) return "invalid";
    end = Math.min(end, size - 1);
  }

  if (start > end || start < 0) return "invalid";
  return { start, end };
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.profileId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const asset = await db.mediaAsset.findUnique({
    where: { id },
    select: { ownerProfileId: true, postId: true, isAvatar: true, mimeType: true, byteSize: true, fileName: true },
  });
  if (!asset) return Response.json({ error: "Not found" }, { status: 404 });

  const contentType = safeContentType(asset.mimeType);
  if (!contentType) return Response.json({ error: "Unsupported media" }, { status: 415 });

  if (asset.ownerProfileId !== session.profileId) {
    if (!asset.postId && !asset.isAvatar) return Response.json({ error: "Not found" }, { status: 404 });
    const blocked = await db.block.findFirst({ where: { OR: [
      { blockerProfileId: session.profileId, blockedProfileId: asset.ownerProfileId },
      { blockerProfileId: asset.ownerProfileId, blockedProfileId: session.profileId },
    ] }, select: { id: true } });
    if (blocked) return Response.json({ error: "Not found" }, { status: 404 });
  }
  const size = asset.byteSize;

  const baseHeaders: Record<string, string> = {
    "Content-Type": contentType,
    // The id is a cuid over immutable bytes, so a cached copy can never be stale.
    // `private` because the response is behind a session and must not be held by a
    // shared cache.
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": "inline",
    // Advertised unconditionally: a video element checks for this before it will
    // attempt to seek.
    "Accept-Ranges": "bytes",
  };

  const range = parseRange(req.headers.get("range"), size);

  if (range === "invalid") {
    return new Response(null, {
      status: 416,
      headers: { ...baseHeaders, "Content-Range": `bytes */${size}` },
    });
  }

  // Range support is what makes <video> seeking work — without a 206, Safari will
  // not scrub at all and other browsers re-download from zero on every seek.
  if (range) {
    const length = range.end - range.start + 1;
    const rows = await db.$queryRaw<Array<{ data: Uint8Array }>>`
      SELECT substring("data" from ${range.start + 1} for ${length}) AS "data"
      FROM "MediaAsset" WHERE "id" = ${id}
    `;
    const slice = rows[0]?.data;
    if (!slice) return Response.json({ error: "Not found" }, { status: 404 });
    return new Response(Uint8Array.from(slice).buffer, {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
        "Content-Length": String(length),
      },
    });
  }

  const full = await db.mediaAsset.findUnique({ where: { id }, select: { data: true } });
  if (!full) return Response.json({ error: "Not found" }, { status: 404 });
  return new Response(Uint8Array.from(full.data).buffer, {
    status: 200,
    headers: { ...baseHeaders, "Content-Length": String(size) },
  });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isTrustedMutationRequest(req)) return Response.json({ error: "Untrusted request." }, { status: 403 });
  const session = await getSession();
  if (!session?.profileId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const deleted = await db.mediaAsset.deleteMany({
    where: { id, ownerProfileId: session.profileId, postId: null, isAvatar: false },
  });
  return deleted.count ? new Response(null, { status: 204 }) : Response.json({ error: "Not found" }, { status: 404 });
}
