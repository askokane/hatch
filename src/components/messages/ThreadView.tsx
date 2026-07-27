"use client";

import { useEffect, useRef, useState } from "react";
import { sendMessageAction, markThreadReadAction, type MessageDTO } from "@/actions/messages";
import { useThreadPolling } from "./useThreadPolling";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";
import { MESSAGE_MAX } from "@/lib/constants";

export function ThreadView({
  threadId,
  myProfileId,
  initialMessages,
  readOnly,
}: {
  threadId: string;
  myProfileId: string;
  initialMessages: MessageDTO[];
  readOnly: boolean;
}) {
  const { notify } = useToast();
  const { messages, append } = useThreadPolling(threadId, initialMessages);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(messages.length);

  // Auto-scroll to newest and mark read when new messages arrive.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
    if (messages.length !== lastCountRef.current) {
      lastCountRef.current = messages.length;
      markThreadReadAction(threadId).catch(() => {});
    }
  }, [messages.length, threadId]);

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
    } else {
      notify(res.error, "error");
    }
  }

  return (
    <div className="flex h-[60vh] flex-col border border-hairline bg-white">
      {/* Message list with aria-live so new arrivals are announced. */}
      <div className="flex-1 overflow-y-auto p-4" aria-live="polite" aria-relevant="additions">
        {messages.length === 0 ? (
          <p className="mono py-8 text-center text-xs text-ink-muted">
            No messages yet. Say hello — reference why you connected.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {messages.map((m) => {
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
                    {mine ? "you" : m.authorName} ·{" "}
                    {new Date(m.createdAt).toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <div className="border-t border-hairline p-3">
        {readOnly ? (
          <p className="mono text-center text-xs text-ink-muted">
            This conversation is read-only.
          </p>
        ) : (
          <form onSubmit={send} className="flex items-end gap-2">
            <label htmlFor="composer" className="sr-only">
              Message
            </label>
            <textarea
              id="composer"
              value={body}
              onChange={(e) => setBody(e.target.value)}
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
