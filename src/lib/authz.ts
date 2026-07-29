import { db } from "./db";

// Authorization helpers. The core rule: never trust a client-supplied ID as
// proof of ownership/membership. Every helper re-derives the relationship from
// the DB using the caller's own profileId. On failure they throw ForbiddenError,
// which action/route wrappers convert into a 403 or redirect — never data.

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

// Asserts the profile is a member of the project; returns the membership.
export async function assertProjectMember(projectId: string, profileId: string) {
  const membership = await db.membership.findUnique({
    where: { projectId_profileId: { projectId, profileId } },
  });
  if (!membership) throw new ForbiddenError("Not a member of this project");
  return membership;
}

// Asserts the profile is an owner of the project; returns the membership.
export async function assertProjectOwner(projectId: string, profileId: string) {
  const membership = await db.membership.findUnique({
    where: { projectId_profileId: { projectId, profileId } },
  });
  if (!membership || !membership.isOwner) throw new ForbiddenError("Not an owner of this project");
  return membership;
}

// Asserts the profile is a member of the thread; returns the thread member row.
export async function assertThreadMember(threadId: string, profileId: string) {
  const member = await db.threadMember.findUnique({
    where: { threadId_profileId: { threadId, profileId } },
  });
  if (!member) throw new ForbiddenError("Not a member of this thread");
  return member;
}

export type BlockState = {
  /** `viewer` blocked `other`. Safe to show the viewer — it was their action. */
  viewerBlockedThem: boolean;
  /** `other` blocked `viewer`. Never disclose; use only to withhold actions. */
  theyBlockedViewer: boolean;
  /** Either direction — the symmetric check used for access decisions. */
  either: boolean;
};

// Resolves the block relationship in ONE query, keeping the two directions
// distinct. They have to stay distinct because they are not equally disclosable:
// a user may be told whom they blocked, but must never be told they were
// blocked. Callers that only need an access decision use `either`.
export async function getBlockState(viewer: string, other: string): Promise<BlockState> {
  const blocks = await db.block.findMany({
    where: {
      OR: [
        { blockerProfileId: viewer, blockedProfileId: other },
        { blockerProfileId: other, blockedProfileId: viewer },
      ],
    },
    select: { blockerProfileId: true },
  });
  const viewerBlockedThem = blocks.some((b) => b.blockerProfileId === viewer);
  const theyBlockedViewer = blocks.some((b) => b.blockerProfileId === other);
  return { viewerBlockedThem, theyBlockedViewer, either: blocks.length > 0 };
}

// True if either profile has blocked the other (bidirectional in effect).
export async function isBlockedEitherWay(a: string, b: string): Promise<boolean> {
  return (await getBlockState(a, b)).either;
}
