import { PrismaClient } from "@prisma/client";

// Direct DB access for tests that need real seeded IDs (authz bypass, persistence
// checks) or that need to arrange a precondition it would be wasteful to build
// through the UI. Uses the same DATABASE_URL the server runs against — always an
// isolated test schema, never production (see scripts/with-e2e-db.mjs).
export const testDb = new PrismaClient();

/**
 * A seeded pair who already connected through an OPEN-ROLE intro: they share a
 * thread, and one of them owns the project that role belongs to.
 *
 * Several scenarios need "two accounts that are already talking" as a starting
 * point without re-running the whole request/accept flow (scenario 03 already
 * proves that flow works end to end).
 */
export async function findConnectedRolePair() {
  const threads = await testDb.thread.findMany({
    where: { contextType: "ROLE" },
    include: {
      members: { include: { profile: { include: { user: true } } } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  for (const thread of threads) {
    const role = await testDb.openRole.findUnique({
      where: { id: thread.contextId },
      include: {
        project: {
          include: { memberships: { where: { isOwner: true }, include: { profile: true } } },
        },
      },
    });
    const ownerProfileId = role?.project.memberships[0]?.profile.id;
    if (!ownerProfileId) continue;

    const owner = thread.members.find((m) => m.profileId === ownerProfileId);
    const requester = thread.members.find((m) => m.profileId !== ownerProfileId);
    if (!owner || !requester) continue;

    return {
      threadId: thread.id,
      projectSlug: role.project.slug,
      roleTitle: role.title,
      owner: {
        profileId: owner.profile.id,
        email: owner.profile.user.email,
        handle: owner.profile.handle,
        name: owner.profile.name,
      },
      requester: {
        profileId: requester.profile.id,
        email: requester.profile.user.email,
        handle: requester.profile.handle,
        name: requester.profile.name,
      },
    };
  }
  return null;
}
