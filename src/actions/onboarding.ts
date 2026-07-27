"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { newAvatarSeed } from "@/lib/avatar";
import { onboardingSchema } from "@/lib/validation/profile.schema";
import { ok, fail, type ActionResult } from "@/lib/action-result";

type OnboardingInput = {
  name: string;
  handle: string;
  school: string;
  gradYear: number;
  bio: string;
  skillTagIds: string[];
  learningTagIds: string[];
  intents: { kind: string; note: string }[];
};

// Creates the Profile after signup. Rejects if a profile already exists (can't
// onboard twice). All minimums are re-validated server-side regardless of client
// step gating.
export async function completeOnboardingAction(
  input: OnboardingInput
): Promise<ActionResult<{ handle: string }>> {
  const session = await requireSession();

  if (session.profileId) {
    return fail("You have already completed onboarding.");
  }

  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Please complete all fields.");
  }
  const data = parsed.data;

  // Verify all referenced tags actually exist as Tag rows (never trust client IDs).
  const allTagIds = [...new Set([...data.skillTagIds, ...data.learningTagIds])];
  const existingTags = await db.tag.findMany({
    where: { id: { in: allTagIds } },
    select: { id: true },
  });
  const existingIds = new Set(existingTags.map((t) => t.id));
  const skillIds = data.skillTagIds.filter((id) => existingIds.has(id));
  const learningIds = data.learningTagIds.filter((id) => existingIds.has(id));
  if (skillIds.length < 3 || learningIds.length < 1) {
    return fail("Some selected tags were not recognized. Please re-pick them.");
  }

  // Handle uniqueness (case-insensitive since we lowercase on input).
  const handleTaken = await db.profile.findUnique({ where: { handle: data.handle } });
  if (handleTaken) {
    return fail("That handle is taken. Choose another.", { handle: "That handle is taken." });
  }

  try {
    await db.profile.create({
      data: {
        userId: session.userId,
        handle: data.handle,
        name: data.name,
        school: data.school,
        gradYear: data.gradYear,
        bio: data.bio ?? "",
        avatarSeed: newAvatarSeed(),
        onboardedAt: new Date(),
        tags: {
          create: [
            ...skillIds.map((tagId) => ({ tagId, relation: "HAS" as const })),
            ...learningIds.map((tagId) => ({ tagId, relation: "LEARNING" as const })),
          ],
        },
        intents: {
          create: data.intents.map((i) => ({ kind: i.kind as never, note: i.note ?? "" })),
        },
      },
    });
  } catch {
    return fail("Could not create your profile. The handle may have just been taken.");
  }

  redirect("/discover");
}
