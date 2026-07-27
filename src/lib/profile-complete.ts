import { db } from "./db";
import { MIN_SKILL_TAGS, MIN_LEARNING_TAGS, MIN_INTENTS } from "./constants";

// A profile is "complete" once onboarding has been satisfied: name/handle/school,
// >=3 skill tags, >=1 learning tag, >=1 intent. Used to gate discovery access and
// intro-request sending, and (as a 0..1 fraction) as a ranking signal.

export type Completeness = {
  isComplete: boolean;
  fraction: number; // 0..1
};

export async function getProfileCompleteness(profileId: string): Promise<Completeness> {
  const [skillCount, learningCount, intentCount, profile] = await Promise.all([
    db.profileTag.count({ where: { profileId, relation: "HAS" } }),
    db.profileTag.count({ where: { profileId, relation: "LEARNING" } }),
    db.intent.count({ where: { profileId } }),
    db.profile.findUnique({ where: { id: profileId }, select: { name: true, school: true, bio: true, onboardedAt: true } }),
  ]);

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
