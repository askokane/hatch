import crypto from "node:crypto";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "./db";
import { getSessionCookie, setSessionCookie, clearSessionCookie } from "./cookies";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const RENEWAL_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000; // slide when < 15 days remain

export type SessionUser = {
  userId: string;
  email: string;
  isAdmin: boolean;
  profileId: string | null;
  emailVerifiedAt: Date | null;
  /** Identity for the nav's account menu and the feed composer's avatar. Null
   *  until onboarding creates the profile — every consumer gates on profileId. */
  name: string | null;
  handle: string | null;
  avatarSeed: string | null;
};

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Creates a Session row and sets the cookie. Only callable from a Server Action
// or Route Handler (cookie mutation is not allowed during plain render).
export async function createSession(userId: string): Promise<void> {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.session.create({ data: { userId, tokenHash, expiresAt } });
  await setSessionCookie(token, expiresAt);
}

// Read-only lookup. Safe from Server Components, layouts, actions, route handlers.
// Returns null for missing/expired/invalid sessions. Never redirects.
//
// Wrapped in React's `cache()` below, so this body runs at most once per request
// no matter how many callers ask. That matters because the root layout resolves
// the session to render the nav AND the page itself calls requireSession — which
// was two identical Session lookups (plus a possible duplicate renewal write) on
// every single render. Memoizing is safe here because no request both mutates the
// session and re-reads it: every create/destroy is immediately followed by a
// redirect, so nothing can observe a stale memo.
async function loadSession(): Promise<SessionUser | null> {
  const token = await getSessionCookie();
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    // Widened from `{ id }` to carry the display identity as well. The nav
    // renders an avatar and an account menu on every authenticated page, so the
    // alternative was a second profile lookup per render for three columns the
    // session query was already joining.
    include: {
      user: {
        include: { profile: { select: { id: true, name: true, handle: true, avatarSeed: true } } },
      },
    },
  });

  if (!session || session.expiresAt < new Date()) return null;

  // Sliding renewal. The DB expiry is always bumped when under threshold; the
  // cookie refresh is best-effort because it only works from an action/route
  // context (Next throws on cookie mutation during a plain component render).
  if (session.expiresAt.getTime() - Date.now() < RENEWAL_THRESHOLD_MS) {
    const newExpiry = new Date(Date.now() + SESSION_TTL_MS);
    await db.session.update({ where: { id: session.id }, data: { expiresAt: newExpiry } });
    try {
      await setSessionCookie(token, newExpiry);
    } catch {
      // Not in a mutable (action/route) context this request; DB expiry bump is
      // enough — the cookie will catch up on the next action the user performs.
    }
  }

  return {
    userId: session.user.id,
    email: session.user.email,
    isAdmin: session.user.isAdmin,
    profileId: session.user.profile?.id ?? null,
    emailVerifiedAt: session.user.emailVerifiedAt,
    name: session.user.profile?.name ?? null,
    handle: session.user.profile?.handle ?? null,
    avatarSeed: session.user.profile?.avatarSeed ?? null,
  };
}

export const getSession = cache(loadSession);

// Redirects unauthenticated callers to /login with a validated relative return
// path. Use at the top of every protected page and every protected server action.
export async function requireSession(nextPath?: string): Promise<SessionUser> {
  const session = await getSession();
  if (!session) {
    const safeNext =
      nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/discover";
    redirect(`/login?next=${encodeURIComponent(safeNext)}`);
  }
  return session;
}

// Second-tier guard: many actions need a completed profile (created at onboarding).
// Returns the profileId or redirects to onboarding.
export async function requireProfile(session: SessionUser): Promise<string> {
  if (!session.profileId) redirect("/onboarding");
  return session.profileId;
}

// Deletes the session row (not just the cookie) and clears the cookie.
export async function destroySession(): Promise<void> {
  const token = await getSessionCookie();
  if (token) {
    await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  await clearSessionCookie();
}

// Invalidates every session for a user (used on password reset / change).
export async function destroyAllSessionsForUser(userId: string): Promise<void> {
  await db.session.deleteMany({ where: { userId } });
}
