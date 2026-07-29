import { db } from "./db";
import { rankOpenRoles, type RankableRole, type RoleScoreBreakdown } from "./ranking";

// Discovery queries. Discoverability + block exclusions are applied in the WHERE
// clause here (not in the UI): non-discoverable owners and anyone who blocked the
// viewer — or whom the viewer blocked — never enter the result set.
//
// Postgres note: the tag filtering below uses joins over the tag tables, which is
// fine at SQLite/college scale. See lib/ranking.ts for the GIN-index upgrade path.

async function blockedProfileIds(viewerProfileId: string): Promise<Set<string>> {
  const blocks = await db.block.findMany({
    where: {
      OR: [{ blockerProfileId: viewerProfileId }, { blockedProfileId: viewerProfileId }],
    },
    select: { blockerProfileId: true, blockedProfileId: true },
  });
  const ids = new Set<string>();
  for (const b of blocks) {
    ids.add(b.blockerProfileId === viewerProfileId ? b.blockedProfileId : b.blockerProfileId);
  }
  return ids;
}

export type RoleFeedItem = {
  role: {
    id: string;
    title: string;
    description: string;
    commitment: string;
    tags: { id: string; label: string }[];
  };
  project: { slug: string; name: string; stage: string };
  // `id` is carried so callers can resolve the viewer's relationship with the
  // owner (see lib/relationship.ts) without a second lookup per card.
  owner: { id: string; handle: string; name: string; school: string; avatarSeed: string };
  score: RoleScoreBreakdown;
};

// The default discovery surface: OPEN ROLES ranked against the viewer's skills.
export async function getRankedRoleFeed(viewer: {
  profileId: string;
  school: string;
  skillTagIds: string[];
}): Promise<RoleFeedItem[]> {
  const blocked = await blockedProfileIds(viewer.profileId);

  const roles = await db.openRole.findMany({
    where: {
      status: "OPEN",
      project: {
        visibility: "PUBLIC",
        // owner must be discoverable and not blocked
        memberships: {
          some: {
            isOwner: true,
            profile: {
              isDiscoverable: true,
              id: { notIn: [...blocked, viewer.profileId] },
            },
          },
        },
      },
    },
    include: {
      tags: { include: { tag: { select: { id: true, label: true } } } },
      project: {
        select: {
          slug: true,
          name: true,
          stage: true,
          memberships: {
            where: { isOwner: true },
            include: {
              profile: {
                select: {
                  id: true,
                  handle: true,
                  name: true,
                  school: true,
                  avatarSeed: true,
                  bio: true,
                  onboardedAt: true,
                },
              },
            },
          },
        },
      },
    },
    take: 200,
  });

  const viewerSkills = new Set(viewer.skillTagIds);

  // Build rankable inputs.
  const rankable: RankableRole[] = [];
  const byId = new Map<string, (typeof roles)[number]>();
  for (const r of roles) {
    const owner = r.project.memberships[0]?.profile;
    if (!owner) continue;
    byId.set(r.id, r);
    // Simple completeness proxy: has bio + onboarded.
    const completeness = (owner.bio ? 0.6 : 0.3) + (owner.onboardedAt ? 0.4 : 0);
    rankable.push({
      id: r.id,
      createdAt: r.createdAt,
      requiredTagIds: r.tags.map((t) => t.tag.id),
      ownerSchool: owner.school,
      ownerProfileCompleteness: Math.min(1, completeness),
    });
  }

  const scored = rankOpenRoles(rankable, { skillTagIds: viewerSkills, school: viewer.school });

  return scored.map((s) => {
    const r = byId.get(s.roleId)!;
    const owner = r.project.memberships[0]!.profile;
    return {
      role: {
        id: r.id,
        title: r.title,
        description: r.description,
        commitment: r.commitment,
        tags: r.tags.map((t) => ({ id: t.tag.id, label: t.tag.label })),
      },
      project: { slug: r.project.slug, name: r.project.name, stage: r.project.stage },
      owner: {
        id: owner.id,
        handle: owner.handle,
        name: owner.name,
        school: owner.school,
        avatarSeed: owner.avatarSeed,
      },
      score: s,
    };
  });
}

export type PeopleFilters = {
  q?: string;
  skillTagId?: string;
  school?: string;
  gradYear?: number;
  intent?: string;
};

export async function getPeople(
  viewer: { profileId: string },
  filters: PeopleFilters
) {
  const blocked = await blockedProfileIds(viewer.profileId);

  return db.profile.findMany({
    where: {
      isDiscoverable: true,
      id: { notIn: [...blocked, viewer.profileId] },
      ...(filters.school ? { school: { contains: filters.school, mode: "insensitive" as const } } : {}),
      ...(filters.gradYear ? { gradYear: filters.gradYear } : {}),
      ...(filters.q ? { bio: { contains: filters.q, mode: "insensitive" as const } } : {}),
      ...(filters.skillTagId
        ? { tags: { some: { tagId: filters.skillTagId, relation: "HAS" } } }
        : {}),
      ...(filters.intent ? { intents: { some: { kind: filters.intent as never } } } : {}),
    },
    include: {
      tags: { include: { tag: { select: { id: true, label: true } } } },
      intents: { select: { kind: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 60,
  });
}

export type ProjectFilters = { stage?: string; tagId?: string };

export async function getProjects(
  viewer: { profileId: string },
  filters: ProjectFilters
) {
  const blocked = await blockedProfileIds(viewer.profileId);

  return db.project.findMany({
    where: {
      visibility: "PUBLIC",
      closedAt: null,
      // exclude projects whose owner blocked / is blocked by the viewer
      memberships: {
        some: { isOwner: true, profile: { id: { notIn: [...blocked] } } },
      },
      ...(filters.stage ? { stage: filters.stage as never } : {}),
      ...(filters.tagId ? { tags: { some: { tagId: filters.tagId } } } : {}),
    },
    include: {
      tags: { include: { tag: { select: { id: true, label: true } } } },
      _count: { select: { memberships: true, openRoles: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
}
