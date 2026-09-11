import crypto from "node:crypto";
import { db } from "./db";

// Password reset tokens. Only a SHA-256 hash of each token is persisted, so a DB
// dump never yields a usable link. There is no mail provider wired up — links are
// printed to the server console instead.
//
// Email verification used to live here too. It was removed: with no mailbox in
// the loop, "verification" only proved the user could read a link this app had
// just handed them, so it gated real features behind a step that established
// nothing. Accounts are now usable immediately (see actions/auth.ts).

const RESET_TTL_MS = 60 * 60 * 1000; // 1h

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}

// --- Password reset ---

export async function createPasswordResetToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");
  await db.$transaction([
    db.passwordResetToken.deleteMany({ where: { userId, usedAt: null } }),
    db.passwordResetToken.create({ data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) } }),
  ]);
  return token;
}

export async function revokePasswordResetToken(rawToken: string): Promise<void> {
  await db.passwordResetToken.deleteMany({ where: { tokenHash: hashToken(rawToken) } });
}

export async function sendPasswordResetEmail(email: string, rawToken: string): Promise<boolean> {
  const link = `${appUrl()}/reset-password/${rawToken}`;
  if (process.env.NODE_ENV !== "production") {
    console.log(`\n[HATCH:dev-mail] Reset password for ${email}:\n  ${link}\n`);
    return true;
  }
  const endpoint = process.env.PASSWORD_RESET_WEBHOOK_URL;
  if (!endpoint) return false;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.PASSWORD_RESET_WEBHOOK_SECRET
        ? { authorization: `Bearer ${process.env.PASSWORD_RESET_WEBHOOK_SECRET}` }
        : {}),
    },
    body: JSON.stringify({ template: "password-reset", to: email, link }),
    signal: AbortSignal.timeout(10_000),
  });
  return response.ok;
}
