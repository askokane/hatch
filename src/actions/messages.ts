"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, requireProfile } from "@/lib/session";
import { assertThreadMember, isBlockedEitherWay } from "@/lib/authz";
import { messageSchema } from "@/lib/validation/message.schema";
import { ok, fail, type ActionResult } from "@/lib/action-result";

export type MessageDTO = {
  id: string;
  body: string;
  createdAt: string;
  authorProfileId: string;
  authorHandle: string;
  authorName: string;
};

// Shared send logic used by both the server action and the POST route handler,
// so there is exactly one source of truth for the authorization + block checks.
export async function sendMessageCore(
  threadId: string,
  profileId: string,
  body: string
): Promise<ActionResult<MessageDTO>> {
  await assertThreadMember(threadId, profileId);

  const parsed = messageSchema.safeParse({ body });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Write a message.");

  // Blocking makes an existing thread read-only: find the other member and check.
  const members = await db.threadMember.findMany({
    where: { threadId },
    select: { profileId: true },
  });
  const other = members.find((m) => m.profileId !== profileId);
  if (other && (await isBlockedEitherWay(profileId, other.profileId))) {
    return fail("This conversation is read-only because a block is in place.");
  }

  const message = await db.message.create({
    data: { threadId, authorProfileId: profileId, body: parsed.data.body },
    include: { author: { select: { handle: true, name: true } } },
  });

  return ok({
    id: message.id,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    authorProfileId: message.authorProfileId,
    authorHandle: message.author.handle,
    authorName: message.author.name,
  });
}

// Server action wrapper for the composer.
export async function sendMessageAction(threadId: string, body: string): Promise<ActionResult<MessageDTO>> {
  const session = await requireSession();
  const profileId = await requireProfile(session);
  const res = await sendMessageCore(threadId, profileId, body);
  if (res.ok) revalidatePath(`/messages/${threadId}`);
  return res;
}

// Mark a thread read up to now (own membership only).
export async function markThreadReadAction(threadId: string): Promise<ActionResult> {
  const session = await requireSession();
  const profileId = await requireProfile(session);
  await assertThreadMember(threadId, profileId);
  await db.threadMember.update({
    where: { threadId_profileId: { threadId, profileId } },
    data: { lastReadAt: new Date() },
  });
  return ok(undefined);
}
