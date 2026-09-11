"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import {
  createSession,
  destroySession,
  requireSession,
} from "@/lib/session";
import { isAllowedRegistrationEmail, isEduOnlyMode } from "@/lib/edu-allowlist";
import { checkLoginRateLimit, recordLoginAttempt } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-meta";
import {
  createPasswordResetToken,
  sendPasswordResetEmail,
  revokePasswordResetToken,
} from "@/lib/email-verify";
import { safeLocalPath } from "@/lib/safe-path";
import { consumeRateLimit } from "@/lib/rate-limit";
import {
  signupSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  deleteAccountSchema,
} from "@/lib/validation/auth.schema";
import { ok, fail, type ActionResult } from "@/lib/action-result";

const GENERIC_LOGIN_ERROR = "Invalid email or password.";
const DUMMY_PASSWORD_HASH = "$2a$12$bJ9W0bxYtLr3IMjzcrF7me6q9juS8qBgdiKj2iM2zVHOv7qkcRjDe";

function firstError(parsed: { error: { issues: { message: string }[] } }): string {
  return parsed.error.issues[0]?.message ?? "Invalid input.";
}

// --- Signup: creates a User (Profile is created later at onboarding) ---
export async function signupAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return fail(firstError(parsed));

  const { email, password } = parsed.data;
  const ip = await getClientIp();
  if (!(await consumeRateLimit("signup-ip", ip, 5, 60 * 60 * 1000))) {
    return fail("Too many signup attempts. Please try again later.");
  }

  if (!isAllowedRegistrationEmail(email)) {
    return fail(
      isEduOnlyMode()
        ? "Registration requires a .edu email address."
        : "Enter a valid email address."
    );
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    // Signup may reveal existence (standard UX); login must not.
    return fail("An account with this email already exists.");
  }

  // Accounts are live immediately. A null verification timestamp is honest:
  // no mailbox challenge has occurred and this field must never imply otherwise.
  const user = await db.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      emailVerifiedAt: null,
    },
  });

  await createSession(user.id);
  redirect("/onboarding");
}

// --- Login ---
export async function loginAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return fail(firstError(parsed));

  const { email, password } = parsed.data;
  const ip = await getClientIp();

  const { allowed } = await checkLoginRateLimit(email, ip);
  if (!allowed) {
    return fail("Too many attempts. Please wait a few minutes and try again.");
  }

  const user = await db.user.findUnique({ where: { email } });
  // Always compare against something to reduce timing signal; never reveal which
  // half failed.
  const passwordOk = await verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);

  if (!user || !passwordOk) {
    await recordLoginAttempt({ email, ip, succeeded: false, userId: user?.id });
    return fail(GENERIC_LOGIN_ERROR);
  }

  await recordLoginAttempt({ email, ip, succeeded: true, userId: user.id });
  await createSession(user.id, user.credentialVersion);

  const next = formData.get("next");
  const safeNext = safeLocalPath(next);
  redirect(safeNext);
}

// --- Logout ---
export async function logoutAction(): Promise<void> {
  await requireSession();
  await destroySession();
  redirect("/login");
}

// --- Forgot password: always generic response (no account enumeration) ---
export async function requestPasswordResetAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return fail(firstError(parsed));

  const { email } = parsed.data;
  const ip = await getClientIp();
  if (!(await consumeRateLimit("password-reset-ip", ip, 8, 60 * 60 * 1000))) return ok(undefined);
  const user = await db.user.findUnique({ where: { email } });
  if (user) {
    const token = await createPasswordResetToken(user.id);
    const delivered = await sendPasswordResetEmail(email, token).catch(() => false);
    if (!delivered) {
      await revokePasswordResetToken(token);
    }
  }
  // Same response whether or not the account exists.
  return ok(undefined);
}

// --- Reset password (token is the credential) ---
export async function resetPasswordAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });
  if (!parsed.success) return fail(firstError(parsed));

  const passwordHash = await hashPassword(parsed.data.password);
  const tokenHash = (await import("node:crypto")).createHash("sha256").update(parsed.data.token).digest("hex");
  const changed = await db.$transaction(async (tx) => {
    const row = await tx.passwordResetToken.findUnique({ where: { tokenHash }, select: { id: true, userId: true } });
    if (!row) return false;
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: row.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) return false;
    await tx.user.update({ where: { id: row.userId }, data: { passwordHash, credentialVersion: { increment: 1 } } });
    await tx.session.deleteMany({ where: { userId: row.userId } });
    await tx.passwordResetToken.deleteMany({ where: { userId: row.userId } });
    return true;
  });
  if (!changed) return fail("This reset link is invalid or has expired.");
  return ok(undefined);
}

// --- Change password (own account only; no ID accepted from client) ---
export async function changePasswordAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
  });
  if (!parsed.success) return fail(firstError(parsed));

  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user || !(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
    return fail("Your current password is incorrect.");
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await db.$transaction([
    db.user.update({ where: { id: session.userId }, data: { passwordHash, credentialVersion: { increment: 1 } } }),
    db.session.deleteMany({ where: { userId: session.userId } }),
    db.passwordResetToken.deleteMany({ where: { userId: session.userId } }),
  ]);
  await createSession(session.userId);
  return ok(undefined);
}

// --- Delete account (own account only; cascades via schema) ---
export async function deleteAccountAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = deleteAccountSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
  });
  if (!parsed.success) return fail(firstError(parsed));

  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user || !(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
    return fail("Password is incorrect.");
  }

  await db.$transaction(async (tx) => {
    const profile = await tx.profile.findUnique({
      where: { userId: session.userId },
      select: { id: true, memberships: { where: { isOwner: true }, select: { projectId: true } } },
    });
    if (profile) {
      for (const membership of profile.memberships) {
        const owners = await tx.membership.count({ where: { projectId: membership.projectId, isOwner: true } });
        if (owners === 1) await tx.project.delete({ where: { id: membership.projectId } });
      }
    }
    await tx.user.delete({ where: { id: session.userId } });
  });
  await destroySession();
  redirect("/");
}
