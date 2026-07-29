import { db } from "./db";
import { assertThreadMember, getBlockState } from "./authz";
import { messageSchema } from "./validation/message.schema";
import { TYPING_TTL_MS } from "./constants";
import { ok, fail, type ActionResult } from "./action-result";

// Messaging logic shared by the server action and the POST route handler, so
// there is exactly one source of truth for the authorization + block checks.
//
// This deliberately lives OUTSIDE actions/messages.ts. Every exported async
// function in a "use server" module is registered as a callable endpoint, so a
// helper there that accepts `profileId` as a parameter is an impersonation hole:
// the client picks the value. Here the parameter is safe because the only way in
// is through a caller that derived it from the session.

export type MessageDTO = {
  id: string;
  body: string;
  createdAt: string;
  authorProfileId: string;
  authorHandle: string;
  authorName: string;
};

// Everything the thread UI needs about the other participant, refreshed on every
// poll: are they typing right now, and how far have they read?
export type ThreadPresence = {
  otherTyping: boolean;
  /** ISO timestamp; every message of ours at or before it has been seen. */
  otherLastReadAt: string | null;
};

// Threads are always exactly two people, but this reads the membership rows
// rather than assuming it.
export async function otherMemberId(threadId: string, profileId: string): Promise<string | null> {
  const other = await db.threadMember.findFirst({
    where: { threadId, profileId: { not: profileId } },
    select: { profileId: true },
  });
  return other?.profileId ?? null;
}

export async function sendMessageCore(
  threadId: string,
  profileId: string,
  body: string
): Promise<ActionResult<MessageDTO>> {
  await assertThreadMember(threadId, profileId);

  const parsed = messageSchema.safeParse({ body });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Write a message.");

  // A block makes the thread read-only. The refusal wording is asymmetric on
  // purpose: whoever placed the block gets a specific, actionable message; the
  // person who was blocked gets a neutral one that does not reveal a block
  // exists. Both are refused identically — only the explanation differs.
  const other = await otherMemberId(threadId, profileId);
  if (other) {
    const block = await getBlockState(profileId, other);
    if (block.viewerBlockedThem) {
      return fail("You blocked this person. Unblock them from settings to send messages.");
    }
    if (block.theyBlockedViewer) {
      return fail("You can't send messages in this conversation.");
    }
  }

  const message = await db.message.create({
    data: { threadId, authorProfileId: profileId, body: parsed.data.body },
    include: { author: { select: { handle: true, name: true } } },
  });

  // Sending ends the typing state — otherwise the indicator would linger for the
  // rest of the TTL right beside the message that just arrived.
  await db.threadMember.update({
    where: { threadId_profileId: { threadId, profileId } },
    data: { typingUntil: null },
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

// Claim (or release) the typing state for one member of a thread.
export async function setTypingCore(
  threadId: string,
  profileId: string,
  typing: boolean
): Promise<void> {
  // No typing presence while a block is in place — the thread is read-only, and
  // leaking "they're typing" past a block would defeat the point of the block.
  if (typing) {
    const other = await otherMemberId(threadId, profileId);
    if (other && (await getBlockState(profileId, other)).either) return;
  }

  await db.threadMember.update({
    where: { threadId_profileId: { threadId, profileId } },
    data: { typingUntil: typing ? new Date(Date.now() + TYPING_TTL_MS) : null },
  });
}

// Presence for the OTHER member: typing state and read watermark.
export async function getThreadPresence(
  threadId: string,
  profileId: string
): Promise<ThreadPresence> {
  const other = await db.threadMember.findFirst({
    where: { threadId, profileId: { not: profileId } },
    select: { lastReadAt: true, typingUntil: true },
  });
  if (!other) return { otherTyping: false, otherLastReadAt: null };
  return {
    otherTyping: !!other.typingUntil && other.typingUntil.getTime() > Date.now(),
    otherLastReadAt: other.lastReadAt.toISOString(),
  };
}
