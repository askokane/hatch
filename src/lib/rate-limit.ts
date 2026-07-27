import { db } from "./db";

// DB-backed login rate limiter (LoginAttempt table) rather than an in-memory
// Map: the limit must survive dev-server restarts (which happen on every file
// change) and multi-process production servers. SQLite is already the single
// source of truth, so this adds no new infrastructure.

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILED_PER_EMAIL = 5;
const MAX_FAILED_PER_IP = 20;

export async function checkLoginRateLimit(
  email: string,
  ip: string
): Promise<{ allowed: boolean }> {
  const since = new Date(Date.now() - WINDOW_MS);
  const [failedByEmail, failedByIp] = await Promise.all([
    db.loginAttempt.count({ where: { email, succeeded: false, createdAt: { gte: since } } }),
    db.loginAttempt.count({ where: { ip, succeeded: false, createdAt: { gte: since } } }),
  ]);
  return {
    allowed: failedByEmail < MAX_FAILED_PER_EMAIL && failedByIp < MAX_FAILED_PER_IP,
  };
}

export async function recordLoginAttempt(params: {
  email: string;
  ip: string;
  succeeded: boolean;
  userId?: string;
}): Promise<void> {
  await db.loginAttempt.create({ data: params });
}
