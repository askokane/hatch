import { db } from "./db";
import { MIN_SKILL_TAGS, MIN_LEARNING_TAGS, MIN_INTENTS } from "./constants";

// A profile is "complete" once onboarding has been satisfied: name/handle/school,
// >=3 skill tags, >=1 learning tag, >=1 intent. Used to gate discovery access and
// intro-request sending, and (as a 0..1 fraction) as a ranking signal.

export type Completeness = {
  isComplete: boolean;
  fraction: number; // 0..1
};

// One round trip, not four.
//
// This used to issue three counts plus a profile read under a Promise.all, which
// looked parallel and was not: the database sits a long way from anything that
// isn't a colocated server, so four round trips cost four times the latency, and
// under the session-mode pooler they could not even open four connections to run
// concurrently. Reading the tag rows and counting them here trades a few bytes
// for three fewer round trips — a profile holds a handful of tags by
// construction (MIN_SKILL_TAGS is 3), so there is nothing to stream.
//
// The counts are not done with Prisma's `_count` because both live on the same
// `tags` relation under different `relation` values, and a filtered relation
// count cannot be selected twice under two names.
export async function getProfileCompleteness(profileId: string): Promise<Completeness> {
  const profile = await db.profile.findUnique({
    where: { id: profileId },
    select: {
      name: true,
      school: true,
      bio: true,
      onboardedAt: true,
      tags: { select: { relation: true } },
      _count: { select: { intents: true } },
    },
  });

  let skillCount = 0;
  let learningCount = 0;
  for (const t of profile?.tags ?? []) {
    if (t.relation === "HAS") skillCount++;
    else if (t.relation === "LEARNING") learningCount++;
  }
  const intentCount = profile?._count.intents ?? 0;

  const checks = [
    !!profile?.name,
    !!profile?.school,
    skillCount >= MIN_SKILL_TAGS,
    learningCount >= MIN_LEARNING_TAGS,
    intentCount >= MIN_INTENTS,
    !!profile?.bio && profile.bio.length > 0,
  ];
  const passed = checks.filter(Boolean).length;
  const fraction = passed / checks.length;

  const isComplete =
    !!profile?.onboardedAt &&
    !!profile?.name &&
    !!profile?.school &&
    skillCount >= MIN_SKILL_TAGS &&
    learningCount >= MIN_LEARNING_TAGS &&
    intentCount >= MIN_INTENTS;

  return { isComplete, fraction };
}
