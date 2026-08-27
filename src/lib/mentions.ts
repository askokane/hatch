// Parsing "@handle" out of a body, and cutting that body into the pieces a
// renderer needs. Pure string work — no database, no React — because both sides
// of the feature have to agree on exactly what counts as a mention: the server
// decides which handles become PostMention rows, and the client decides which
// runs of text become links. If those two disagreed, a post could carry a
// mention row nothing renders, or render a link the server never authorized.
//
// Deliberately NOT a Markdown-ish parser. The only syntax a post has is this one
// token; everything else is plain text, escaped by React the same as before.

import { HANDLE_PATTERN } from "./handle";

// The scanner. The charset matches HANDLE_PATTERN (lowercase, digits,
// underscore) with uppercase added, because people type "@Alice" for a handle
// stored as "alice" and it would be perverse to drop the mention over a shift
// key. Length bounds mirror handleSchema (3–30) so a token that could never be a
// handle is not even looked up.
//
// A preceding-character check does the work a lookbehind would: it keeps
// "foo@bar" (an email address, a filename) from reading as a mention of @bar.
// Written as an explicit index check rather than `(?<!...)` so the module parses
// in every browser that ships this bundle — a lookbehind that throws at parse
// time takes the whole file with it, on a surface where the fallback is a blank
// feed.
const TOKEN = /@([A-Za-z0-9_]{3,30})/g;

function isBoundary(char: string | undefined): boolean {
  // Start of string counts; so does anything that is not a handle character. The
  // set is the same one TOKEN accepts, which is what makes "a@b" and "@b" differ.
  return char === undefined || !/[A-Za-z0-9_]/.test(char);
}

export type MentionToken = {
  /** Lowercased handle, ready to look up. */
  handle: string;
  /** Index of the "@" in the body. */
  start: number;
  /** Index one past the last character of the handle. */
  end: number;
};

/** Every "@handle" in `body`, in order, including repeats. */
export function scanMentionTokens(body: string): MentionToken[] {
  const out: MentionToken[] = [];
  TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN.exec(body)) !== null) {
    const start = match.index;
    if (!isBoundary(body[start - 1])) continue;
    const raw = match[1]!;
    const handle = raw.toLowerCase();
    // Rejected the same way the profile schema would reject it, so the server
    // never issues a lookup for a string that cannot be anybody's handle.
    if (!HANDLE_PATTERN.test(handle) || handle.startsWith("_") || handle.endsWith("_")) continue;
    out.push({ handle, start, end: start + match[0].length });
  }
  return out;
}

/** The distinct handles mentioned in `body`, lowercased. */
export function extractMentionHandles(body: string): string[] {
  return [...new Set(scanMentionTokens(body).map((t) => t.handle))];
}

/** One row of the composer's "@" suggestion list. */
export type MentionCandidate = {
  profileId: string;
  handle: string;
  name: string;
  avatarSeed: string;
  avatarAssetId: string | null;
};

/** A mention the server resolved and stored — what a renderer is allowed to link. */
export type ResolvedMention = {
  /** The handle as it was written, and as it still reads in the body. */
  handle: string;
  /** Where the link points today, which is not `handle` if they have renamed. */
  currentHandle: string;
  name: string;
  profileId: string;
};

export type BodySegment =
  | { kind: "text"; text: string }
  | { kind: "mention"; text: string; mention: ResolvedMention };

/**
 * Cuts `body` into text runs and mention runs.
 *
 * A token only becomes a mention segment if it is in `mentions` — the list the
 * server wrote at post time. That is the whole authorization story on the render
 * side: an "@someone" the author was not connected to was never stored, so it
 * comes back as ordinary text here, with no way for the client to promote it.
 */
export function toBodySegments(body: string, mentions: ResolvedMention[]): BodySegment[] {
  if (!body) return [];
  const byHandle = new Map(mentions.map((m) => [m.handle.toLowerCase(), m]));
  if (byHandle.size === 0) return [{ kind: "text", text: body }];

  const segments: BodySegment[] = [];
  let cursor = 0;
  for (const token of scanMentionTokens(body)) {
    const mention = byHandle.get(token.handle);
    if (!mention) continue;
    if (token.start > cursor) {
      segments.push({ kind: "text", text: body.slice(cursor, token.start) });
    }
    segments.push({ kind: "mention", text: body.slice(token.start, token.end), mention });
    cursor = token.end;
  }
  if (cursor < body.length) segments.push({ kind: "text", text: body.slice(cursor) });
  return segments;
}

/**
 * The "@word" the caret is sitting inside, or null.
 *
 * Drives the composer's suggestion list. It looks BACKWARDS from the caret only:
 * the token being typed ends at the caret by definition, and including whatever
 * follows would make the list flicker as it re-queried on text the user is not
 * editing. An empty query ("@" and nothing yet) is a real result — that is the
 * moment the list should open with the most recent connections in it.
 */
export function activeMentionQuery(
  value: string,
  caret: number
): { query: string; start: number } | null {
  const upto = value.slice(0, caret);
  const at = upto.lastIndexOf("@");
  if (at === -1) return null;
  if (!isBoundary(upto[at - 1])) return null;
  const query = upto.slice(at + 1);
  // Any character that cannot be in a handle ends the token — including the
  // space that follows a completed one, which is what closes the list after an
  // insertion.
  if (query.length > 30 || /[^A-Za-z0-9_]/.test(query)) return null;
  return { query, start: at };
}
