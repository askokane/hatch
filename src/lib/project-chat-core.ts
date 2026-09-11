import { db } from "./db";
import { assertProjectMember, ForbiddenError } from "./authz";
import { messageSchema } from "./validation/message.schema";
import { TYPING_TTL_MS } from "./constants";
import { ok, fail, type ActionResult } from "./action-result";
import { consumeRateLimit } from "./rate-limit";

// Project group chat logic, shared by the server actions and the route handler
// so there is exactly one source of truth for the authorization and block rules.
//
// Like lib/messages-core.ts, this deliberately lives OUTSIDE a "use server"
// module. Every exported async function in one of those is registered as a
// callable endpoint, so a helper there that takes `profileId` as a parameter is
// an impersonation hole — the client picks the value. Here the parameter is safe
// because the only way in is through a caller that derived it from the session.
//
// The chat is NOT a Thread. See the ProjectChat model in schema.prisma for why,
// and note the two rules that differ from a two-person thread:
//
//   * Membership is the project's team roster, not a list of its own. Every
//     authorization check below is assertProjectMember() against the project the
//     chat belongs to.
//   * A block does not close the room. In a thread of two, blocking ends the
//     conversation because there is no conversation left; on a team of six it
//     would let one person silence a shared room. Instead the blocker stops
//     seeing the blocked member — messages and typing alike — and the blocked
//     member is never told. See blockedFrom() below.

export type ProjectChatMessageDTO = {
  id: string;
  body: string;
  createdAt: string;
  authorProfileId: string;
  authorHandle: string;
  authorName: string;
  authorAvatarSeed: string;
  authorAvatarAssetId: string | null;
};

// The shape every producer of a ProjectChatMessageDTO has to read. Declared once
// so adding a field to the DTO is one edit rather than a hunt through the action,
// the route and the poll for the one that was missed.
//
// It carries the author's avatar, which the two-person equivalent does not need:
// a thread has one face and it is pinned at the top, while a group transcript has
// to say who is speaking on every line.
export const PROJECT_CHAT_MESSAGE_SELECT = {
  id: true,
  body: true,
  createdAt: true,
  authorProfileId: true,
  author: { select: { handle: true, name: true, avatarSeed: true, avatarAssetId: true } },
} as const;

export type ProjectChatMessageRow = {
  id: string;
  body: string;
  createdAt: Date;
  authorProfileId: string;
  author: { handle: string; name: string; avatarSeed: string; avatarAssetId: string | null };
};

export function toProjectChatMessageDTO(m: ProjectChatMessageRow): ProjectChatMessageDTO {
  return {
    id: m.id,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    authorProfileId: m.authorProfileId,
    authorHandle: m.author.handle,
    authorName: m.author.name,
    authorAvatarSeed: m.author.avatarSeed,
    authorAvatarAssetId: m.author.avatarAssetId,
  };
}

// Everything the group UI needs about the other members, refreshed on every poll.
export type ProjectChatPresence = {
  /** Members typing right now, excluding the viewer and anyone they've blocked. */
  typingNames: string[];
  /** How many OTHER members have read the viewer's newest message. */
  seenByCount: number;
  /** Members other than the viewer, so "seen by 2" can be read against a total. */
  otherMemberCount: number;
};

// Profiles whose messages this viewer must not be shown in a group chat: everyone
// they have blocked, and everyone who has blocked them.
//
// Both directions are filtered, and that is not symmetry for its own sake. If A
// blocked B, A should not have to read B. If B blocked A, B has decided they want
// nothing to do with A, and a shared room should not quietly be the exception.
// Neither side is told anything: the messages are simply not in the page, which
// is indistinguishable from the other person not having written any.
//
// Returned as a plain array so it can be spliced into a `notIn` on the SAME query
// that pages the transcript. Filtering after the fact would be a correctness bug,
// not merely a slower one — dropping rows from an already-limited page yields
// short pages and a "load earlier" button that walks back in uneven steps.
export async function blockedFrom(viewerProfileId: string): Promise<string[]> {
  const blocks = await db.block.findMany({
    where: {
      OR: [{ blockerProfileId: viewerProfileId }, { blockedProfileId: viewerProfileId }],
    },
    select: { blockerProfileId: true, blockedProfileId: true },
  });
  const out = new Set<string>();
  for (const b of blocks) {
    out.add(b.blockerProfileId === viewerProfileId ? b.blockedProfileId : b.blockerProfileId);
  }
  return [...out];
}

// The `where` fragment that hides blocked members from one viewer's reads.
// Prisma accepts `notIn: []`, but spelling the empty case out keeps the common
// query (nobody blocked) free of a clause the planner has to consider.
export function visibleAuthorFilter(blocked: string[]) {
  return blocked.length ? { authorProfileId: { notIn: blocked } } : {};
}

