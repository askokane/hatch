import { cache } from "react";
import { unstable_cache } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { rankOpenRoles, type RankableRole, type RoleScoreBreakdown } from "./ranking";

// How many rows each candidate pass may pull, and how many ranked cards the feed
// returns. Both are bounded so one busy campus cannot turn the default landing
// surface into an unbounded query.
const ROLE_CANDIDATE_LIMIT = 300;
const ROLE_FEED_MAX = 100;

// Discovery queries. Discoverability + block exclusions are applied in the WHERE
// clause here (not in the UI): non-discoverable owners and anyone who blocked the
// viewer — or whom the viewer blocked — never enter the result set.
//
// Postgres note: the tag filtering below uses joins over the tag tables, which is
// fine at SQLite/college scale. See lib/ranking.ts for the GIN-index upgrade path.

// Exported because the feed applies the identical exclusion (lib/feed-queries.ts).
// Blocking has to mean the same thing on every surface, so both read it from one
// implementation rather than each writing its own OR-pair.
//
// Memoized per request with React's `cache()`, for the same reason `getSession`
// is (see lib/session.ts): a single /discover render asks for the identical
// block set two or three times — once for the ranked role feed, once for people
// or projects — and the feed asks again on its own page. Every one of those was
// a separate round trip returning the same rows. `cache()` collapses them to one
// per request without any caller having to thread the value through.
//
// Deliberately request-scoped rather than time-cached: a block must take effect
// on the very next page load, so nothing here may outlive the request.
export const blockedProfileIds = cache(async function blockedProfileIds(
  viewerProfileId: string
): Promise<Set<string>> {
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
});

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
  owner: {
    id: string;
    handle: string;
    name: string;
    school: string;
    avatarSeed: string;
    avatarAssetId: string | null;
  };
  score: RoleScoreBreakdown;
};

// The default discovery surface: OPEN ROLES ranked against the viewer's skills.
//
// Candidate selection runs as two bounded, deterministic passes rather than one
// arbitrary slice. Previously this took 200 rows with no ORDER BY and ranked
// whatever Postgres happened to return: correct while every open role fit inside
// the limit, but past that the feed silently ranked an arbitrary subset, so the
// best-matching role on the platform could simply never appear.
//
//   Pass A — roles sharing at least one tag with the viewer's skills. Tag overlap
//            is the dominant scoring term, so these are the rows whose omission
//            would actually change the ranking. Served by RoleTag.tagId.
//   Pass B — the newest open roles regardless of tags, so a viewer with unusual
//            or missing skill tags still gets a populated feed.
//
// Both are ordered newest-first and capped, then merged, scored, and truncated.
// The scoring math in lib/ranking.ts is untouched — only which rows reach it.
export async function getRankedRoleFeed(viewer: {
  profileId: string;
  school: string;
  skillTagIds: string[];
}): Promise<RoleFeedItem[]> {
  const blocked = await blockedProfileIds(viewer.profileId);

  const visibleToViewer: Prisma.OpenRoleWhereInput = {
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
  };

  const include = {
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
                avatarAssetId: true,
                bio: true,
                onboardedAt: true,
              },
            },
          },
        },
      },
    },
  } satisfies Prisma.OpenRoleInclude;

  const [tagMatched, recent] = await Promise.all([
    viewer.skillTagIds.length > 0
      ? db.openRole.findMany({
          where: {
            ...visibleToViewer,
            tags: { some: { tagId: { in: viewer.skillTagIds } } },
          },
          include,
          orderBy: { createdAt: "desc" },
          take: ROLE_CANDIDATE_LIMIT,
        })
      : Promise.resolve([]),
    db.openRole.findMany({
      where: visibleToViewer,
      include,
      orderBy: { createdAt: "desc" },
      take: ROLE_CANDIDATE_LIMIT,
    }),
  ]);

  // Merge the passes; a role matched by both must only be scored once.
  const candidates = [...tagMatched];
  const seen = new Set(tagMatched.map((r) => r.id));
  for (const r of recent) {
    if (!seen.has(r.id)) {
      seen.add(r.id);
      candidates.push(r);
    }
  }

  const viewerSkills = new Set(viewer.skillTagIds);

  // Build rankable inputs.
  const rankable: RankableRole[] = [];
  const byId = new Map<string, (typeof candidates)[number]>();
  for (const r of candidates) {
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

  const scored = rankOpenRoles(rankable, {
    skillTagIds: viewerSkills,
    school: viewer.school,
  }).slice(0, ROLE_FEED_MAX);

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
        avatarAssetId: owner.avatarAssetId,
      },
      score: s,
    };
  });
}

// The school list populates one filter dropdown. It is a DISTINCT over every
// discoverable profile, so its cost grows with the platform while its value
// changes about as often as a new school joins — and it used to run on every
// /discover render, including the two tabs that never display it.
//
// Cached for an hour and called only from the People tab. A school that appears
// mid-window is still fully reachable: `school` is a free-text `contains` filter,
// so the dropdown is a convenience over the query param, not the only way in.
export const getDiscoverableSchools = unstable_cache(
  async (): Promise<string[]> => {
    const rows = await db.profile.findMany({
      where: { isDiscoverable: true },
      distinct: ["school"],
      select: { school: true },
      orderBy: { school: "asc" },
    });
    return rows.map((r) => r.school);
  },
  ["discoverable-schools"],
  { revalidate: 3600 }
);

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
