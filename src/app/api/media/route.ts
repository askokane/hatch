import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { IMAGE_BYTES_MAX, VIDEO_BYTES_MAX, PENDING_UPLOAD_MAX } from "@/lib/constants";
import { humanMB, mimeKind, safeFileName } from "@/lib/upload";
import { stripImageMetadataStrict } from "@/lib/image-metadata";
import { validateFileBytes } from "@/lib/file-signature";
import { consumeRateLimit } from "@/lib/rate-limit";
import { isTrustedMutationRequest } from "@/lib/request-security";

// POST /api/media   (multipart/form-data, field: `file`)
//
// Why a route handler and not a Server Action, when every other mutation in this
// app is an action: Next caps a Server Action's request body at 1 MB by default.
// A multi-megabyte video cannot travel that path at all, and raising the cap is a
// global setting — it would apply to every action in the app, turning a limit
// that usefully bounds the ordinary text mutations into a media-sized ceiling
// everywhere. A route handler takes the larger body without widening anything
// else's exposure.
//
// The upload is deliberately separate from post creation. The composer needs to
// show a preview and a working delete before the post exists, and a failed
// multi-megabyte upload should not also discard the caption the user typed.

export async function POST(req: Request) {
  if (!isTrustedMutationRequest(req, "multipart/form-data")) return Response.json({ error: "Untrusted request." }, { status: 403 });
  const session = await getSession();
  if (!session?.profileId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const profileId = session.profileId;
  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (declaredLength > VIDEO_BYTES_MAX + 1_000_000) return Response.json({ error: "Upload body is too large." }, { status: 413 });
  if (!(await consumeRateLimit("media-upload", profileId, 30, 60 * 60 * 1000))) {
    return Response.json({ error: "Upload limit reached. Try again later." }, { status: 429 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Upload was not a valid form submission." }, { status: 400 });
  }

  const file = form.get("file");
  const draftId = form.get("draftId");
  if (!(file instanceof File)) {
    return Response.json({ error: "No file received." }, { status: 400 });
  }
  if (typeof draftId !== "string" || !/^[a-zA-Z0-9_-]{8,80}$/.test(draftId)) {
    return Response.json({ error: "Invalid upload draft." }, { status: 400 });
  }

  const kind = mimeKind(file.type);
  if (!kind) {
    return Response.json(
      { error: "That file type isn't supported. Use a JPEG, PNG, WebP, MP4, WebM or MOV." },
      { status: 400 }
    );
  }

  const limit = kind === "IMAGE" ? IMAGE_BYTES_MAX : VIDEO_BYTES_MAX;
  // file.size is checked before reading the body into memory, so an oversized
  // upload is refused without first buffering it.
  if (file.size > limit) {
    return Response.json(
      {
        error: `That ${kind === "IMAGE" ? "image" : "video"} is ${humanMB(file.size)}. The limit is ${humanMB(limit)}.`,
      },
      { status: 400 }
    );
  }
  if (file.size === 0) {
    return Response.json({ error: "That file is empty." }, { status: 400 });
  }

  // `isAvatar: false` matters: a profile picture is permanently postId-null, so
  // without it every user with an avatar would start one over quota.
  const raw = Buffer.from(await file.arrayBuffer());
  // The multipart part could disagree with the declared size; the stored length is
  // the one that was actually read, and it is re-checked against the cap.
  if (raw.byteLength > limit) {
    return Response.json({ error: "That file is larger than the limit." }, { status: 400 });
  }
  if (!validateFileBytes(raw, file.type)) {
    return Response.json({ error: "The file contents do not match a supported media format." }, { status: 400 });
  }

  // Photos posted to the feed carry the same EXIF as any other phone photo — GPS
  // included — and the feed is where the most photos are. Video is passed
  // through: its container metadata is a different parsing problem, and this
  // helper does not pretend to handle it.
  let bytes: Buffer<ArrayBuffer> | null = kind === "IMAGE" ? stripImageMetadataStrict(raw, file.type) : Buffer.from(raw);
  if (kind === "VIDEO" && process.env.NODE_ENV === "production") {
    const processor = process.env.MEDIA_PROCESSOR_URL;
    if (!processor) return Response.json({ error: "Video uploads are temporarily unavailable." }, { status: 503 });
    const processed = await fetch(processor, {
      method: "POST", headers: { "content-type": file.type, ...(process.env.MEDIA_PROCESSOR_SECRET ? { authorization: `Bearer ${process.env.MEDIA_PROCESSOR_SECRET}` } : {}) },
      body: raw, signal: AbortSignal.timeout(30_000),
    }).catch(() => null);
    if (!processed?.ok) return Response.json({ error: "Video could not be safely processed." }, { status: 400 });
    bytes = Buffer.from(await processed.arrayBuffer());
    if (bytes.byteLength > VIDEO_BYTES_MAX || !validateFileBytes(bytes, file.type)) bytes = null;
  }
  if (!bytes) return Response.json({ error: "That image could not be safely processed." }, { status: 400 });

  const asset = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`uploads:${profileId}`}))`;
    const pending = await tx.mediaAsset.count({ where: { ownerProfileId: profileId, postId: null, isAvatar: false } });
    if (pending >= PENDING_UPLOAD_MAX) return null;
    return tx.mediaAsset.create({ data: {
      ownerProfileId: profileId,
      draftId,
      kind,
      mimeType: file.type,
      data: bytes,
      byteSize: bytes.byteLength,
      fileName: safeFileName(file.name),
    },
    select: { id: true, kind: true, mimeType: true, byteSize: true, fileName: true },
    });
  });
  if (!asset) return Response.json({ error: "You have too many uploads waiting to be posted. Post or discard them first." }, { status: 429 });

  return Response.json(asset, { status: 201 });
}