export type ChatContext = {
  chatId: string;
  projectId: string;
  projectSlug: string;
  projectName: string;
  /** A closed project's chat is readable but not writable. */
  projectClosed: boolean;
};

// Resolves the chat for a project the caller is a member of, creating the row on
// first open.
//
// The chat is not something a project opts into — every project has one — so
// there is nothing to check before creating it, and creating it on demand is what
// saved every project that already existed from a backfill.
//
// The read-then-create-then-reread below is written out rather than expressed as
// an upsert because the race it handles is real and the upsert's protection
// against it is not guaranteed: Prisma only compiles upsert to a native
// INSERT ... ON CONFLICT under conditions it does not promise to keep, and the
// fallback it drops to is exactly the check-then-act this replaces. Two teammates
// clicking "team chat" in the same second is an ordinary thing to happen. The
// unique constraint on `projectId` is what actually decides the winner; the catch
// is how the loser finds out, and it re-reads rather than failing because both
// callers wanted the identical outcome and one of them already has it.
//
// Membership is asserted BEFORE the row is touched: a non-member must not be able
// to create anything, even something this inert.
export async function getChatForProject(
  projectId: string,
  profileId: string
): Promise<ChatContext> {
  await assertProjectMember(projectId, profileId);

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, slug: true, name: true, closedAt: true },
  });
  if (!project) throw new ForbiddenError("Project not found");

  let chatId = (
    await db.projectChat.findUnique({ where: { projectId }, select: { id: true } })
  )?.id;

  if (!chatId) {
    try {
      chatId = (await db.projectChat.create({ data: { projectId }, select: { id: true } })).id;
    } catch (e) {
      const won = await db.projectChat.findUnique({
        where: { projectId },
        select: { id: true },
      });
      // A row here means the unique constraint fired and somebody else won, which
      // is the expected outcome and not an error. No row means the insert failed
      // for some other reason, and swallowing that would turn a real fault into a
      // silent one — so the original error is rethrown untouched.
      if (!won) throw e;
      chatId = won.id;
    }
  }

  return {
    chatId,
    projectId: project.id,
    projectSlug: project.slug,
    projectName: project.name,
    projectClosed: !!project.closedAt,
  };
}

// Resolves a chat by its OWN id and asserts the caller is on the team.
//
// This is the entry point for the poll route and every write, which know the chat
// id and nothing else. It goes chat -> project -> membership every time rather
// than trusting the id, because a chat id in a URL is a client-supplied value and
// proves nothing about who is holding it.
export async function requireChatMember(chatId: string, profileId: string): Promise<ChatContext> {
  const chat = await db.projectChat.findUnique({
    where: { id: chatId },
    select: { id: true, project: { select: { id: true, slug: true, name: true, closedAt: true } } },
  });
  if (!chat) throw new ForbiddenError("Chat not found");
  await assertProjectMember(chat.project.id, profileId);
  return {
    chatId: chat.id,
    projectId: chat.project.id,
    projectSlug: chat.project.slug,
    projectName: chat.project.name,
    projectClosed: !!chat.project.closedAt,
  };
}

// Whether this member may put anything into this chat right now, and why not if
// they may not. Returns the refusal text, or null when the chat is open.
//
// Membership failure THROWS (via requireChatMember) rather than returning: not
// being on the team is not a validation error the composer should render, it is a
// request that should never have been made. A closed project returns, because it
// is a state the member is allowed to see explained.
//
// Note what is NOT here: a block check. Blocking a teammate hides them from you;
// it does not take your own keyboard away, and it does not take the room away
// from the other four people in it.
export function chatPostingRefusal(ctx: ChatContext): string | null {
  if (ctx.projectClosed) return "This project is closed. Its chat is read-only.";
  return null;
}

