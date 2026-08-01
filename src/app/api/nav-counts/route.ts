import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

type UnreadRow = { threadId: string; count: bigint };

// GET /api/nav-counts -> { unreadMessages, unreadByThread, pendingRequests }
//
// Backs every badge in the top nav from a single poll. Two separate pollers
// would double the request rate for data that is always rendered together.
//
// unreadMessages = messages in the viewer's threads, authored by someone else,
// created after the viewer's lastReadAt for that thread.
// pendingRequests = intro requests awaiting the viewer's answer.
//
// This endpoint is the hottest query path in the app — every logged-in client
// polls it on a timer, so its cost sets the concurrency ceiling. It therefore
// issues a FIXED two queries, never one per thread. The per-thread `lastReadAt`
// watermark lives on ThreadMember, so joining Message against the viewer's own
// membership row lets Postgres apply each thread's cutoff inside a single scan.
// Expressing that in Prisma's query API would mean either a count per thread
// (an N+1) or an N-clause OR — both scale with the viewer's thread count.
export async function GET() {
  const session = await getSession();
  if (!session?.profileId) {
    return Response.json({ unreadMessages: 0, unreadByThread: {}, pendingRequests: 0 });
  }
  const profileId = session.profileId;

  const [rows, pendingRequests] = await Promise.all([
    db.$queryRaw<UnreadRow[]>`
      SELECT m."threadId" AS "threadId", COUNT(*) AS "count"
      FROM "Message" m
      JOIN "ThreadMember" tm
        ON tm."threadId" = m."threadId"
       AND tm."profileId" = ${profileId}
      WHERE m."authorProfileId" <> ${profileId}
        AND m."createdAt" > tm."lastReadAt"
      GROUP BY m."threadId"
    `,
    db.introRequest.count({ where: { toProfileId: profileId, status: "PENDING" } }),
  ]);

  const unreadByThread: Record<string, number> = {};
  let unreadMessages = 0;

  // COUNT(*) arrives as a bigint; JSON.stringify throws on those, so narrow to
  // Number before it can reach the response body.
  for (const row of rows) {
    const count = Number(row.count);
    if (count > 0) {
      unreadByThread[row.threadId] = count;
      unreadMessages += count;
    }
  }

  return Response.json({ unreadMessages, unreadByThread, pendingRequests });
}
