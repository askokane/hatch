import { db } from "./db";
import { blockedProfileIds } from "./discover-queries";
import { extractMentionHandles, type MentionCandidate } from "./mentions";
import { MENTION_SUGGESTION_LIMIT } from "./constants";

// Who a post may name, and who it actually named.
//
// Like messages-core.ts and share-core.ts, this sits OUTSIDE a "use server"
// module on purpose: every export of one of those is a callable endpoint, so a
// helper there taking `profileId` as an argument would let the client name
// whoever it liked as the author. Here the parameter is safe because the only
// way in is a caller that read it off the session.
//
// THE RULE, ONCE: you may mention someone you are CONNECTED to — an accepted
// intro request, which is to say a thread you both belong to — and a block in
// either direction disqualifies. Both the suggestion list and the write path go
// through connectedProfileIds() below, so the list can never offer somebody the
// write path would then refuse, and the write path never trusts the list.

// Defined in lib/mentions.ts, with the rest of the feature's client-safe half.
export type { MentionCandidate } from "./mentions";

/**
 * Every profile this one shares a thread with, minus blocks in either direction.
 *
 * Two queries rather than a join through Thread: the first is a covering read of
 * this profile's own membership rows (small — one per accepted intro), and the
 * second finds the counterparts. Going the other way, "threads whose members
 * include me", makes the planner walk every thread.
 */
async function connectedProfileIds(profileId: string): Promise<string[]> {
  const [myThreads, blocked] = await Promise.all([
    db.threadMember.findMany({ where: { profileId }, select: { threadId: true } }),
    blockedProfileIds(profileId),
  ]);
  if (myThreads.length === 0) return [];

  const counterparts = await db.threadMember.findMany({
    where: {
      threadId: { in: myThreads.map((t) => t.threadId) },
      profileId: { not: profileId },
    },
    select: { profileId: true },
  });

  const ids = new Set<string>();
  for (const c of counterparts) {
    if (!blocked.has(c.profileId)) ids.add(c.profileId);
  }
  return [...ids];
}

/**
 * The suggestion list behind "@" in the composer.
 *
 * An empty query is legitimate and returns the whole (small) connection list —
 * that is the moment just after "@" is typed, when the useful thing to show is
 * who you could name at all, not nothing.
 */
export async function listMentionCandidates(
  profileId: string,
  query: string
): Promise<MentionCandidate[]> {
  const connected = await connectedProfileIds(profileId);
  if (connected.length === 0) return [];

  const q = query.trim().toLowerCase();

  // Over-fetch, then rank in memory. The database can filter but it cannot cheaply
  // express "handle prefix beats name prefix beats a match in the middle", and the
  // candidate set here is bounded by the number of people who have accepted an
  // intro from this profile — small enough that the sort is free.
  const rows = await db.profile.findMany({
    where: {
      id: { in: connected },
      ...(q
        ? {
            OR: [
              { handle: { contains: q, mode: "insensitive" } },
              { name: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: { id: true, handle: true, name: true, avatarSeed: true, avatarAssetId: true },
    orderBy: { name: "asc" },
    take: MENTION_SUGGESTION_LIMIT * 4,
  });

  // Typing "al" should surface @alice before @michael_alvarez. Rank is a small
  // integer per row, and ties keep the alphabetical order the query returned.
  function rank(row: { handle: string; name: string }): number {
    if (!q) return 0;
    if (row.handle.toLowerCase().startsWith(q)) return 0;
    if (row.name.toLowerCase().startsWith(q)) return 1;
    if (row.name.toLowerCase().split(/\s+/).some((word) => word.startsWith(q))) return 2;
    return 3;
  }

  return rows
    .map((r, i) => ({ r, i, rank: rank(r) }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .slice(0, MENTION_SUGGESTION_LIMIT)
    .map(({ r }) => ({
      profileId: r.id,
      handle: r.handle,
      name: r.name,
      avatarSeed: r.avatarSeed,
      avatarAssetId: r.avatarAssetId,
    }));
}

export type ResolvedMentionRow = { profileId: string; handle: string };

/**
 * The mentions a body is allowed to create, resolved from the body text alone.
 *
 * Nothing about the mention crosses the wire inbound — the client sends the same
 * body it always did, and which "@word"s in it are real is decided here. That is
 * what stops a crafted request from attaching a stranger (or a whole directory)
 * to a post, and it is why the composer's suggestion list can stay a convenience
 * rather than a security boundary.
 *
 * Handles that resolve to nobody, to somebody not connected, or to somebody on
 * either side of a block are simply left out; they stay literal text in the body.
 * Silence is the right failure here — the alternative is an error message that
 * confirms whether a given handle exists and whether that person has blocked you.
 */
export async function resolveMentionsForBody(
  authorProfileId: string,
  body: string
): Promise<ResolvedMentionRow[]> {
  const handles = extractMentionHandles(body);
  if (handles.length === 0) return [];

  const connected = await connectedProfileIds(authorProfileId);
  if (connected.length === 0) return [];

  const rows = await db.profile.findMany({
    where: { handle: { in: handles }, id: { in: connected } },
    select: { id: true, handle: true },
  });

  return rows.map((r) => ({ profileId: r.id, handle: r.handle }));
}
