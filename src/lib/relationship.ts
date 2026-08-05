import { db } from "./db";

// One source of truth for "where do I stand with this person?".
//
// Before this existed, every surface answered the question locally and only
// partially: a project page asked "am I a member?", a profile page asked
// nothing at all. So a pair who had already connected and were actively
// messaging still saw a bare "Request intro" button on projects and in
// discovery. Each surface now reads the same computed relationship, so a state
// change in one place is reflected everywhere.
//
// Two deliberately separate axes:
//
//   `connection` — the intro-request lifecycle (none → pending → connected).
//   the block flags — moderation state, which is NOT symmetric in what it
//   reveals. `viewerBlockedThem` is the viewer's own action and is shown to
//   them plainly. `theyBlockedViewer` must never be rendered: the blocked party
//   is only ever prevented from acting, never told. Callers therefore use it
//   solely to withhold affordances, and any resulting error text stays generic.

export type ConnectionState = "NONE" | "PENDING_OUTBOUND" | "PENDING_INBOUND" | "CONNECTED";

export type Relationship = {
  targetProfileId: string;
  self: boolean;
  connection: ConnectionState;
  /** Set when `connection` is CONNECTED. */
  threadId: string | null;
  /** The viewer blocked this person. Safe — and intended — to show the viewer. */
  viewerBlockedThem: boolean;
  /** This person blocked the viewer. NEVER render this or anything implying it. */
  theyBlockedViewer: boolean;
  /** True only when a fresh intro request is actually possible. */
  canRequestIntro: boolean;
};

/**
 * A relationship with nobody in particular: no connection and — importantly —
 * no intro affordance. Used where the counterpart cannot be resolved at all
 * (e.g. a project with no owner row), so the UI degrades to offering nothing
 * rather than to offering an action that would fail.
 */
export function noRelationship(targetProfileId = ""): Relationship {
  return {
    targetProfileId,
    self: false,
    connection: "NONE",
    threadId: null,
    viewerBlockedThem: false,
    theyBlockedViewer: false,
    canRequestIntro: false,
  };
}

function emptyRelationship(targetProfileId: string, self: boolean): Relationship {
  return { ...noRelationship(targetProfileId), self, canRequestIntro: !self };
}

/**
 * Batch form — resolves the viewer's relationship with many profiles in a fixed
 * number of queries, so feeds stay O(1) in round-trips rather than O(rows).
 */
export async function getRelationships(
  viewerProfileId: string,
  targetProfileIds: string[]
): Promise<Map<string, Relationship>> {
  const targets = [...new Set(targetProfileIds.filter(Boolean))];
  const out = new Map<string, Relationship>();
  for (const id of targets) out.set(id, emptyRelationship(id, id === viewerProfileId));
  if (targets.length === 0) return out;

  const others = targets.filter((id) => id !== viewerProfileId);
  if (others.length === 0) return out;

  const [myThreadMemberships, pendingRequests, blocks] = await Promise.all([
    db.threadMember.findMany({
      where: { profileId: viewerProfileId },
      select: { threadId: true },
    }),
    db.introRequest.findMany({
      where: {
        status: "PENDING",
        OR: [
          { fromProfileId: viewerProfileId, toProfileId: { in: others } },
          { toProfileId: viewerProfileId, fromProfileId: { in: others } },
        ],
      },
      select: { fromProfileId: true, toProfileId: true },
    }),
    db.block.findMany({
      where: {
        OR: [
          { blockerProfileId: viewerProfileId, blockedProfileId: { in: others } },
          { blockedProfileId: viewerProfileId, blockerProfileId: { in: others } },
        ],
      },
      select: { blockerProfileId: true, blockedProfileId: true },
    }),
  ]);

  // A thread connects the pair only if BOTH are members of it.
  const myThreadIds = myThreadMemberships.map((m) => m.threadId);
  const sharedThreads = myThreadIds.length
    ? await db.threadMember.findMany({
        where: { threadId: { in: myThreadIds }, profileId: { in: others } },
        select: { threadId: true, profileId: true },
      })
    : [];

  for (const t of sharedThreads) {
    const rel = out.get(t.profileId);
    if (!rel) continue;
    rel.connection = "CONNECTED";
    rel.threadId = t.threadId;
  }

  for (const r of pendingRequests) {
    const outbound = r.fromProfileId === viewerProfileId;
    const otherId = outbound ? r.toProfileId : r.fromProfileId;
    const rel = out.get(otherId);
    // An accepted thread already answers the question; a stray PENDING row must
    // not downgrade a live connection back to "pending".
    if (!rel || rel.connection === "CONNECTED") continue;
    rel.connection = outbound ? "PENDING_OUTBOUND" : "PENDING_INBOUND";
  }

  for (const b of blocks) {
    const isBlocker = b.blockerProfileId === viewerProfileId;
    const otherId = isBlocker ? b.blockedProfileId : b.blockerProfileId;
    const rel = out.get(otherId);
    if (!rel) continue;
    if (isBlocker) rel.viewerBlockedThem = true;
    else rel.theyBlockedViewer = true;
  }

  for (const rel of out.values()) {
    rel.canRequestIntro =
      !rel.self &&
      rel.connection === "NONE" &&
      !rel.viewerBlockedThem &&
      !rel.theyBlockedViewer;
  }

  return out;
}

/** Single-target convenience wrapper. */
export async function getRelationship(
  viewerProfileId: string,
  targetProfileId: string
): Promise<Relationship> {
  const map = await getRelationships(viewerProfileId, [targetProfileId]);
  return map.get(targetProfileId) ?? emptyRelationship(targetProfileId, targetProfileId === viewerProfileId);
}

export type BlockedProfile = {
  profileId: string;
  handle: string;
  name: string;
  avatarSeed: string;
  avatarAssetId: string | null;
  blockedAt: Date;
};

/** The viewer's own block list, for the management UI in settings. */
export async function getBlockedProfiles(viewerProfileId: string): Promise<BlockedProfile[]> {
  const rows = await db.block.findMany({
    where: { blockerProfileId: viewerProfileId },
    include: {
      blocked: {
        select: { id: true, handle: true, name: true, avatarSeed: true, avatarAssetId: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({
    profileId: r.blocked.id,
    handle: r.blocked.handle,
    name: r.blocked.name,
    avatarSeed: r.blocked.avatarSeed,
    avatarAssetId: r.blocked.avatarAssetId,
    blockedAt: r.createdAt,
  }));
}
