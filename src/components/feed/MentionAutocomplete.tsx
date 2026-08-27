"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { searchMentionCandidatesAction } from "@/actions/posts";
import { Avatar } from "@/components/ui/Avatar";
import { activeMentionQuery, type MentionCandidate } from "@/lib/mentions";

// The "@" suggestion list behind the post composer.
//
// It is a CONVENIENCE, and it is worth being explicit about that: it does not
// decide anything. The server re-derives which handles in the submitted body are
// real mentions, from the session, under the same connection rule — so a user
// who never opens this list and types "@alice" by hand gets exactly the same
// result, and one who tampers with what it returns gets nothing extra. What the
// list is for is that you cannot mention someone whose handle you can't recall.
//
// Kept out of PostComposer because it is a self-contained interaction — a caret
// token, a debounced query, a keyboard-driven list — and folding it into a
// component already managing uploads, previews and an expand/collapse would
// leave both harder to follow.

// Long enough that a fast typist issues one request per word rather than one per
// letter; short enough that the list still feels attached to the keyboard.
const DEBOUNCE_MS = 150;

// A stable per-instance id would be better form, but the composer is a singleton
// on every surface that has one, and aria-activedescendant has to name a row
// that actually exists.
const MENTION_LIST_ID = "mention-suggestions";

function optionId(index: number) {
  return `${MENTION_LIST_ID}-${index}`;
}

type Token = { query: string; start: number };

export function useMentionAutocomplete({
  value,
  setValue,
  textareaRef,
}: {
  value: string;
  setValue: (next: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const [token, setToken] = useState<Token | null>(null);
  const [items, setItems] = useState<MentionCandidate[]>([]);
  const [active, setActive] = useState(0);
  // Escape closes the list without clearing the half-typed handle. Remembering
  // WHICH token was dismissed is what stops it springing back open on the next
  // keystroke, while still letting a genuinely new "@" open it again.
  const [dismissed, setDismissed] = useState<string | null>(null);

  // Only the newest in-flight request may write to state; a slower earlier one
  // would otherwise repopulate the list with results for a prefix the user has
  // already typed past.
  const requestSeq = useRef(0);
  // Set when an insertion moves the caret; applied once the new value has
  // rendered, since setting a selection on stale text puts it in the wrong place.
  const pendingCaret = useRef<number | null>(null);

  const open = token !== null && items.length > 0 && dismissed !== token.query;

  // Re-read the token from the caret. Called after anything that can move it —
  // typing, clicking into the middle of a draft, arrowing around — because the
  // token is defined by where the caret is, not by what was last typed.
  const syncToken = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const next = activeMentionQuery(el.value, el.selectionStart ?? el.value.length);
    setToken((prev) => {
      if (prev?.query === next?.query && prev?.start === next?.start) return prev;
      return next;
    });
  }, [textareaRef]);

  // Typing past a dismissal is a new intent; re-arm the list.
  useEffect(() => {
    if (token === null) setDismissed(null);
    else if (dismissed !== null && dismissed !== token.query) setDismissed(null);
  }, [token, dismissed]);

  useEffect(() => {
    if (token === null) {
      setItems([]);
      return;
    }
    const seq = ++requestSeq.current;
    const query = token.query;
    const timer = setTimeout(async () => {
      const res = await searchMentionCandidatesAction(query);
      if (seq !== requestSeq.current) return;
      // A failed lookup closes the list rather than raising a message. The list
      // is an accelerator on a field that works without it, and an error banner
      // over a composer someone is mid-sentence in costs more than it explains.
      setItems(res.ok ? res.data : []);
      setActive(0);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [token]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el || pendingCaret.current === null) return;
    el.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  }, [value, textareaRef]);

  const insert = useCallback(
    (candidate: MentionCandidate) => {
      const el = textareaRef.current;
      if (!el || !token) return;
      const caret = el.selectionStart ?? el.value.length;
      // The trailing space is not cosmetic: it terminates the token, which is
      // what closes the list and stops the next character typed from re-opening
      // it as a continuation of a handle that is already complete.
      const inserted = `@${candidate.handle} `;
      const next = value.slice(0, token.start) + inserted + value.slice(caret);
      pendingCaret.current = token.start + inserted.length;
      setValue(next);
      setToken(null);
      setItems([]);
      el.focus();
    },
    [setValue, textareaRef, token, value]
  );

  /**
   * Keyboard handling for the list. Returns true when it consumed the event, so
   * the composer can skip its own handling of the same key — Enter belongs to
   * the list while the list is open, and to the textarea when it is not.
   */
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): boolean {
    // Ctrl/Cmd+Enter is "post this", including mid-mention. Letting the list eat
    // it would make the shortcut silently unreliable.
    if (e.metaKey || e.ctrlKey) return false;
    if (!open) return false;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((i) => (i + 1) % items.length);
        return true;
      case "ArrowUp":
        e.preventDefault();
        setActive((i) => (i - 1 + items.length) % items.length);
        return true;
      case "Enter":
      case "Tab": {
        const candidate = items[active];
        if (!candidate) return false;
        e.preventDefault();
        insert(candidate);
        return true;
      }
      case "Escape":
        e.preventDefault();
        setDismissed(token?.query ?? "");
        return true;
      default:
        return false;
    }
  }

  function reset() {
    setToken(null);
    setItems([]);
    setActive(0);
    setDismissed(null);
  }

  return {
    open,
    items,
    active,
    setActive,
    syncToken,
    onKeyDown,
    insert,
    reset,
    /** Wired to the textarea so a reader is told the list exists and what is on it. */
    textareaProps: {
      "aria-expanded": open,
      "aria-controls": open ? MENTION_LIST_ID : undefined,
      "aria-activedescendant": open ? optionId(active) : undefined,
      "aria-autocomplete": "list" as const,
    },
  };
}

export function MentionSuggestions({
  items,
  active,
  onPick,
  onHover,
}: {
  items: MentionCandidate[];
  active: number;
  onPick: (candidate: MentionCandidate) => void;
  onHover: (index: number) => void;
}) {
  return (
    // In the composer's flow rather than floating over it. An absolutely
    // positioned popover would have to be measured against a textarea that grows
    // as you type and a toolbar that appears on focus; in-flow, the browser does
    // that arithmetic. The composer is an expanding surface already, so growing
    // by a few rows is a shape it has anyway.
    <ul
      id={MENTION_LIST_ID}
      role="listbox"
      aria-label="People you can mention"
      className="w-full shrink-0 border border-hairline bg-white"
    >
      {items.map((candidate, i) => (
        <li key={candidate.profileId} role="none">
          <button
            type="button"
            id={optionId(i)}
            role="option"
            aria-selected={i === active}
            // mousedown, not click: click fires after blur, and blurring the
            // textarea first loses the caret position the insertion is computed
            // from. preventDefault keeps focus where it is.
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(candidate);
            }}
            onMouseEnter={() => onHover(i)}
            className={`flex w-full items-center gap-2 px-2 py-1.5 text-left ${
              i === active ? "bg-pine-soft" : "hover:bg-hairline/30"
            }`}
          >
            <Avatar
              seed={candidate.avatarSeed}
              assetId={candidate.avatarAssetId}
              size={24}
              className="shrink-0"
            />
            <span className="min-w-0 flex-1 truncate text-xs">{candidate.name}</span>
            <span className="mono shrink-0 text-2xs text-ink-muted">@{candidate.handle}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
