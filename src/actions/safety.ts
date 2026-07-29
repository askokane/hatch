"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, requireProfile } from "@/lib/session";
import { reportSchema } from "@/lib/validation/message.schema";
import { ok, fail, type ActionResult } from "@/lib/action-result";

// Every surface that can change with a block. Blocking alters discovery, the
// thread composer, request affordances, and the settings block list, so all of
// them are revalidated together rather than each caller remembering a subset.
function revalidateBlockSurfaces() {
  revalidatePath("/discover");
  revalidatePath("/messages");
  revalidatePath("/requests");
  revalidatePath("/settings");
}

// Block a profile. The actor is always the caller (session.profileId) — never a
// client-supplied blocker ID.
//
// A block is one-directional in what it DISCLOSES and bidirectional in what it
// PREVENTS. The blocker is shown the block plainly and can lift it from settings;
// the blocked person is only ever stopped from acting and is never told. See
// lib/relationship.ts, which keeps the two directions apart for exactly this.
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

  // A block should not leave a pending invitation hanging between the two. Only
  // requests involving the caller are touched, in either direction.
  await db.introRequest.updateMany({
    where: {
      status: "PENDING",
      OR: [
        { fromProfileId: profileId, toProfileId: blockedProfileId },
        { fromProfileId: blockedProfileId, toProfileId: profileId },
      ],
    },
    data: { status: "DECLINED", respondedAt: new Date() },
  });

  revalidateBlockSurfaces();
  return ok(undefined);
}

export async function unblockUserAction(blockedProfileId: string): Promise<ActionResult> {
  const session = await requireSession();
  const profileId = await requireProfile(session);
  await db.block.deleteMany({
    where: { blockerProfileId: profileId, blockedProfileId },
  });
  revalidateBlockSurfaces();
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
