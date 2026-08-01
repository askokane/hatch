import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { assertThreadMember, ForbiddenError } from "@/lib/authz";
import { sendMessageCore, getThreadPresence } from "@/lib/messages-core";
import { MESSAGE_PAGE_SIZE, MESSAGE_TAIL_MAX } from "@/lib/constants";

const AUTHOR_SELECT = { author: { select: { handle: true, name: true } } } as const;

type MessageRow = {
  id: string;
  body: string;
  createdAt: Date;
  authorProfileId: string;
  author: { handle: string; name: string };
};

function toDTO(m: MessageRow) {
  return {
    id: m.id,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    authorProfileId: m.authorProfileId,
    authorHandle: m.author.handle,
    authorName: m.author.name,
  };
}

// Rejects garbage cursors instead of letting `new Date("...")` produce an Invalid
// Date, which Prisma would send to Postgres as a null and silently widen the query
// to the whole thread.
function parseCursor(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

// GET /api/threads/:threadId/messages?after=<ISO>   — live tail (newest first poll)
// GET /api/threads/:threadId/messages?before=<ISO>  — one page of older history
//
// The `after` form is the 3s poll: it returns messages newer than the cursor,
// ascending, plus the other participant's presence (typing + read watermark), so
// presence rides along on the existing poll rather than adding a second one.
//
// The `before` form backfills history for "load earlier" and returns `hasMore` so
// the client knows whether to keep offering it. Both forms are bounded — an
// unbounded transcript read here would let one long thread dominate a request.
// Membership is verified on every read.
export async function GET(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const session = await getSession();
  if (!session?.profileId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { threadId } = await params;
  const profileId = session.profileId;

  try {
    await assertThreadMember(threadId, profileId);
  } catch (e) {
    if (e instanceof ForbiddenError) return Response.json({ error: "Forbidden" }, { status: 403 });
    throw e;
  }

  const url = new URL(req.url);
  const before = parseCursor(url.searchParams.get("before"));

  // History backfill. No presence payload — the caller is scrolling up, not
  // watching for a reply, so there is nothing to refresh.
  if (before) {
    // One extra row is the hasMore probe; it is dropped before serializing.
    const rows = await db.message.findMany({
      where: { threadId, createdAt: { lt: before } },
      orderBy: { createdAt: "desc" },
      take: MESSAGE_PAGE_SIZE + 1,
      include: AUTHOR_SELECT,
    });
    const hasMore = rows.length > MESSAGE_PAGE_SIZE;
    const page = hasMore ? rows.slice(0, MESSAGE_PAGE_SIZE) : rows;
    // Selected newest-first to honour the limit; the client renders oldest-first.
    return Response.json({ messages: page.reverse().map(toDTO), hasMore });
  }

  const after = parseCursor(url.searchParams.get("after"));
  const [tail, presence] = await Promise.all([
    after
      ? db.message
          .findMany({
            where: { threadId, createdAt: { gt: after } },
            orderBy: { createdAt: "asc" },
            take: MESSAGE_TAIL_MAX,
            include: AUTHOR_SELECT,
          })
          .then((rows) => ({ rows, hasMore: false }))
      : // No cursor — the caller holds nothing yet, so this is a cold read, not a
        // delta. Hand back the most recent page rather than the whole thread, and
        // report whether anything precedes it: a client that started from an empty
        // transcript (thread had no messages at render, then filled up while the
        // tab was hidden) would otherwise be handed the newest page with no
        // indication that earlier messages exist.
        db.message
          .findMany({
            where: { threadId },
            orderBy: { createdAt: "desc" },
            take: MESSAGE_PAGE_SIZE + 1,
            include: AUTHOR_SELECT,
          })
          .then((rows) => {
            const hasMore = rows.length > MESSAGE_PAGE_SIZE;
            const page = hasMore ? rows.slice(0, MESSAGE_PAGE_SIZE) : rows;
            return { rows: page.reverse(), hasMore };
          }),
    getThreadPresence(threadId, profileId),
  ]);

  return Response.json({
    messages: tail.rows.map(toDTO),
    hasMore: tail.hasMore,
    ...presence,
  });
}

// POST /api/threads/:threadId/messages  { body }
// Shares sendMessageCore with the server action — one authorization source.
export async function POST(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const session = await getSession();
  if (!session?.profileId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { threadId } = await params;

  let body = "";
  try {
    const json = await req.json();
    body = typeof json?.body === "string" ? json.body : "";
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    const result = await sendMessageCore(threadId, session.profileId, body);
    if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
    return Response.json({ message: result.data });
  } catch (e) {
    if (e instanceof ForbiddenError) return Response.json({ error: "Forbidden" }, { status: 403 });
    throw e;
  }
}

// --- SSE upgrade point ---
// To drop polling, replace GET with a text/event-stream response subscribed to a
// per-thread in-process EventEmitter that POST publishes to; the client hook
// (useThreadPolling) would swap setInterval for an EventSource while keeping this
// same payload shape, so no other component would change. Typing presence would
// become its own event type instead of a field on each tick.
