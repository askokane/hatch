import { db } from "@/lib/db";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
  const oneDayAgo = new Date(now.getTime() - 86_400_000);
  const [sessions, resets, logins, attempts, drafts, avatars] = await db.$transaction([
    db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.passwordResetToken.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] } }),
    db.loginAttempt.deleteMany({ where: { createdAt: { lt: thirtyDaysAgo } } }),
    db.actionAttempt.deleteMany({ where: { createdAt: { lt: thirtyDaysAgo } } }),
    db.mediaAsset.deleteMany({ where: { postId: null, isAvatar: false, createdAt: { lt: oneDayAgo } } }),
    db.mediaAsset.deleteMany({ where: { isAvatar: true, avatarOf: null, createdAt: { lt: oneDayAgo } } }),
  ]);
  return Response.json({ sessions: sessions.count, resets: resets.count, logins: logins.count, attempts: attempts.count, drafts: drafts.count, avatars: avatars.count });
}
