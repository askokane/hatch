// Validation shared by the two upload endpoints: POST /api/media (post
// attachments) and POST /api/avatar (profile pictures).
//
// It lives here rather than in either route because the rules are the same rules
// — the same MIME allowlist decides what a browser will be asked to render, and
// the same filename reduction decides what is safe to store as a display name.
// A second copy of that logic is a second place for it to drift, and the failure
// mode of drift is "one endpoint accepts what the other rejects", which is how a
// type ends up stored that the serving route then refuses to hand back.

import { ALLOWED_IMAGE_MIME, ALLOWED_VIDEO_MIME } from "@/lib/constants";

const MAX_FILENAME_LEN = 120;

export function mimeKind(mime: string): "IMAGE" | "VIDEO" | null {
  if ((ALLOWED_IMAGE_MIME as readonly string[]).includes(mime)) return "IMAGE";
  if ((ALLOWED_VIDEO_MIME as readonly string[]).includes(mime)) return "VIDEO";
  return null;
}

export function humanMB(bytes: number): string {
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
}

// Display-only. The stored name is never used to build a path or a URL — the
// asset is addressed by its cuid — but it is still reduced to a bare basename so
// nothing downstream can be tempted to treat it as one.
export function safeFileName(raw: string): string {
  const base = raw.split(/[/\\]/).pop() ?? "";
  // Drop C0 control characters (NUL, newlines, and friends). They have no place in
  // a display name and would otherwise ride verbatim into markup or logs. Filtered
  // by codepoint rather than by a regex holding literal control characters, which
  // are invisible and easy to corrupt in an edit.
  const printable = Array.from(base)
    .filter((ch) => ch.codePointAt(0)! >= 0x20 && ch.codePointAt(0)! !== 0x7f)
    .join("");
  return printable.trim().slice(0, MAX_FILENAME_LEN);
}
