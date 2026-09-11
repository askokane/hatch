import { db } from "./db";

// DB-backed login rate limiter (LoginAttempt table) rather than an in-memory
// Map: the limit must survive dev-server restarts (which happen on every file
// change) and multi-process production servers. SQLite is already the single
// source of truth, so this adds no new infrastructure.

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS_PER_EMAIL_SOURCE = 10;
const MAX_ATTEMPTS_PER_IP = 50;

export async function consumeRateLimit(
  bucket: string,
  subject: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  const normalized = subject.slice(0, 240);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${bucket}:${normalized}`}))`;
    const since = new Date(Date.now() - windowMs);
    const count = await tx.actionAttempt.count({
      where: { bucket, subject: normalized, createdAt: { gte: since } },
    });
    if (count >= limit) return false;
    await tx.actionAttempt.create({ data: { bucket, subject: normalized } });
    return true;
  });
}

export async function checkLoginRateLimit(
  email: string,
  ip: string
): Promise<{ allowed: boolean }> {
  const [emailAllowed, ipAllowed] = await Promise.all([
    consumeRateLimit("login-email-source", `${email}|${ip}`, MAX_ATTEMPTS_PER_EMAIL_SOURCE, WINDOW_MS),
    consumeRateLimit("login-ip", ip, MAX_ATTEMPTS_PER_IP, WINDOW_MS),
  ]);
  return { allowed: emailAllowed && ipAllowed };
}

export async function recordLoginAttempt(params: {
  email: string;
  ip: string;
  succeeded: boolean;
  userId?: string;
}): Promise<void> {
  await db.loginAttempt.create({ data: params });
}
