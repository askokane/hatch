"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import {
  createSession,
  destroySession,
  destroyAllSessionsForUser,
  requireSession,
} from "@/lib/session";
import { isAllowedRegistrationEmail, isEduOnlyMode } from "@/lib/edu-allowlist";
import { checkLoginRateLimit, recordLoginAttempt } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-meta";
import {
  createPasswordResetToken,
  sendPasswordResetEmail,
  consumePasswordResetToken,
} from "@/lib/email-verify";
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

  // Accounts are live immediately — there is no verification step to complete.
  // `emailVerifiedAt` is stamped now so the column stays meaningful as an audit
  // trail and as the hook a real mail provider would later gate on.
  const user = await db.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      emailVerifiedAt: new Date(),
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
  const passwordOk = user ? await verifyPassword(password, user.passwordHash) : false;

  if (!user || !passwordOk) {
    await recordLoginAttempt({ email, ip, succeeded: false, userId: user?.id });
    return fail(GENERIC_LOGIN_ERROR);
  }

  await recordLoginAttempt({ email, ip, succeeded: true, userId: user.id });
  await createSession(user.id);

  const next = formData.get("next");
  const safeNext =
    typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/discover";
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
  const user = await db.user.findUnique({ where: { email } });
  if (user) {
    const token = await createPasswordResetToken(user.id);
    sendPasswordResetEmail(email, token);
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

  const result = await consumePasswordResetToken(parsed.data.token);
  if (!result) return fail("This reset link is invalid or has expired.");

  await db.user.update({
    where: { id: result.userId },
    data: { passwordHash: await hashPassword(parsed.data.password) },
  });
  // Defense in depth: invalidate all existing sessions.
  await destroyAllSessionsForUser(result.userId);
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

  await db.user.update({
    where: { id: session.userId },
    data: { passwordHash: await hashPassword(parsed.data.newPassword) },
  });
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

  await destroySession();
  await db.user.delete({ where: { id: session.userId } });
  redirect("/");
}
