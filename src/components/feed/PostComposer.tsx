"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPostAction } from "@/actions/posts";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";
import { MentionSuggestions, useMentionAutocomplete } from "./MentionAutocomplete";
import {
  ALLOWED_IMAGE_MIME,
  ALLOWED_VIDEO_MIME,
  IMAGE_BYTES_MAX,
  POST_BODY_MAX,
  POST_MEDIA_MAX,
  VIDEO_BYTES_MAX,
} from "@/lib/constants";

// The `as const` arrays are tuples of literals; widen them once for `.includes`.
const IMAGE_MIME: readonly string[] = ALLOWED_IMAGE_MIME;
const VIDEO_MIME: readonly string[] = ALLOWED_VIDEO_MIME;
const ACCEPT = [...ALLOWED_IMAGE_MIME, ...ALLOWED_VIDEO_MIME].join(",");

// Past this fraction of the cap the remaining-character count starts mattering;
// before it, it is chrome reporting a number nobody is near.
const COUNTER_VISIBLE_AT = 0.75;
// Auto-grow ceiling. Beyond this the textarea scrolls rather than pushing the
// feed off the screen — the composer is a compact surface even mid-draft.
const TEXTAREA_MAX_PX = 220;

type Staged = {
  localId: string;
  name: string;
  kind: "IMAGE" | "VIDEO";
  /** Object URL for the local preview — revoked on removal and on unmount. */
  previewUrl: string;
  status: "uploading" | "ready" | "error";
  progress: number;
  assetId?: string;
  error?: string;
};

let stagedCounter = 0;

function formatBytes(bytes: number): string {
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
}

function MediaIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <rect x="2.5" y="3.5" width="15" height="13" />
      <circle cx="7" cy="8" r="1.5" />
      <path d="M2.5 13.5l4-3.5 4 3.5 3-2.5 4 3.5" />
    </svg>
  );
}

// Client-side triage. This is a courtesy that saves the user a pointless upload
// and gives an instant message — it is NOT the guard. The upload route re-checks
// type and size against the same constants, because anything decided in this
// file can be skipped entirely by posting to /api/media directly.
function classify(file: File): { kind: "IMAGE" | "VIDEO" } | { error: string } {
  if (IMAGE_MIME.includes(file.type)) {
    if (file.size > IMAGE_BYTES_MAX) {
      return { error: `${file.name} is ${formatBytes(file.size)} — images cap at ${formatBytes(IMAGE_BYTES_MAX)}.` };
    }
    return { kind: "IMAGE" };
  }
  if (VIDEO_MIME.includes(file.type)) {
    if (file.size > VIDEO_BYTES_MAX) {
      return { error: `${file.name} is ${formatBytes(file.size)} — video caps at ${formatBytes(VIDEO_BYTES_MAX)}.` };
    }
    return { kind: "VIDEO" };
  }
  return { error: `${file.name || "That file"} isn't a supported photo or video format.` };
}

// XMLHttpRequest rather than fetch, for one reason: fetch cannot report upload
// progress. A multi-megabyte video on a slow connection is several seconds of a
// composer that would otherwise look frozen, and "is it working?" is the wrong
// question for a user to be asking mid-post.
function uploadFile(
  file: File,
  onProgress: (percent: number) => void
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    const form = new FormData();
    form.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/media");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let payload: { id?: string; error?: string } = {};
      try {
        payload = JSON.parse(xhr.responseText);
      } catch {
        // Fall through to the generic message below.
      }
      if (xhr.status >= 200 && xhr.status < 300 && payload.id) {
        resolve({ ok: true, id: payload.id });
      } else {
        // The route's own message is the useful one (size, type, quota); only
        // invent text when there wasn't any.
        resolve({ ok: false, error: payload.error ?? "Upload failed. Try again." });
      }
    };
    xhr.onerror = () => resolve({ ok: false, error: "Upload failed — check your connection." });
    xhr.send(form);
  });
}

