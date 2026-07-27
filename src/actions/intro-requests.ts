"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, requireProfile } from "@/lib/session";
import { isBlockedEitherWay } from "@/lib/authz";
import { getProfileCompleteness } from "@/lib/profile-complete";
import { introRequestSchema } from "@/lib/validation/intro-request.schema";
import { MAX_PENDING_OUTBOUND } from "@/lib/constants";
import { ok, fail, type ActionResult } from "@/lib/action-result";

// Verifies that the given context (ROLE | PROJECT | INTENT) exists AND belongs to
// the recipient. This is what prevents messaging a stranger with no context.
async function contextBelongsToRecipient(
  contextType: "ROLE" | "PROJECT" | "INTENT",
  contextId: string,
  recipientProfileId: string
): Promise<boolean> {
  if (contextType === "INTENT") {
    const intent = await db.intent.findUnique({ where: { id: contextId }, select: { profileId: true } });
    return intent?.profileId === recipientProfileId;
  }
  if (contextType === "PROJECT") {
    const membership = await db.membership.findFirst({
      where: { projectId: contextId, profileId: recipientProfileId, isOwner: true },
      select: { id: true },
    });
    return !!membership;
  }
  // ROLE: the role's project must be owned by the recipient.
  const role = await db.openRole.findUnique({
    where: { id: contextId },
    select: { project: { select: { memberships: { where: { isOwner: true }, select: { profileId: true } } } } },
  });
  return !!role?.project.memberships.some((m) => m.profileId === recipientProfileId);
}

export async function createIntroRequestAction(input: {
  toProfileId: string;
  contextType: "ROLE" | "PROJECT" | "INTENT";
  contextId: string;
  note: string;
}): Promise<ActionResult> {
  const session = await requireSession();
  const fromProfileId = await requireProfile(session);

  const parsed = introRequestSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid request.");
  const { toProfileId, contextType, contextId, note } = parsed.data;

  // (0) cannot request yourself
  if (toProfileId === fromProfileId) return fail("You cannot request an intro to yourself.");

  // (1) sender must have a verified email
  if (!session.emailVerifiedAt) {
    return fail("Verify your email before sending intro requests.");
  }

  // (2) sender must have a complete profile
  const completeness = await getProfileCompleteness(fromProfileId);
  if (!completeness.isComplete) {
    return fail("Complete your profile before sending intro requests.");
  }

  // recipient must exist
  const recipient = await db.profile.findUnique({ where: { id: toProfileId }, select: { id: true } });
  if (!recipient) return fail("That profile does not exist.");

  // (3) note length is enforced by the schema (40–500)

  // (4) context must belong to the recipient
  const contextOk = await contextBelongsToRecipient(contextType, contextId, toProfileId);
  if (!contextOk) {
    return fail("That context doesn't belong to this person.");
  }

  // (5) neither party may have blocked the other
  if (await isBlockedEitherWay(fromProfileId, toProfileId)) {
    return fail("You can't send a request to this person.");
  }

  // (6) at most one PENDING request between the pair in either direction
  const existingPending = await db.introRequest.findFirst({
    where: {
      status: "PENDING",
      OR: [
        { fromProfileId, toProfileId },
        { fromProfileId: toProfileId, toProfileId: fromProfileId },
      ],
    },
    select: { id: true },
  });
  if (existingPending) {
    return fail("There's already a pending request between you two.");
  }

  // (7) at most 5 pending outbound requests
  const outboundPending = await db.introRequest.count({
    where: { fromProfileId, status: "PENDING" },
  });
  if (outboundPending >= MAX_PENDING_OUTBOUND) {
    return fail(`You can have at most ${MAX_PENDING_OUTBOUND} pending outbound requests.`);
  }

  await db.introRequest.create({
    data: { fromProfileId, toProfileId, contextType, contextId, note },
  });
  revalidatePath("/requests");
  return ok(undefined);
}

// Accept a request. Only the recipient (toProfileId) may accept — re-fetched and
// compared, never trusted from the client. Creates the Thread + both members.
export async function acceptIntroRequestAction(requestId: string): Promise<ActionResult<{ threadId: string }>> {
  const session = await requireSession();
  const profileId = await requireProfile(session);

  const request = await db.introRequest.findUnique({ where: { id: requestId } });
  if (!request) return fail("Request not found.");
  if (request.toProfileId !== profileId) return fail("You can't respond to this request.");
  if (request.status !== "PENDING") return fail("This request has already been answered.");

  // Blocking makes acceptance impossible.
  if (await isBlockedEitherWay(request.fromProfileId, request.toProfileId)) {
    return fail("You can't accept a request from someone you've blocked.");
  }

  const thread = await db.$transaction(async (tx) => {
    await tx.introRequest.update({
      where: { id: requestId },
      data: { status: "ACCEPTED", respondedAt: new Date() },
    });
    const t = await tx.thread.create({
      data: {
        introRequestId: request.id,
        contextType: request.contextType,
        contextId: request.contextId,
        members: {
          create: [
            { profileId: request.fromProfileId },
            { profileId: request.toProfileId },
          ],
        },
      },
    });
    return t;
  });

  revalidatePath("/requests");
  revalidatePath("/messages");
  return ok({ threadId: thread.id });
}

// Decline a request. Only the recipient may decline. Terminal for this request,
// but a future request with a different context is allowed (only PENDING blocks).
export async function declineIntroRequestAction(requestId: string): Promise<ActionResult> {
  const session = await requireSession();
  const profileId = await requireProfile(session);

  const request = await db.introRequest.findUnique({ where: { id: requestId } });
  if (!request) return fail("Request not found.");
  if (request.toProfileId !== profileId) return fail("You can't respond to this request.");
  if (request.status !== "PENDING") return fail("This request has already been answered.");

  await db.introRequest.update({
    where: { id: requestId },
    data: { status: "DECLINED", respondedAt: new Date() },
  });
  revalidatePath("/requests");
  return ok(undefined);
}
