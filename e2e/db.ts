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

/**
 * A seeded project with at least three members, plus somebody who is NOT on it.
 *
 * The group-chat scenarios need a real team rather than a pair: "hide the person
 * I blocked" and "everyone else still sees them" are the same assertion in a room
 * of two, and only come apart with a third person in it.
 */
export async function findTeamProject() {
  // findMany + pick, NOT findFirst + reject.
  //
  // "At least three members" cannot be expressed in a Prisma `where`, so the
  // size test has to happen after the rows come back. Doing that against
  // findFirst asks the database for ONE project and then throws it away if it is
  // too small — which reports "no suitable project exists" whenever the first
  // project alphabetically happens to be a pair, even though several qualifying
  // projects are sitting right behind it. Ordering by slug for determinism made
  // that misfire every single run rather than occasionally.
  const projects = await testDb.project.findMany({
    where: { memberships: { some: {} }, closedAt: null },
    // By slug, not by createdAt: the seed stamps every project with the same
    // relative age, so ordering on the timestamp picks an arbitrary one of them
    // and a failure would be reproducible only by luck.
    orderBy: { slug: "asc" },
    include: {
      memberships: {
        orderBy: { isOwner: "desc" },
        include: { profile: { include: { user: true } } },
      },
    },
  });

  const project = projects.find((p) => p.memberships.length >= 3);
  if (!project) return null;

  const memberIds = project.memberships.map((m) => m.profileId);
  const outsider = await testDb.profile.findFirst({
    where: { id: { notIn: memberIds } },
    include: { user: true },
  });
  if (!outsider) return null;

  const person = (m: (typeof project.memberships)[number]) => ({
    profileId: m.profileId,
    membershipId: m.id,
    email: m.profile.user.email,
    handle: m.profile.handle,
    name: m.profile.name,
    isOwner: m.isOwner,
  });

  return {
    projectId: project.id,
    slug: project.slug,
    name: project.name,
    owner: person(project.memberships[0]),
    second: person(project.memberships[1]),
    third: person(project.memberships[2]),
    outsider: {
      profileId: outsider.id,
      email: outsider.user.email,
      handle: outsider.handle,
      name: outsider.name,
    },
  };
}

/** The project group chat composer, targeted by its own accessible name. */
export const CHAT_COMPOSER_NAME = "Message the team";
