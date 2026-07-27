// Discovery ranking. A single pure function with no DB access: the query layer
// (lib/discover-queries.ts) fetches candidate roles — already excluding
// non-discoverable owners and anyone who blocked the viewer, in the WHERE clause,
// not here — then hands them to this function to score and sort.
//
// Priority order per spec, strictly descending weight:
//   1. tag overlap (highest)  2. same school  3. project recency  4. profile completeness

export type ViewerContext = {
  skillTagIds: Set<string>;
  school: string;
};

export type RankableRole = {
  id: string;
  createdAt: Date;
  requiredTagIds: string[];
  ownerSchool: string; // the role's project owner's Profile.school
  ownerProfileCompleteness: number; // 0..1, precomputed by the caller
};

export type RoleScoreBreakdown = {
  roleId: string;
  total: number;
  matchedTagIds: string[];
  tagOverlapScore: number;
  schoolScore: number;
  recencyScore: number;
  completenessScore: number;
};

// Weights sum to 100.
const WEIGHT_TAG_OVERLAP = 55;
const WEIGHT_SAME_SCHOOL = 20;
const WEIGHT_RECENCY = 15;
const WEIGHT_COMPLETENESS = 10;

const RECENCY_HALF_LIFE_DAYS = 14;

export function scoreOpenRole(role: RankableRole, viewer: ViewerContext): RoleScoreBreakdown {
  const matchedTagIds = role.requiredTagIds.filter((id) => viewer.skillTagIds.has(id));
  const overlapRatio =
    role.requiredTagIds.length === 0 ? 0 : matchedTagIds.length / role.requiredTagIds.length;
  const tagOverlapScore = overlapRatio * WEIGHT_TAG_OVERLAP;

  const schoolScore =
    role.ownerSchool && viewer.school && role.ownerSchool === viewer.school ? WEIGHT_SAME_SCHOOL : 0;

  const ageDays = (Date.now() - role.createdAt.getTime()) / (1000 * 60 * 60 * 24);
  const recencyFactor = Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS); // 1.0 at t=0, decays
  const recencyScore = recencyFactor * WEIGHT_RECENCY;

  const completenessScore = clamp01(role.ownerProfileCompleteness) * WEIGHT_COMPLETENESS;

  return {
    roleId: role.id,
    total: tagOverlapScore + schoolScore + recencyScore + completenessScore,
    matchedTagIds,
    tagOverlapScore,
    schoolScore,
    recencyScore,
    completenessScore,
  };
}

export function rankOpenRoles(
  roles: RankableRole[],
  viewer: ViewerContext
): RoleScoreBreakdown[] {
  return roles.map((r) => scoreOpenRole(r, viewer)).sort((a, b) => b.total - a.total);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

// --- Postgres GIN upgrade path (documented, not implemented) ---
// At scale, move tag-overlap candidate filtering out of an in-process table scan
// and into the DB: denormalize a `required_tag_ids text[]` column on OpenRole and
// add `CREATE INDEX role_tags_gin ON "OpenRole" USING GIN (required_tag_ids)`, then
// pre-filter with the `&&` (array overlap) operator so only candidate rows reach
// this function. The scoring math above is unchanged — only how candidates are
// fetched before being passed in.
