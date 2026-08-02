// Profile handle character policy — one definition, shared by the zod schema
// (the authority, server-side) and the client-side step validation in the
// onboarding wizard, so the two can never drift into disagreeing about what is
// legal.
//
// The set is the conservative intersection of what mainstream social platforms
// accept: lowercase letters, digits, underscore. It is an ALLOWLIST rather than a
// list of banned symbols, which is what makes it exhaustive — everything a
// platform typically rejects in a handle (".", "-", "@", "#", "$", "%", "&", "+",
// "/", "\", spaces, quotes, emoji, and anything else non-ASCII) is excluded by
// construction rather than by remembering to enumerate it.
//
// The hyphen is banned rather than merely discouraged. Handles appear in URLs
// (/u/[handle]) next to project slugs and tag slugs, which DO use hyphens; using
// the same separator in both made "is this a handle or a slug" ambiguous to read.
// Migration 20260802113000 rewrote every pre-existing "-" handle to "_".
export const HANDLE_PATTERN = /^[a-z0-9_]+$/;

export const HANDLE_CHARSET_MESSAGE =
  "Handle can only use lowercase letters, numbers, and underscores.";

export const HANDLE_HINT = "Lowercase letters, numbers, and underscores (_) only.";

// Best-effort repair of what someone typed or pasted, applied as they type:
// uppercase folds down, and "-", ".", and spaces — the separators people reach
// for out of habit, and what an imported handle from another platform will use —
// become "_". Anything still illegal after that is dropped rather than silently
// mapped to something the user did not intend.
//
// This never rejects; validation is still the schema's job. It only spares the
// user from being told "no" about a character it can unambiguously fix.
export function normalizeHandleInput(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[-.\s]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}
