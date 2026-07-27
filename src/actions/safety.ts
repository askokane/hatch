"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, requireProfile } from "@/lib/session";
import { reportSchema } from "@/lib/validation/message.schema";
import { ok, fail, type ActionResult } from "@/lib/action-result";

// Block a profile. The actor is always the caller (session.profileId) — never a
// client-supplied blocker ID. Blocking is bidirectional in effect (enforced in
// discovery queries and message/request actions that check isBlockedEitherWay).
export async function blockUserAction(blockedProfileId: string): Promise<ActionResult> {
  const session = await requireSession();
  const profileId = await requireProfile(session);
  if (blockedProfileId === profileId) return fail("You cannot block yourself.");

  const target = await db.profile.findUnique({ where: { id: blockedProfileId }, select: { id: true } });
  if (!target) return fail("That profile does not exist.");

  await db.block.upsert({
    where: {
      blockerProfileId_blockedProfileId: { blockerProfileId: profileId, blockedProfileId },
    },
    create: { blockerProfileId: profileId, blockedProfileId },
    update: {},
  });
  revalidatePath("/discover");
  revalidatePath("/messages");
  return ok(undefined);
}

export async function unblockUserAction(blockedProfileId: string): Promise<ActionResult> {
  const session = await requireSession();
  const profileId = await requireProfile(session);
  await db.block.deleteMany({
    where: { blockerProfileId: profileId, blockedProfileId },
  });
  revalidatePath("/discover");
  return ok(undefined);
}

// File a report. Reporter is always the caller.
export async function reportAction(input: {
  subjectType: "PROFILE" | "PROJECT" | "MESSAGE" | "THREAD";
  subjectId: string;
  reason: string;
  detail?: string;
}): Promise<ActionResult> {
  const session = await requireSession();
  const profileId = await requireProfile(session);
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid report.");

  await db.report.create({
    data: {
      reporterProfileId: profileId,
      subjectType: parsed.data.subjectType,
      subjectId: parsed.data.subjectId,
      reason: parsed.data.reason,
      detail: parsed.data.detail ?? "",
    },
  });
  return ok(undefined);
}
