"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, requireProfile } from "@/lib/session";
import { reportSchema, type ReportSubjectType } from "@/lib/validation/message.schema";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import { consumeRateLimit } from "@/lib/rate-limit";

async function canReport(profileId: string, type: ReportSubjectType, id: string): Promise<boolean> {
  if (type === "PROFILE") return !!(await db.profile.findUnique({ where: { id }, select: { id: true } }));
  if (type === "PROJECT") return !!(await db.project.findFirst({ where: { id, OR: [{ visibility: "PUBLIC" }, { memberships: { some: { profileId } } }] }, select: { id: true } }));
  if (type === "POST") return !!(await db.post.findUnique({ where: { id }, select: { id: true } }));
  if (type === "THREAD") return !!(await db.threadMember.findUnique({ where: { threadId_profileId: { threadId: id, profileId } }, select: { threadId: true } }));
  if (type === "MESSAGE") return !!(await db.message.findFirst({ where: { id, thread: { members: { some: { profileId } } } }, select: { id: true } }));
  if (type === "PROJECT_CHAT") return !!(await db.projectChat.findFirst({ where: { id, project: { memberships: { some: { profileId } } } }, select: { id: true } }));
  return false;
}

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
  subjectType: ReportSubjectType;
  subjectId: string;
  reason: string;
  detail?: string;
}): Promise<ActionResult> {
  const session = await requireSession();
  const profileId = await requireProfile(session);
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid report.");

  if (!(await consumeRateLimit("report", profileId, 10, 24 * 60 * 60 * 1000))) return fail("Report limit reached. Try again later.");
  if (!(await canReport(profileId, parsed.data.subjectType, parsed.data.subjectId))) return fail("That item is not available to report.");

  const created = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`report:${profileId}:${parsed.data.subjectType}:${parsed.data.subjectId}`}))`;
    const duplicate = await tx.report.findFirst({ where: { reporterProfileId: profileId, subjectType: parsed.data.subjectType, subjectId: parsed.data.subjectId, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }, select: { id: true } });
    if (duplicate) return false;
    await tx.report.create({ data: {
      reporterProfileId: profileId,
      subjectType: parsed.data.subjectType,
      subjectId: parsed.data.subjectId,
      reason: parsed.data.reason,
      detail: parsed.data.detail ?? "",
    } });
    return true;
  });
  if (!created) return fail("You already reported this item recently.");
  return ok(undefined);
}
