"use client";

import { useEffect, useRef, useState } from "react";
import { sendMessageAction, markThreadReadAction } from "@/actions/messages";
import type { MessageDTO, ThreadPresence } from "@/actions/messages";
import { useThreadPolling } from "./useThreadPolling";
import { TypingIndicator } from "./TypingIndicator";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";
import { MESSAGE_MAX } from "@/lib/constants";

// Why the composer is closed, if it is. "BLOCKED_BY_ME" is the only state that
// names a block: it describes the viewer's own action. When the *other* party
// did the blocking the state is "CLOSED", which says nothing about why — the
// blocked person is prevented from writing, never told they were blocked.
export type ComposerState =
  | { kind: "OPEN" }
  | { kind: "BLOCKED_BY_ME"; name: string }
  | { kind: "CLOSED" };

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function ThreadView({
  threadId,
  myProfileId,
  counterpartName,
  initialMessages,
  initialHasOlder,
  initialPresence,
  composer,
}: {
  threadId: string;
  myProfileId: string;
  counterpartName: string;
  initialMessages: MessageDTO[];
  initialHasOlder: boolean;
  initialPresence: ThreadPresence;
  composer: ComposerState;
}) {
  const { notify } = useToast();
  const { messages, presence, append, reportTyping, loadOlder, hasOlder, loadingOlder } =
    useThreadPolling(threadId, initialMessages, initialPresence, initialHasOlder);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Both effects below key off the NEWEST message id rather than the array length,
  // because "load earlier" grows the array at the front. Keyed on length, loading
  // history would yank the reader back down to the newest message and fire a
  // redundant read-receipt write every time they paged up.
  const newestId = messages.at(-1)?.id ?? null;

  // Mark read on open and on every arrival. Doing it only on *change* used to
  // mean opening a thread full of unread messages never cleared the nav badge —
  // and never turned the sender's "delivered" into "seen".
  useEffect(() => {
    markThreadReadAction(threadId).catch(() => {});
  }, [threadId, newestId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [newestId, presence.otherTyping]);

  // Receipts belong on the newest own message only — a column of "seen" beside
  // every bubble is noise, and the newest one implies all the ones above it.
  const lastOwnIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].authorProfileId === myProfileId) return i;
    }
    return -1;
  })();

  const lastOwn = lastOwnIndex >= 0 ? messages[lastOwnIndex] : null;
  const seen =
    !!lastOwn &&
    !!presence.otherLastReadAt &&
    new Date(presence.otherLastReadAt).getTime() >= new Date(lastOwn.createdAt).getTime();

  function onBodyChange(value: string) {
    setBody(value);
    if (composer.kind === "OPEN") reportTyping(value.trim().length > 0);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    const res = await sendMessageAction(threadId, text);
    setBusy(false);
    if (res.ok) {
      append(res.data);
      setBody("");
      reportTyping(false);
    } else {
      notify(res.error, "error");
    }
  }

  return (
    <div className="flex h-[60vh] flex-col border border-hairline bg-white">
      {/* Message list with aria-live so new arrivals are announced. */}
      <div className="flex-1 overflow-y-auto p-4" aria-live="polite" aria-relevant="additions">
        {/* Only the newest page is server-rendered; the rest of the history is a
            click away rather than absent. */}
        {hasOlder && (
          <div className="mb-3 flex justify-center">
            <button
              type="button"
              onClick={loadOlder}
              disabled={loadingOlder}
              className="mono border border-hairline px-3 py-1 text-2xs text-ink-muted hover:border-ink hover:text-ink disabled:opacity-50"
            >
              {loadingOlder ? "loading…" : "load earlier messages"}
            </button>
          </div>
        )}
        {messages.length === 0 && !presence.otherTyping ? (
          <p className="mono py-8 text-center text-xs text-ink-muted">
            No messages yet. Say hello — reference why you connected.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {messages.map((m, i) => {
              const mine = m.authorProfileId === myProfileId;
              return (
                <li key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                  <div
                    className={`max-w-[80%] border px-3 py-2 text-sm ${
                      mine ? "border-pine bg-pine-soft" : "border-hairline bg-paper"
                    }`}
                  >
                    {/* Plain text only — React escapes; no HTML/markdown rendering. */}
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  </div>
                  <span className="mono mt-0.5 text-2xs text-ink-muted">
                    {mine ? "you" : m.authorName} · {timeOf(m.createdAt)}
                    {i === lastOwnIndex && (
                      <>
                        {" · "}
                        <span className={seen ? "text-pine" : undefined}>
                          {seen ? "✓✓ seen" : "✓ delivered"}
                        </span>
                      </>
                    )}
                  </span>
                </li>
              );
            })}
            {presence.otherTyping && <TypingIndicator name={counterpartName} />}
          </ul>
        )}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <div className="border-t border-hairline p-3">
        {composer.kind === "BLOCKED_BY_ME" ? (
          <p className="mono text-center text-xs text-ink-muted">
            You blocked {composer.name}. Unblock them in{" "}
            <a href="/settings" className="text-pine underline underline-offset-2">
              settings
            </a>{" "}
            to message again.
          </p>
        ) : composer.kind === "CLOSED" ? (
          <p className="mono text-center text-xs text-ink-muted">
            You can&apos;t send messages in this conversation.
          </p>
        ) : (
          <form onSubmit={send} className="flex items-end gap-2">
            <label htmlFor="composer" className="sr-only">
              Message
            </label>
            <textarea
              id="composer"
              value={body}
              onChange={(e) => onBodyChange(e.target.value)}
              onBlur={() => reportTyping(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(e as unknown as React.FormEvent);
                }
              }}
              rows={2}
              maxLength={MESSAGE_MAX}
              placeholder="Write a message… (Enter to send, Shift+Enter for newline)"
              className="flex-1 resize-none border border-hairline bg-white px-3 py-2 text-sm focus:border-ink"
            />
            <Button type="submit" disabled={busy || !body.trim()}>
              {busy ? "…" : "Send"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
