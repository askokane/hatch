import type { ShareSnapshot } from "./validation/share.schema";

// Pure display derivations for share attachments. Kept free of `db` so the thread
// list (server) and the transcript (client) can both import it — the alternative
// was two places independently deciding what a share is called, which is how the
// same card ends up as "Shared a profile" in one surface and "Profile" in another.

/** Where a card points. The only link a share card ever renders. */
export function shareHref(share: ShareSnapshot): string {
  return share.kind === "PROFILE" ? `/u/${share.handle}` : `/p/${share.slug}`;
}

/**
 * One line standing in for a share where a transcript expects text — the thread
 * list preview, and anywhere else that would otherwise print an empty body.
 * `mine` picks the voice: your own row reads as something you did.
 */
export function shareSummary(share: ShareSnapshot, mine: boolean): string {
  const verb = mine ? "You shared" : "Shared";
  return share.kind === "PROFILE"
    ? `${verb} @${share.handle}`
    : `${verb} ${share.name}`;
}
