import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { IMAGE_BYTES_MAX, VIDEO_BYTES_MAX, PENDING_UPLOAD_MAX } from "@/lib/constants";
import { humanMB, mimeKind, safeFileName } from "@/lib/upload";
import { stripImageMetadata } from "@/lib/image-metadata";

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
  const session = await getSession();
  if (!session?.profileId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const profileId = session.profileId;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Upload was not a valid form submission." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "No file received." }, { status: 400 });
  }

  const kind = mimeKind(file.type);
  if (!kind) {
    return Response.json(
      { error: "That file type isn't supported. Use a JPEG, PNG, GIF, WebP, MP4, WebM or MOV." },
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
  const pending = await db.mediaAsset.count({
    where: { ownerProfileId: profileId, postId: null, isAvatar: false },
  });
  if (pending >= PENDING_UPLOAD_MAX) {
    return Response.json(
      { error: "You have too many uploads waiting to be posted. Post or discard them first." },
      { status: 429 }
    );
  }

  const raw = Buffer.from(await file.arrayBuffer());
  // The multipart part could disagree with the declared size; the stored length is
  // the one that was actually read, and it is re-checked against the cap.
  if (raw.byteLength > limit) {
    return Response.json({ error: "That file is larger than the limit." }, { status: 400 });
  }

  // Photos posted to the feed carry the same EXIF as any other phone photo — GPS
  // included — and the feed is where the most photos are. Video is passed
  // through: its container metadata is a different parsing problem, and this
  // helper does not pretend to handle it.
  const bytes = kind === "IMAGE" ? stripImageMetadata(raw, file.type) : raw;

  const asset = await db.mediaAsset.create({
    data: {
      ownerProfileId: profileId,
      kind,
      mimeType: file.type,
      data: bytes,
      byteSize: bytes.byteLength,
      fileName: safeFileName(file.name),
    },
    select: { id: true, kind: true, mimeType: true, byteSize: true, fileName: true },
  });

  return Response.json(asset, { status: 201 });
}
