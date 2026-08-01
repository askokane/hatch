import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { ALLOWED_IMAGE_MIME, ALLOWED_VIDEO_MIME } from "@/lib/constants";

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
    select: { data: true, mimeType: true, byteSize: true, fileName: true },
  });
  if (!asset) return Response.json({ error: "Not found" }, { status: 404 });

  const contentType = safeContentType(asset.mimeType);
  if (!contentType) return Response.json({ error: "Unsupported media" }, { status: 415 });

  const bytes = Buffer.from(asset.data);
  const size = bytes.byteLength;

  const baseHeaders: Record<string, string> = {
    "Content-Type": contentType,
    // The id is a cuid over immutable bytes, so a cached copy can never be stale.
    // `private` because the response is behind a session and must not be held by a
    // shared cache.
    "Cache-Control": "private, max-age=31536000, immutable",
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
    const slice = bytes.subarray(range.start, range.end + 1);
    return new Response(new Uint8Array(slice), {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
        "Content-Length": String(slice.byteLength),
      },
    });
  }

  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { ...baseHeaders, "Content-Length": String(size) },
  });
}
