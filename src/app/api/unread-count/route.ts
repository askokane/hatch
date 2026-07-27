import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

// GET /api/unread-count -> { total, byThread }
// Unread = messages in the viewer's threads, authored by someone else, created
// after the viewer's lastReadAt for that thread. Polled by the nav badge.
export async function GET() {
  const session = await getSession();
  if (!session?.profileId) {
    return Response.json({ total: 0, byThread: {} });
  }

  const memberships = await db.threadMember.findMany({
    where: { profileId: session.profileId },
    select: { threadId: true, lastReadAt: true },
  });

  const byThread: Record<string, number> = {};
  let total = 0;

  await Promise.all(
    memberships.map(async (m) => {
      const count = await db.message.count({
        where: {
          threadId: m.threadId,
          authorProfileId: { not: session.profileId! },
          createdAt: { gt: m.lastReadAt },
        },
      });
      if (count > 0) {
        byThread[m.threadId] = count;
        total += count;
      }
    })
  );

  return Response.json({ total, byThread });
}
