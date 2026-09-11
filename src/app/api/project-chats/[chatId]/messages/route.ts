import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { ForbiddenError } from "@/lib/authz";
import {
  PROJECT_CHAT_MESSAGE_SELECT,
  blockedFrom,
  getProjectChatPresence,
  requireChatMember,
  sendProjectChatMessageCore,
  toProjectChatMessageDTO,
  visibleAuthorFilter,
} from "@/lib/project-chat-core";
import { MESSAGE_PAGE_SIZE, MESSAGE_TAIL_MAX } from "@/lib/constants";
import { isTrustedMutationRequest } from "@/lib/request-security";

// Rejects garbage cursors instead of letting `new Date("...")` produce an Invalid
// Date, which Prisma would send to Postgres as a null and silently widen the query
// to the whole chat. Same guard, same reason, as the thread route.
function parseCursor(raw: string | null): { date: Date; id: string } | null {
  if (!raw) return null;
  const split = raw.lastIndexOf("~");
  if (split < 0) return null;
  const d = new Date(raw.slice(0, split)); const id = raw.slice(split + 1);
  return Number.isNaN(d.getTime()) || !id ? null : { date: d, id };
}

// GET /api/project-chats/:chatId/messages?after=<ISO>   — live tail (3s poll)
// GET /api/project-chats/:chatId/messages?before=<ISO>  — one page of older history
//
// The group-chat counterpart of /api/threads/:threadId/messages, and it is a
// separate endpoint rather than a branch inside that one on purpose: the two
// disagree about who is allowed to read (thread membership vs project membership)
// and about what a block does (closes the conversation vs hides one person), and
// those are the two decisions in the whole app it is least safe to make with a
// conditional in a hot path.
//
// Every read is filtered by the viewer's block list IN THE QUERY, not after it —
// see blockedFrom(). Filtering a page after it has been limited returns short
// pages and makes "load earlier" walk backwards in uneven steps.
//
// Membership is verified on every read.
export async function GET(req: Request, { params }: { params: Promise<{ chatId: string }> }) {
  const session = await getSession();
  if (!session?.profileId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { chatId } = await params;
  const profileId = session.profileId;

  let ctx;
  try {
    ctx = await requireChatMember(chatId, profileId);
  } catch (e) {
    if (e instanceof ForbiddenError) return Response.json({ error: "Forbidden" }, { status: 403 });
    throw e;
  }

  const blocked = await blockedFrom(profileId);
  const visible = visibleAuthorFilter(blocked);

  const url = new URL(req.url);
  const before = parseCursor(url.searchParams.get("before"));

  // History backfill. No presence payload — the caller is scrolling up, not
  // watching for a reply, so there is nothing to refresh.
  if (before) {
    // One extra row is the hasMore probe; it is dropped before serializing.
    const rows = await db.projectChatMessage.findMany({
      where: { chatId, OR: [{ createdAt: { lt: before.date } }, { createdAt: before.date, id: { lt: before.id } }], ...visible },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: MESSAGE_PAGE_SIZE + 1,
      select: PROJECT_CHAT_MESSAGE_SELECT,
    });
    const hasMore = rows.length > MESSAGE_PAGE_SIZE;
    const page = hasMore ? rows.slice(0, MESSAGE_PAGE_SIZE) : rows;
    // Selected newest-first to honour the limit; the client renders oldest-first.
    return Response.json({ messages: page.reverse().map(toProjectChatMessageDTO), hasMore });
  }

  const after = parseCursor(url.searchParams.get("after"));
  const [tail, presence] = await Promise.all([
    after
      ? db.projectChatMessage
          .findMany({
            where: { chatId, OR: [{ createdAt: { gt: after.date } }, { createdAt: after.date, id: { gt: after.id } }], ...visible },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: MESSAGE_TAIL_MAX + 1,
            select: PROJECT_CHAT_MESSAGE_SELECT,
          })
          .then((rows) => ({ rows: rows.slice(0, MESSAGE_TAIL_MAX), hasMore: rows.length > MESSAGE_TAIL_MAX }))
      : // No cursor — the caller holds nothing yet, so this is a cold read, not a
        // delta. Hand back the most recent page rather than the whole chat, and
        // report whether anything precedes it: a client that started from an empty
        // transcript (chat was empty at render, then filled up while the tab was
        // hidden) would otherwise be handed the newest page with no indication
        // that earlier messages exist.
        db.projectChatMessage
          .findMany({
            where: { chatId, ...visible },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: MESSAGE_PAGE_SIZE + 1,
            select: PROJECT_CHAT_MESSAGE_SELECT,
          })
          .then((rows) => {
            const hasMore = rows.length > MESSAGE_PAGE_SIZE;
            const page = hasMore ? rows.slice(0, MESSAGE_PAGE_SIZE) : rows;
            return { rows: page.reverse(), hasMore };
          }),
    getProjectChatPresence(ctx, profileId, blocked),
  ]);

  return Response.json({
    messages: tail.rows.map(toProjectChatMessageDTO),
    hasMore: tail.hasMore,
    ...presence,
  });
}

// POST /api/project-chats/:chatId/messages  { body }
// Shares sendProjectChatMessageCore with the server action — one authorization
// source, exactly as the thread route shares sendMessageCore.
export async function POST(req: Request, { params }: { params: Promise<{ chatId: string }> }) {
  if (!isTrustedMutationRequest(req, "application/json")) return Response.json({ error: "Untrusted request." }, { status: 403 });
  const session = await getSession();
  if (!session?.profileId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { chatId } = await params;

  let body = "";
  let clientId = "";
  try {
    const json = await req.json();
    body = typeof json?.body === "string" ? json.body : "";
    clientId = typeof json?.clientId === "string" ? json.clientId : "";
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    const ctx = await requireChatMember(chatId, session.profileId);
    const result = await sendProjectChatMessageCore(ctx, session.profileId, body, clientId);
    if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
    return Response.json({ message: result.data });
  } catch (e) {
    if (e instanceof ForbiddenError) return Response.json({ error: "Forbidden" }, { status: 403 });
    throw e;
  }
}

// --- SSE upgrade point ---
// Same shape as the thread route's: replace GET with a text/event-stream response
// subscribed to a per-chat in-process EventEmitter that POST publishes to. The
// per-viewer block filter is the one thing that does not survive that move
// unchanged — a broadcast stream would have to filter per subscriber rather than
// per query, so the emitter must carry authorProfileId on every event.