// Takes an already-resolved ChatContext rather than a chat id, so a caller that
// needs the context afterwards (to revalidate the project's path, say) does not
// pay for a second chat -> project -> membership resolution to get it back. Every
// caller has to go through requireChatMember() to obtain one, so the
// authorization is not weakened by moving it up a frame.
export async function sendProjectChatMessageCore(
  ctx: ChatContext,
  profileId: string,
  body: string,
  clientId: string
): Promise<ActionResult<ProjectChatMessageDTO>> {
  const refusal = chatPostingRefusal(ctx);
  if (refusal) return fail(refusal);
  if (!(await consumeRateLimit("project-message", profileId, 180, 60 * 60 * 1000))) return fail("Message limit reached. Try again later.");

  const parsed = messageSchema.safeParse({ body });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Write a message.");

  if (!/^[0-9a-f-]{36}$/i.test(clientId)) return fail("Invalid message identifier.");
  let message = await db.projectChatMessage.findUnique({
    where: { chatId_authorProfileId_clientId: { chatId: ctx.chatId, authorProfileId: profileId, clientId } }, select: PROJECT_CHAT_MESSAGE_SELECT,
  });
  if (!message) {
    try {
      message = await db.projectChatMessage.create({ data: { chatId: ctx.chatId, authorProfileId: profileId, body: parsed.data.body, clientId }, select: PROJECT_CHAT_MESSAGE_SELECT });
    } catch {
      message = await db.projectChatMessage.findUnique({ where: { chatId_authorProfileId_clientId: { chatId: ctx.chatId, authorProfileId: profileId, clientId } }, select: PROJECT_CHAT_MESSAGE_SELECT });
      if (!message) throw new Error("Message could not be stored");
    }
  }

  // Sending ends the typing state, or the indicator would linger for the rest of
  // the TTL right beside the message that just arrived.
  await db.membership.update({
    where: { projectId_profileId: { projectId: ctx.projectId, profileId } },
    data: { chatTypingUntil: null },
  }).catch(() => {});

  return ok(toProjectChatMessageDTO(message));
}

// Claim (or release) the typing state for one member.
export async function setChatTypingCore(
  ctx: ChatContext,
  profileId: string,
  typing: boolean
): Promise<void> {
  // A read-only chat has nothing to type into, so it has no typing presence.
  if (typing && ctx.projectClosed) return;
  await db.membership.update({
    where: { projectId_profileId: { projectId: ctx.projectId, profileId } },
    data: { chatTypingUntil: typing ? new Date(Date.now() + TYPING_TTL_MS) : null },
  });
}

// Marks the chat read up to now for one member.
export async function markChatReadCore(ctx: ChatContext, profileId: string, messageId: string): Promise<void> {
  const message = await db.projectChatMessage.findFirst({ where: { id: messageId, chatId: ctx.chatId }, select: { id: true, createdAt: true } });
  if (!message) return;
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`chat-read:${ctx.chatId}:${profileId}`}))`;
    const member = await tx.membership.findUnique({ where: { projectId_profileId: { projectId: ctx.projectId, profileId } }, select: { chatLastReadAt: true, chatLastReadMessageId: true } });
    if (!member || member.chatLastReadAt > message.createdAt || (member.chatLastReadAt.getTime() === message.createdAt.getTime() && member.chatLastReadMessageId && member.chatLastReadMessageId >= message.id)) return;
    await tx.membership.update({ where: { projectId_profileId: { projectId: ctx.projectId, profileId } }, data: { chatLastReadAt: message.createdAt, chatLastReadMessageId: message.id } });
  });
}

// Presence for everyone else on the team: who is typing, and how many of them
// have caught up with the viewer's newest message.
//
// This is the group answer to a thread's `otherTyping` / `otherLastReadAt` pair.
// A per-member read list would be the richer version and is deliberately not what
// is returned: it would put every teammate's reading habits on every poll
// response, and "seen by 3" is what the sender actually wants to know.
//
// Two queries, both bounded by team size, riding on the poll that was already
// happening rather than adding one of their own.
export async function getProjectChatPresence(
  ctx: ChatContext,
  profileId: string,
  blocked: string[]
): Promise<ProjectChatPresence> {
  const now = Date.now();

  const [others, newestOwn] = await Promise.all([
    db.membership.findMany({
      where: { projectId: ctx.projectId, profileId: { not: profileId } },
      select: {
        profileId: true,
        chatLastReadAt: true,
        chatLastReadMessageId: true,
        chatTypingUntil: true,
        profile: { select: { name: true } },
      },
    }),
    db.projectChatMessage.findFirst({
      where: { chatId: ctx.chatId, authorProfileId: profileId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, createdAt: true },
    }),
  ]);

  const blockedSet = new Set(blocked);

  const typingNames = others
    .filter(
      (m) =>
        !blockedSet.has(m.profileId) &&
        !!m.chatTypingUntil &&
        m.chatTypingUntil.getTime() > now
    )
    .map((m) => m.profile.name);

  // With no message of our own there is nothing for anyone to have seen, and
  // reporting the number who happen to be caught up would read as a receipt for
  // a message that does not exist.
  const eligibleOthers = others.filter((m) => !blockedSet.has(m.profileId));
  const seenByCount = newestOwn
    ? eligibleOthers.filter((m) => m.chatLastReadAt.getTime() > newestOwn.createdAt.getTime() ||
        (m.chatLastReadAt.getTime() === newestOwn.createdAt.getTime() && m.chatLastReadMessageId === newestOwn.id)).length
    : 0;

  return { typingNames, seenByCount, otherMemberCount: eligibleOthers.length };
}
