import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { AVATAR_BYTES_MAX } from "@/lib/constants";
import { revalidateAvatarSurfaces } from "@/lib/avatar-surfaces";
import { humanMB, mimeKind, safeFileName } from "@/lib/upload";
import { stripImageMetadata } from "@/lib/image-metadata";

// POST /api/avatar   (multipart/form-data, field: `file`)
//
// Sets the caller's profile picture, replacing whatever was there. Like
// /api/media this is a route handler rather than a Server Action because an
// action's request body is capped at 1 MB by default and a photo straight off a
// phone will exceed that — see the note in api/media/route.ts.
//
// It is a SEPARATE endpoint from /api/media rather than a flag on it, because
// the two have different lifecycles and the difference is the whole point: a
// composer upload is pending until a post claims it, whereas this one is claimed
// at the instant it is created. Doing both halves — the insert and the link — in
// one transaction is what makes a profile picture immune to the abandoned-upload
// sweep with no window in between.
//
// Images only. Video is a valid post attachment and not a valid face.

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

  if (mimeKind(file.type) !== "IMAGE") {
    return Response.json(
      { error: "A profile picture has to be an image — JPEG, PNG, GIF or WebP." },
      { status: 400 }
    );
  }

  // Checked before the body is read into memory, so an oversized file is refused
  // without first buffering it.
  if (file.size > AVATAR_BYTES_MAX) {
    return Response.json(
      { error: `That image is ${humanMB(file.size)}. Profile pictures cap at ${humanMB(AVATAR_BYTES_MAX)}.` },
      { status: 400 }
    );
  }
  if (file.size === 0) {
    return Response.json({ error: "That file is empty." }, { status: 400 });
  }

  const raw = Buffer.from(await file.arrayBuffer());
  // The multipart part could disagree with the declared size; the stored length
  // is the one that was actually read, and it is re-checked against the cap.
  if (raw.byteLength > AVATAR_BYTES_MAX) {
    return Response.json({ error: "That image is larger than the limit." }, { status: 400 });
  }

  // A profile picture is the single most widely served image in the app, and a
  // phone photo carries the GPS coordinates of wherever it was taken. The client
  // already re-encodes through a canvas, which drops metadata as a side effect —
  // this is the half that cannot be skipped by posting here directly.
  const bytes = stripImageMetadata(raw, file.type);

  const result = await db.$transaction(async (tx) => {
    const profile = await tx.profile.findUnique({
      where: { id: profileId },
      select: { handle: true, avatarAssetId: true },
    });
    if (!profile) return null;

    const asset = await tx.mediaAsset.create({
      data: {
        ownerProfileId: profileId,
        kind: "IMAGE",
        isAvatar: true,
        mimeType: file.type,
        data: bytes,
        byteSize: bytes.byteLength,
        fileName: safeFileName(file.name),
      },
      select: { id: true },
    });

    await tx.profile.update({
      where: { id: profileId },
      data: { avatarAssetId: asset.id },
    });

    // The picture that was just replaced. Deleted rather than kept, because
    // nothing in the app can reach a previous avatar — there is no history to
    // browse — and an undeletable blob per change is a slow leak of the one
    // resource this storage choice actually spends.
    //
    // `deleteMany` rather than `delete` so that a concurrent removal having
    // already taken the row is a no-op instead of a P2025 that would roll back
    // an otherwise successful upload.
    if (profile.avatarAssetId) {
      await tx.mediaAsset.deleteMany({ where: { id: profile.avatarAssetId } });
    }

    return { assetId: asset.id, handle: profile.handle };
  },
  {
    // Prisma's default interactive-transaction budget is 5s, which is sized for
    // the ordinary row writes elsewhere in this app. This transaction pushes up
    // to a megabyte of `bytea` to a hosted Postgres, so on a slow link the
    // default is close enough to be a coin flip — and expiring here means a
    // successful upload reported as a failure.
    timeout: 20_000,
    maxWait: 10_000,
  });

  if (!result) return Response.json({ error: "Finish setting up your profile first." }, { status: 400 });

  revalidateAvatarSurfaces(result.handle);
  return Response.json({ id: result.assetId }, { status: 201 });
}
