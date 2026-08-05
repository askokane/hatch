import { revalidatePath } from "next/cache";

// An avatar is not a page, it is a field drawn on most of them, so changing one
// invalidates more than the profile it belongs to.
//
// Shared by the upload route and the remove action so the two cannot revalidate
// different sets — the bug that produces is a picture that updates on your own
// profile and stays stale in the feed, which reads as "it didn't save".
//
// The list is the server-rendered surfaces that embed the CURRENT user's avatar.
// Pages showing other people's avatars are not invalidated from here: they would
// be an unbounded set, and they pick the new asset id up on their next load
// anyway. This is also why the asset id changes on every upload rather than the
// bytes being written in place — a stale render points at an id that still
// resolves, never at the wrong picture.
export function revalidateAvatarSurfaces(handle: string) {
  revalidatePath("/profile");
  revalidatePath(`/u/${handle}`);
  revalidatePath("/feed");
  revalidatePath("/discover");
}
