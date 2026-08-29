import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

type UnreadRow = { threadId: string; count: bigint };
type UnreadChatRow = { chatId: string; count: bigint };

// GET /api/nav-counts -> { unreadMessages, unreadByThread, unreadProjectChats,
//                          unreadByProjectChat, pendingRequests }
//
// Backs every badge in the top nav from a single poll. Two separate pollers
// would double the request rate for data that is always rendered together.
//
// unreadMessages = messages in the viewer's threads, authored by someone else,
// created after the viewer's lastReadAt for that thread.
// unreadProjectChats = the same count over the group chats of the projects the
// viewer is on, against the chatLastReadAt watermark that lives on their own
// Membership row.
// pendingRequests = intro requests awaiting the viewer's answer.
//
// This endpoint is the hottest query path in the app — every logged-in client
// polls it on a timer, so its cost sets the concurrency ceiling. It therefore
// issues a FIXED three queries, never one per thread or per project. The
// per-conversation watermark lives on the viewer's own membership row in both
// cases, so joining the messages against that row lets Postgres apply each
// cutoff inside a single scan. Expressing that in Prisma's query API would mean
// either a count per conversation (an N+1) or an N-clause OR — both scale with
// how socially active the viewer is.
export async function GET() {
  const session = await getSession();
  if (!session?.profileId) {
    return Response.json({
      unreadMessages: 0,
      unreadByThread: {},
      unreadProjectChats: 0,
      unreadByProjectChat: {},
      pendingRequests: 0,
    });
  }
  const profileId = session.profileId;

  const [rows, chatRows, pendingRequests] = await Promise.all([
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
    // The group-chat counterpart. Two things differ from the query above, and
    // both follow from a group chat not being a thread:
    //
    //   * The join goes message -> chat -> Membership, because the chat has no
    //     member table of its own. That is the same indirection the read paths
    //     use, so a member removed from a project stops being counted by the
    //     same DELETE that removes them.
    //   * The NOT EXISTS drops messages from people the viewer has blocked, in
    //     either direction. Without it the badge would count messages the
    //     transcript is never going to show, and clicking through to a chat that
    //     looks unchanged is worse than no badge at all.
    db.$queryRaw<UnreadChatRow[]>`
      SELECT m."chatId" AS "chatId", COUNT(*) AS "count"
      FROM "ProjectChatMessage" m
      JOIN "ProjectChat" c
        ON c."id" = m."chatId"
      JOIN "Membership" ms
        ON ms."projectId" = c."projectId"
       AND ms."profileId" = ${profileId}
      WHERE m."authorProfileId" <> ${profileId}
        AND m."createdAt" > ms."chatLastReadAt"
        AND NOT EXISTS (
          SELECT 1 FROM "Block" b
          WHERE (b."blockerProfileId" = ${profileId} AND b."blockedProfileId" = m."authorProfileId")
             OR (b."blockerProfileId" = m."authorProfileId" AND b."blockedProfileId" = ${profileId})
        )
      GROUP BY m."chatId"
    `,
    db.introRequest.count({ where: { toProfileId: profileId, status: "PENDING" } }),
  ]);

  const unreadByThread: Record<string, number> = {};
  let unreadMessages = 0;
  const unreadByProjectChat: Record<string, number> = {};
  let unreadProjectChats = 0;

  // COUNT(*) arrives as a bigint; JSON.stringify throws on those, so narrow to
  // Number before it can reach the response body.
  for (const row of rows) {
    const count = Number(row.count);
    if (count > 0) {
      unreadByThread[row.threadId] = count;
      unreadMessages += count;
    }
  }

  for (const row of chatRows) {
    const count = Number(row.count);
    if (count > 0) {
      unreadByProjectChat[row.chatId] = count;
      unreadProjectChats += count;
    }
  }

  return Response.json({
    unreadMessages,
    unreadByThread,
    unreadProjectChats,
    unreadByProjectChat,
    pendingRequests,
  });
}
