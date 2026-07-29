import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

// GET /api/nav-counts -> { unreadMessages, unreadByThread, pendingRequests }
//
// Backs every badge in the top nav from a single poll. Two separate pollers
// would double the request rate for data that is always rendered together.
//
// unreadMessages = messages in the viewer's threads, authored by someone else,
// created after the viewer's lastReadAt for that thread.
// pendingRequests = intro requests awaiting the viewer's answer.
export async function GET() {
  const session = await getSession();
  if (!session?.profileId) {
    return Response.json({ unreadMessages: 0, unreadByThread: {}, pendingRequests: 0 });
  }
  const profileId = session.profileId;

  const [memberships, pendingRequests] = await Promise.all([
    db.threadMember.findMany({
      where: { profileId },
      select: { threadId: true, lastReadAt: true },
    }),
    db.introRequest.count({ where: { toProfileId: profileId, status: "PENDING" } }),
  ]);

  const unreadByThread: Record<string, number> = {};
  let unreadMessages = 0;

  await Promise.all(
    memberships.map(async (m) => {
      const count = await db.message.count({
        where: {
          threadId: m.threadId,
          authorProfileId: { not: profileId },
          createdAt: { gt: m.lastReadAt },
        },
      });
      if (count > 0) {
        unreadByThread[m.threadId] = count;
        unreadMessages += count;
      }
    })
  );

  return Response.json({ unreadMessages, unreadByThread, pendingRequests });
}
