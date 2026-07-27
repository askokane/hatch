import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { assertThreadMember, ForbiddenError } from "@/lib/authz";
import { sendMessageCore } from "@/actions/messages";

// GET /api/threads/:threadId/messages?after=<ISO>
// Returns messages after the cursor (or full history), ascending. Polled every 3s
// by the thread view. Membership is verified on every read.
export async function GET(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const session = await getSession();
  if (!session?.profileId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { threadId } = await params;

  try {
    await assertThreadMember(threadId, session.profileId);
  } catch (e) {
    if (e instanceof ForbiddenError) return Response.json({ error: "Forbidden" }, { status: 403 });
    throw e;
  }

  const after = new URL(req.url).searchParams.get("after");
  const messages = await db.message.findMany({
    where: { threadId, ...(after ? { createdAt: { gt: new Date(after) } } : {}) },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { handle: true, name: true } } },
  });

  return Response.json({
    messages: messages.map((m) => ({
      id: m.id,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      authorProfileId: m.authorProfileId,
      authorHandle: m.author.handle,
      authorName: m.author.name,
    })),
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
// same message shape, so no other component would change.
