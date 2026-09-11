"use client";

import { useEffect, useRef, useState } from "react";
import {
  sendProjectChatMessageAction,
  markProjectChatReadAction,
} from "@/actions/project-chat";
import type { ProjectChatMessageDTO, ProjectChatPresence } from "@/actions/project-chat";
import { useProjectChatPolling } from "./useProjectChatPolling";
import { TypingIndicator } from "@/components/messages/TypingIndicator";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";
import { MESSAGE_MAX } from "@/lib/constants";

// Why the composer is closed, if it is.
//
// Shorter than a thread's ComposerState by one case, and the missing case is the
// point: a thread can be closed BY A BLOCK, and a group chat cannot. Blocking a
// teammate hides them from you (the server never sends you their messages) but
// leaves the room open for everyone, including you. So the only reason a project
// chat stops accepting messages is the project itself closing.
export type ChatComposerState = { kind: "OPEN" } | { kind: "PROJECT_CLOSED" };

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// "Maya is typing…", "Maya and Ali are typing…", "Maya and 3 others are typing…".
//
// Named people stop at two. A room where five people are all typing is a room
// where the useful information is "several", and listing five names pushes the
// transcript up by a line every time one of them pauses.
function typingPhrase(names: string[]): string {
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return `${names[0]} and ${names.length - 1} others are typing…`;
}

export function ProjectChatView({
  chatId,
  myProfileId,
  initialMessages,
  initialHasOlder,
  initialPresence,
  composer,
}: {
  chatId: string;
  myProfileId: string;
  initialMessages: ProjectChatMessageDTO[];
  initialHasOlder: boolean;
  initialPresence: ProjectChatPresence;
  composer: ChatComposerState;
}) {
  const { notify } = useToast();
  const { messages, presence, append, reportTyping, loadOlder, hasOlder, loadingOlder, connectionState } =
    useProjectChatPolling(chatId, initialMessages, initialPresence, initialHasOlder);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const pendingClientId = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Both effects below key off the NEWEST message id rather than the array length,
  // because "load earlier" grows the array at the front. Keyed on length, loading
  // history would yank the reader back down to the newest message and fire a
  // redundant read-receipt write every time they paged up.
  const newestId = messages.at(-1)?.id ?? null;

  // Mark read on open and on every arrival, so the unread badge on the project
  // and in the nav clears while you are actually looking at the room.
  useEffect(() => {
    if (newestId) markProjectChatReadAction(chatId, newestId).catch(() => {});
  }, [chatId, newestId]);

  // Pin the transcript to its newest message by assigning scrollTop rather than
  // calling scrollIntoView({ behavior: "smooth" }), which a browser is allowed to
  // decline — and declining it means no scroll at all rather than an instant one.
  // Setting the offset is not a request, so it cannot be declined.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [newestId, presence.typingNames.length]);

  // Receipts belong on the newest own message only — a column of counts beside
  // every bubble is noise, and the newest one implies all the ones above it.
  const lastOwnIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].authorProfileId === myProfileId) return i;
    }
    return -1;
  })();

  function onBodyChange(value: string) {
    setBody(value);
    if (composer.kind === "OPEN") reportTyping(value.trim().length > 0);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    pendingClientId.current ??= crypto.randomUUID();
    try {
      const res = await sendProjectChatMessageAction(chatId, text, pendingClientId.current);
      if (res.ok) { append(res.data); setBody(""); reportTyping(false); pendingClientId.current = null; }
      else notify(res.error, "error");
    } catch { notify("Message could not be confirmed. Retry to check the same send.", "error"); }
    finally { busyRef.current = false; setBusy(false); }
  }

  return (
    <div className="flex h-[65vh] flex-col border border-hairline bg-white">
      {connectionState !== "online" && <p role="status" className="mono border-b border-hairline bg-brick-soft px-3 py-1 text-2xs text-brick">{connectionState === "revoked" ? "Team access changed. Refresh this page." : "Connection interrupted. Retrying…"}</p>}
      {/* Message list with aria-live so new arrivals are announced. */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto p-4"
        aria-live="polite"
        aria-relevant="additions"
      >
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
        {messages.length === 0 && presence.typingNames.length === 0 ? (
          <p className="mono py-8 text-center text-xs text-ink-muted">
            Nothing here yet. This room is the whole team — say what you&apos;re working on.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {messages.map((m, i) => {
              const mine = m.authorProfileId === myProfileId;
              // Consecutive messages from one person are one block with one
              // attribution. A group transcript has to say who is speaking, but
              // repeating a name and a face on every line of a five-message burst
              // buries the messages under their own labels.
              const prev = i > 0 ? messages[i - 1] : null;
              const startsBlock = !prev || prev.authorProfileId !== m.authorProfileId;

              return (
                <li
                  key={m.id}
                  className={`flex gap-2 ${mine ? "flex-row-reverse" : "flex-row"} ${
                    startsBlock ? "mt-1" : "-mt-2"
                  }`}
                >
                  {/* The avatar column keeps its width on continuation lines so
                      the bubbles below a name stay aligned under it. */}
                  <div className="w-7 shrink-0">
                    {startsBlock && !mine && (
                      <Avatar
                        seed={m.authorAvatarSeed}
                        assetId={m.authorAvatarAssetId}
                        size={28}
                      />
                    )}
                  </div>

                  <div
                    className={`flex min-w-0 flex-col ${mine ? "items-end" : "items-start"}`}
                  >
                    {startsBlock && (
                      <span className="mono mb-0.5 text-2xs text-ink-muted">
                        {mine ? "you" : m.authorName}
                        {!mine && (
                          <span className="text-ink-muted/70"> @{m.authorHandle}</span>
                        )}
                      </span>
                    )}
                    <div
                      className={`max-w-full border px-3 py-2 text-sm ${
                        mine ? "border-pine bg-pine-soft" : "border-hairline bg-paper"
                      }`}
                    >
                      {/* Plain text only — React escapes; no HTML/markdown rendering. */}
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    </div>
                    <span className="mono mt-0.5 text-2xs text-ink-muted">
                      {timeOf(m.createdAt)}
                      {i === lastOwnIndex && presence.otherMemberCount > 0 && (
                        <>
                          {" · "}
                          <span className={presence.seenByCount > 0 ? "text-pine" : undefined}>
                            {presence.seenByCount > 0
                              ? `✓✓ seen by ${presence.seenByCount} of ${presence.otherMemberCount}`
                              : "✓ delivered"}
                          </span>
                        </>
                      )}
                    </span>
                  </div>
                </li>
              );
            })}
            {presence.typingNames.length > 0 && (
              <TypingIndicator label={typingPhrase(presence.typingNames)} />
            )}
          </ul>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-hairline p-3">
        {composer.kind === "PROJECT_CLOSED" ? (
          <p className="mono text-center text-xs text-ink-muted">
            This project is closed. Its chat is read-only.
          </p>
        ) : (
          <form onSubmit={send} className="flex items-end gap-2">
            <label htmlFor="chat-composer" className="sr-only">
              Message the team
            </label>
            <textarea
              id="chat-composer"
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
              placeholder="Message the team… (Enter to send, Shift+Enter for newline)"
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
