"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, requireProfile } from "@/lib/session";
import { ForbiddenError } from "@/lib/authz";
import { createPostSchema } from "@/lib/validation/post.schema";
import { ok, fail, type ActionResult } from "@/lib/action-result";

// Thrown inside the create transaction when an asset fails the ownership guard at
// the moment of attachment, so the whole post rolls back rather than being written
// with some of its media missing. It is deliberately NOT exported: in a
// "use server" module every export is a callable endpoint, and this is an internal
// control-flow signal, not one.
class MediaUnavailableError extends Error {}

// Revalidating the author's own surfaces after a write. `/u/[handle]` is included
// because a post appears on the public profile too — revalidating only `/profile`
// would leave the author's own page correct and everyone else's view of it stale.
function revalidateAuthorSurfaces(handle: string) {
  revalidatePath("/feed");
  revalidatePath("/profile");
  revalidatePath(`/u/${handle}`);
}

// Create a post, optionally attaching previously-uploaded media.
//
// Media arrives as ids the client got back from POST /api/media. Those ids are
// treated as claims, not proof: the attachment below re-derives ownership from the
// DB in the same statement that performs the write, so a caller cannot attach
// somebody else's upload by guessing an id.
export async function createPostAction(input: {
  body: string;
  mediaIds: string[];
}): Promise<ActionResult<{ postId: string }>> {
  const session = await requireSession();
  const profileId = await requireProfile(session);

  const parsed = createPostSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Write something to post.");
  const { body, mediaIds } = parsed.data;

  // A duplicated id would otherwise consume one asset and then fail the guard on
  // its second occurrence, reporting "no longer available" for something that was
  // in fact fine. Rejecting it up front makes the error honest.
  if (new Set(mediaIds).size !== mediaIds.length) {
    return fail("That photo or video is already attached to this post.");
  }

  const profile = await db.profile.findUnique({
    where: { id: profileId },
    select: { handle: true },
  });
  if (!profile) return fail("Finish setting up your profile first.");

  let postId: string;
  try {
    postId = await db.$transaction(async (tx) => {
      const post = await tx.post.create({
        data: { authorProfileId: profileId, body },
        select: { id: true },
      });

      // `updateMany` with the ownership predicate in the WHERE clause is what makes
      // this safe under concurrency: the check and the write are one statement, so
      // two simultaneous posts cannot both claim the same asset. A count of 0 means
      // the asset was missing, owned by someone else, or already attached —
      // indistinguishable to the caller on purpose, since telling them which would
      // confirm the existence of another profile's upload.
      //
      // `isAvatar: false` closes the other half of the avatar/composer overlap.
      // The sweep below already refuses to DELETE a profile picture, but without
      // this the picture was still CLAIMABLE: it is owned by the caller and is
      // postId-null, which is exactly the predicate. Its asset id is not secret
      // either — it is the `src` of the avatar <img> on the caller's own page —
      // so posting it as an attachment took nothing more than reading the DOM.
      // The result was an avatar quietly attached to a post, and then deleted
      // out from under the profile when that post was (the cascade on postId
      // fires, and Profile.avatarAssetId falls to NULL). One predicate makes
      // "an avatar is never a post attachment" total rather than half-held.
      for (const [position, id] of mediaIds.entries()) {
        const claimed = await tx.mediaAsset.updateMany({
          where: { id, ownerProfileId: profileId, postId: null, isAvatar: false },
          data: { postId: post.id, position },
        });
        if (claimed.count !== 1) throw new MediaUnavailableError();
      }

      // Abandoned-upload sweep. Anything still unattached for this profile was
      // chosen in a composer that was never submitted — the assets just claimed
      // above now carry a postId, so they are not in this set.
      //
      // The profile picture is unattached forever by design and must be excluded,
      // or posting anything would silently delete your own avatar. `isAvatar` is
      // set in the INSERT that creates it, so this is not a race with an upload
      // in flight: the row is either an avatar from the moment it exists, or it
      // never becomes one.
      await tx.mediaAsset.deleteMany({
        where: { ownerProfileId: profileId, postId: null, isAvatar: false },
      });

      return post.id;
    });
  } catch (e) {
    if (e instanceof MediaUnavailableError) {
      return fail("One of those uploads is no longer available. Try adding it again.");
    }
    throw e;
  }

  revalidateAuthorSurfaces(profile.handle);
  return ok({ postId });
}

// Delete own post. Authorship is re-derived from the DB; a non-author who forges a
// post id gets a ForbiddenError (403), not a silent no-op — consistent with how
// every other authorization violation in the app is surfaced. The media rows go
// with it via the onDelete: Cascade on MediaAsset.postId.
export async function deletePostAction(postId: string): Promise<ActionResult> {
  const session = await requireSession();
  const profileId = await requireProfile(session);

  const post = await db.post.findUnique({
    where: { id: postId },
    select: { authorProfileId: true, author: { select: { handle: true } } },
  });
  if (!post) return fail("That post is already gone.");
  if (post.authorProfileId !== profileId) throw new ForbiddenError("Not the author of this post");

  await db.post.delete({ where: { id: postId } });

  revalidateAuthorSurfaces(post.author.handle);
  return ok(undefined);
}
