"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, requireProfile } from "@/lib/session";
import { assertThreadMember } from "@/lib/authz";
import { sendMessageCore, setTypingCore, type MessageDTO } from "@/lib/messages-core";
import { ok, type ActionResult } from "@/lib/action-result";

// Thin session-bound wrappers. Every export here is a callable endpoint, so none
// of them accepts a profile ID — it is always derived from the session. The
// logic itself lives in lib/messages-core.ts.

export type { MessageDTO, ThreadPresence } from "@/lib/messages-core";

export async function sendMessageAction(
  threadId: string,
  body: string,
  clientId: string
): Promise<ActionResult<MessageDTO>> {
  const session = await requireSession();
  const profileId = await requireProfile(session);
  const res = await sendMessageCore(threadId, profileId, body, clientId);
  if (res.ok) revalidatePath(`/messages/${threadId}`);
  return res;
}

// Mark a thread read up to now (own membership only). This is what turns the
// other side's "delivered" into "seen".
export async function markThreadReadAction(threadId: string, messageId: string): Promise<ActionResult> {
  const session = await requireSession();
  const profileId = await requireProfile(session);
  await assertThreadMember(threadId, profileId);
  const message = await db.message.findFirst({ where: { id: messageId, threadId }, select: { id: true, createdAt: true } });
  if (!message) return ok(undefined);
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`thread-read:${threadId}:${profileId}`}))`;
    const member = await tx.threadMember.findUnique({ where: { threadId_profileId: { threadId, profileId } }, select: { lastReadAt: true, lastReadMessageId: true } });
    if (!member || member.lastReadAt > message.createdAt || (member.lastReadAt.getTime() === message.createdAt.getTime() && member.lastReadMessageId && member.lastReadMessageId >= message.id)) return;
    await tx.threadMember.update({ where: { threadId_profileId: { threadId, profileId } }, data: { lastReadAt: message.createdAt, lastReadMessageId: message.id } });
  });
  return ok(undefined);
}

export async function setTypingAction(threadId: string, typing: boolean): Promise<ActionResult> {
  const session = await requireSession();
  const profileId = await requireProfile(session);
  await assertThreadMember(threadId, profileId);
  await setTypingCore(threadId, profileId, typing);
  return ok(undefined);
}
