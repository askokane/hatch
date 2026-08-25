import { db } from "./db";
import { assertThreadMember, getBlockState } from "./authz";
import { messageSchema } from "./validation/message.schema";
import { parseShareSnapshot, type ShareSnapshot } from "./validation/share.schema";
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
  /** A shared profile/project card, or null for a plain message. */
  share: ShareSnapshot | null;
};

// The shape every producer of a MessageDTO has to read. Declared here rather
// than at each call site so adding a field to the DTO is one edit, not a hunt
// through the action, the route and the poll for the one that was missed.
export const MESSAGE_DTO_SELECT = {
  id: true,
  body: true,
  createdAt: true,
  authorProfileId: true,
  shareSnapshot: true,
  author: { select: { handle: true, name: true } },
} as const;

export type MessageRow = {
  id: string;
  body: string;
  createdAt: Date;
  authorProfileId: string;
  shareSnapshot: unknown;
  author: { handle: string; name: string };
};

// One serializer for the transcript, shared by the send path, the 3s poll and the
// history backfill. They used to build the same object independently, which was
// harmless right up until the row grew a field.
export function toMessageDTO(m: MessageRow): MessageDTO {
  return {
    id: m.id,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    authorProfileId: m.authorProfileId,
    authorHandle: m.author.handle,
    authorName: m.author.name,
    // Parsed, not cast: see validation/share.schema.ts. An unreadable snapshot
    // renders as no card rather than taking the whole transcript down.
    share: parseShareSnapshot(m.shareSnapshot),
  };
}

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

// Whether this profile may put anything into this thread right now, and why not
// if they may not. Returns the refusal text, or null when the thread is open.
//
// Membership failure THROWS (ForbiddenError) rather than returning: not being in
// a thread is not a validation error the composer should render, it is a request
// that should never have been made. Blocks return, because they are a state the
// sender is allowed to see a message about.
//
// Shared by every write into a thread — a plain message and a share card alike —
// so a block cannot close one door and leave the other one open.
export async function threadPostingRefusal(
  threadId: string,
  profileId: string
): Promise<string | null> {
  await assertThreadMember(threadId, profileId);

  // A block makes the thread read-only. The refusal wording is asymmetric on
  // purpose: whoever placed the block gets a specific, actionable message; the
  // person who was blocked gets a neutral one that does not reveal a block
  // exists. Both are refused identically — only the explanation differs.
  const other = await otherMemberId(threadId, profileId);
  if (!other) return null;
  const block = await getBlockState(profileId, other);
  if (block.viewerBlockedThem) {
    return "You blocked this person. Unblock them from settings to send messages.";
  }
  if (block.theyBlockedViewer) {
    return "You can't send messages in this conversation.";
  }
  return null;
}

// Clears the sender's typing claim. Sending ends the typing state — otherwise the
// indicator would linger for the rest of the TTL right beside the message that
// just arrived.
export async function clearTypingAfterSend(threadId: string, profileId: string): Promise<void> {
  await db.threadMember.update({
    where: { threadId_profileId: { threadId, profileId } },
    data: { typingUntil: null },
  });
}

export async function sendMessageCore(
  threadId: string,
  profileId: string,
  body: string
): Promise<ActionResult<MessageDTO>> {
  const refusal = await threadPostingRefusal(threadId, profileId);
  if (refusal) return fail(refusal);

  const parsed = messageSchema.safeParse({ body });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Write a message.");

  const message = await db.message.create({
    data: { threadId, authorProfileId: profileId, body: parsed.data.body },
    select: MESSAGE_DTO_SELECT,
  });

  await clearTypingAfterSend(threadId, profileId);

  return ok(toMessageDTO(message));
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