// The composer every profile posts from. Media uploads immediately on selection
// so the post itself carries only asset ids: the alternative — one request
// holding text and several files — would put the whole payload behind a single
// retry, and a Server Action body is capped far below a video anyway.
//
// Shape-wise this is one line until you use it. The previous version rendered a
// field label, a three-row box, a permanent character count, a raw file input
// and a two-line format disclaimer — roughly a third of a laptop viewport spent,
// on every visit, on a thing most readers scroll straight past. Everything below
// the first line is now revealed on focus, which is the arrangement X, Facebook
// and Instagram all arrived at: the feed is what the page is for, and the
// composer should cost one line of it until someone actually wants to write.
export function PostComposer({
  avatarSeed,
  avatarAssetId,
}: {
  avatarSeed: string;
  avatarAssetId: string | null;
}) {
  const router = useRouter();
  const { notify } = useToast();
  const fileInputId = useId();
  const hintId = `${fileInputId}-hint`;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [body, setBody] = useState("");
  const [staged, setStaged] = useState<Staged[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Revealed on first focus and kept open until the draft is posted or
  // discarded. Deliberately NOT closed on blur: the Post button is outside the
  // textarea, so a blur-collapse would race the click that submits.
  const [expanded, setExpanded] = useState(false);

  // "@" suggestions. The hook owns the caret token, the debounced lookup and the
  // list's keyboard model; the composer owns the text. It is handed setBody
  // rather than its own state so an insertion is the same kind of edit as typing
  // — the character counter, the auto-grow and the post-enabled check all see it
  // without knowing mentions exist.
  const mention = useMentionAutocomplete({ value: body, setValue: setBody, textareaRef });

  // Object URLs are held by the browser until explicitly revoked; a composer
  // opened and abandoned would otherwise pin every file the user previewed for
  // the life of the tab. A ref mirrors the state so the unmount cleanup can run
  // once, without re-subscribing on every keystroke.
  const stagedRef = useRef<Staged[]>([]);
  useEffect(() => {
    stagedRef.current = staged;
  }, [staged]);
  useEffect(() => {
    return () => {
      for (const s of stagedRef.current) URL.revokeObjectURL(s.previewUrl);
    };
  }, []);

  // Grow to fit the draft, then stop. Runs before paint so the box never renders
  // at the wrong height for a frame.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_PX)}px`;
    el.style.overflowY = el.scrollHeight > TEXTAREA_MAX_PX ? "auto" : "hidden";
  }, [body, expanded]);

  function patch(localId: string, changes: Partial<Staged>) {
    setStaged((prev) => prev.map((s) => (s.localId === localId ? { ...s, ...changes } : s)));
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    // Reset the input immediately: without this, removing a file and re-picking
    // the same one fires no change event, because the value never changed.
    e.target.value = "";
    if (picked.length === 0) return;
    setError(null);
    // Choosing a file is a commitment to posting, so open the full composer even
    // if the user never touched the text field.
    setExpanded(true);

    const remaining = POST_MEDIA_MAX - staged.length;
    if (remaining <= 0) {
      setError(`A post can carry ${POST_MEDIA_MAX} attachments.`);
      return;
    }
    const accepted = picked.slice(0, remaining);
    if (picked.length > remaining) {
      setError(`Only the first ${remaining} of those fit — a post carries ${POST_MEDIA_MAX}.`);
    }

    for (const file of accepted) {
      const verdict = classify(file);
      if ("error" in verdict) {
        setError(verdict.error);
        continue;
      }
      const localId = `staged-${++stagedCounter}`;
      const previewUrl = URL.createObjectURL(file);
      setStaged((prev) => [
        ...prev,
        { localId, name: file.name, kind: verdict.kind, previewUrl, status: "uploading", progress: 0 },
      ]);

      void uploadFile(file, (percent) => patch(localId, { progress: percent })).then((res) => {
        if (res.ok) patch(localId, { status: "ready", progress: 100, assetId: res.id });
        else patch(localId, { status: "error", error: res.error });
      });
    }
  }

  function remove(localId: string) {
    setStaged((prev) => {
      const target = prev.find((s) => s.localId === localId);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((s) => s.localId !== localId);
    });
    setError(null);
  }

  function reset() {
    for (const s of stagedRef.current) URL.revokeObjectURL(s.previewUrl);
    setStaged([]);
    setBody("");
    mention.reset();
    setError(null);
    setExpanded(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const uploading = staged.some((s) => s.status === "uploading");
  const readyIds = staged.filter((s) => s.status === "ready" && s.assetId).map((s) => s.assetId!);
  const trimmed = body.trim();
  const overLimit = trimmed.length > POST_BODY_MAX;
  // A post needs *something*: text or media. Empty-with-nothing-attached is the
  // only combination the server rejects outright.
  const canPost = !busy && !uploading && !overLimit && (trimmed.length > 0 || readyIds.length > 0);
  const remainingChars = POST_BODY_MAX - trimmed.length;
  const showCounter = trimmed.length >= POST_BODY_MAX * COUNTER_VISIBLE_AT;

  async function submit() {
    if (!canPost) return;
    setError(null);
    setBusy(true);
    const res = await createPostAction({ body: trimmed, mediaIds: readyIds });
    setBusy(false);

    if (res.ok) {
      reset();
      notify("Posted.", "success");
      // The feed's first page is server-rendered; refresh pulls it back down
      // with the new post in place (FeedList resets its paging to match).
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submit();
  }

  // Ctrl/Cmd+Enter submits from inside the textarea — the shortcut every one of
  // these composers honours, and the only way to post without leaving the keys.
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // The suggestion list gets first refusal: while it is open, Enter picks a
    // person rather than posting, and the arrow keys move through it rather than
    // through the draft. It declines everything when closed.
    if (mention.onKeyDown(e)) return;
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <form
      className="border border-hairline bg-white px-3 py-2.5 transition-colors focus-within:border-ink/30 sm:px-4"
      onSubmit={onSubmit}
    >
      <div className="flex gap-3">
        <Avatar seed={avatarSeed} assetId={avatarAssetId} size={36} className="mt-0.5 shrink-0" />

        {/* One wrapping flex row, not a stack of conditional blocks. Collapsed,
            the text field and the media button are the only items and sit side
            by side; expanded, the full-width items (textarea, previews, rule)
            force wraps and the media button lands at the head of the toolbar
            row. Re-flowing one set of elements is what lets both states share a
            single file input — a second copy for the toolbar would put two
            controls with the same accessible name in the page. */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-2.5">
          <label htmlFor={`${fileInputId}-body`} className="sr-only">
            Post to your feed
          </label>
          <textarea
            id={`${fileInputId}-body`}
            ref={textareaRef}
            value={body}
            // Focus is the usual trigger, but not the only one: submitting with
            // Ctrl+Enter leaves the caret in a textarea that just collapsed, and
            // a second draft typed into it would never reopen the toolbar on
            // focus alone.
            onChange={(e) => {
              setBody(e.target.value);
              setExpanded(true);
              mention.syncToken();
            }}
            onFocus={() => setExpanded(true)}
            // The caret can move without the text changing — a click into the
            // middle of a draft, an arrow key, a selection — and the "@word" the
            // list is offering completions for is defined by where the caret IS,
            // not by what was last typed. onSelect is the one event that fires
            // for all of those.
            onSelect={mention.syncToken}
            onKeyDown={onKeyDown}
            rows={1}
            // Short enough to stay on one line at 390px. The longer prompt this
            // replaces ("...learning, or stuck on?") wrapped on a phone, which
            // cost the collapsed composer the single-line height that is the
            // whole point of it.
            placeholder="What are you building?"
            // `w-full` alone would NOT claim the line: a flex item still shrinks
            // to make room for its neighbours, which is exactly how the media
            // button ended up sharing this row when it should have wrapped. Only
            // `shrink-0` makes the full width binding.
            className={`resize-none border-0 bg-transparent p-0 py-1 text-base leading-relaxed placeholder:text-ink-muted focus:outline-none ${
              expanded ? "w-full shrink-0" : "min-w-0 flex-1"
            }`}
            {...mention.textareaProps}
          />

          {mention.open && (
            <MentionSuggestions
              items={mention.items}
              active={mention.active}
              onPick={mention.insert}
              onHover={mention.setActive}
            />
          )}

          {staged.length > 0 && (
            <ul className="grid w-full shrink-0 grid-cols-2 gap-2 sm:grid-cols-4">
              {staged.map((s) => (
                <li key={s.localId} className="relative overflow-hidden border border-hairline bg-black/[0.03]">
                  {s.kind === "IMAGE" ? (
                    // Local object URL, decorative here — the filename is announced
                    // by the remove button's accessible name just below.
                    <img src={s.previewUrl} alt="" className="aspect-square w-full object-cover" />
                  ) : (
                    <video
                      src={s.previewUrl}
                      className="aspect-square w-full object-cover"
                      muted
                      playsInline
                      preload="metadata"
                    />
                  )}

                  <button
                    type="button"
                    onClick={() => remove(s.localId)}
                    aria-label={`Remove ${s.name}`}
                    className="absolute right-1 top-1 border border-hairline bg-paper px-1.5 text-2xs text-ink-muted hover:border-brick hover:text-brick"
                  >
                    ×
                  </button>

                  {s.status === "uploading" && (
                    <div
                      className="absolute inset-x-0 bottom-0 bg-paper/95 px-1 py-0.5"
                      role="progressbar"
                      aria-valuenow={s.progress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Uploading ${s.name}`}
                    >
                      <div className="h-1 w-full bg-hairline">
                        <div className="h-full bg-pine" style={{ width: `${s.progress}%` }} />
                      </div>
                      <span className="mono text-2xs text-ink-muted">{s.progress}%</span>
                    </div>
                  )}

                  {s.status === "error" && (
                    <p className="mono absolute inset-x-0 bottom-0 bg-brick-soft px-1 py-0.5 text-2xs text-brick">
                      failed
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}

          {error && (
            <p role="alert" className="mono w-full shrink-0 text-2xs text-brick">
              {error}
            </p>
          )}

          {/* A full-width, zero-height item: it draws the rule above the toolbar
              and forces the wrap that puts the toolbar on its own row. */}
          {expanded && (
            <div aria-hidden="true" className="w-full shrink-0 border-t border-hairline" />
          )}

          {/* The media button sits here — after the rule — so that DOM order
              alone produces both layouts: collapsed there is no rule and it
              lands beside the text field, expanded it heads the toolbar row.
              `order` utilities were the wrong tool; source order is the thing
              the accessible name and the focus sequence follow anyway.
              The input stays immediately before its label, which is what `peer`
              requires; `sr-only` positions it absolutely, so it claims no slot. */}
          <input
            id={fileInputId}
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            multiple
            onChange={onPick}
            disabled={staged.length >= POST_MEDIA_MAX}
            aria-describedby={hintId}
            className="peer sr-only"
          />
          <label
            htmlFor={fileInputId}
            title="Add photos or video"
            className="mr-auto flex shrink-0 cursor-pointer items-center gap-1.5 border border-transparent px-1.5 py-1 text-pine transition-colors hover:border-hairline hover:bg-black/[0.03] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-pine peer-disabled:cursor-not-allowed peer-disabled:opacity-40 sm:mr-0"
          >
            <MediaIcon />
            <span className="sr-only">add photos or video</span>
            {expanded && staged.length > 0 && (
              <span aria-hidden="true" className="mono text-2xs text-ink-muted">
                {staged.length}/{POST_MEDIA_MAX}
              </span>
            )}
          </label>

          {expanded && (
            <>
              {uploading ? (
                <span className="mono hidden text-2xs text-ink-muted sm:mr-auto sm:block">
                  uploading media…
                </span>
              ) : (
                <p id={hintId} className="mono hidden text-2xs text-ink-muted sm:mr-auto sm:block">
                  {POST_MEDIA_MAX} photos or clips · {formatBytes(IMAGE_BYTES_MAX)} each
                </p>
              )}

              {/* Silent until it is nearly relevant, then counts down rather than
                  up: "40 left" is the number you act on, "960/1000" is not. */}
              {showCounter && (
                <span
                  className={`mono text-2xs tabular-nums ${overLimit ? "text-brick" : "text-ink-muted"}`}
                  aria-live="polite"
                >
                  {remainingChars} left
                </span>
              )}

              <button
                type="button"
                onClick={reset}
                disabled={busy}
                className="mono ml-1 text-xs text-ink-muted hover:text-ink disabled:opacity-50"
              >
                cancel
              </button>
              <Button type="submit" disabled={!canPost} className="px-5">
                {busy ? "Posting…" : "Post"}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Kept in the tree while collapsed so the file input's description always
          resolves; the visible copy above replaces it once expanded. */}
      {!expanded && (
        <p id={hintId} className="sr-only">
          Up to {POST_MEDIA_MAX} attachments · JPEG, PNG, GIF, WebP · MP4, WebM, MOV ·{" "}
          {formatBytes(IMAGE_BYTES_MAX)} each.
        </p>
      )}
    </form>
  );
}
