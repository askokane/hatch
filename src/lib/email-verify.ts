import crypto from "node:crypto";
import { db } from "./db";

// Email verification + password reset tokens. Only a SHA-256 hash of each token
// is persisted, so a DB dump never yields a usable link. In dev there is no mail
// server — links are printed to the server console instead.

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const RESET_TTL_MS = 60 * 60 * 1000; // 1h

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}

// --- Email verification ---

export async function createVerificationToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");
  await db.emailVerificationToken.create({
    data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + VERIFY_TTL_MS) },
  });
  return token;
}

export async function consumeVerificationToken(
  rawToken: string
): Promise<{ userId: string } | null> {
  const row = await db.emailVerificationToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
  });
  if (!row || row.usedAt || row.expiresAt < new Date()) return null;
  await db.emailVerificationToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
  return { userId: row.userId };
}

export function sendVerificationEmail(email: string, rawToken: string): void {
  const link = `${appUrl()}/verify/${rawToken}`;
  // Dev "mail": console only. No external network call.
  console.log(`\n[HATCH:dev-mail] Verify ${email}:\n  ${link}\n`);
}

// --- Password reset ---

export async function createPasswordResetToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");
  await db.passwordResetToken.create({
    data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
  });
  return token;
}

export async function consumePasswordResetToken(
  rawToken: string
): Promise<{ userId: string } | null> {
  const row = await db.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
  });
  if (!row || row.usedAt || row.expiresAt < new Date()) return null;
  await db.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
  return { userId: row.userId };
}

export function sendPasswordResetEmail(email: string, rawToken: string): void {
  const link = `${appUrl()}/reset-password/${rawToken}`;
  console.log(`\n[HATCH:dev-mail] Reset password for ${email}:\n  ${link}\n`);
}
