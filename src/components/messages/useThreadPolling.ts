"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { POLL_INTERVAL_MS, TYPING_PING_THROTTLE_MS } from "@/lib/constants";
import { setTypingAction, type MessageDTO, type ThreadPresence } from "@/actions/messages";

type Poll = { messages: MessageDTO[] } & Partial<ThreadPresence>;

// Polls a thread every 3s for new messages AND the other participant's presence
// (typing + read watermark). Pauses while the tab is hidden and resumes on
// return. Appends only messages newer than the last one seen, using an ISO
// timestamp cursor.
export function useThreadPolling(
  threadId: string,
  initial: MessageDTO[],
  initialPresence: ThreadPresence
) {
  const [messages, setMessages] = useState<MessageDTO[]>(initial);
  const [presence, setPresence] = useState<ThreadPresence>(initialPresence);
  const cursorRef = useRef<string | null>(initial.at(-1)?.createdAt ?? null);
  const visibleRef = useRef(true);

  // Typing presence (outbound). Every keystroke would mean a write per
  // character; instead a keystroke re-claims a multi-second window at most once
  // per throttle interval, and the claim is explicitly released when the field
  // empties or the view unmounts.
  const lastTypingPingRef = useRef(0);
  const typingActiveRef = useRef(false);

  // Allow the composer to inject the confirmed message immediately.
  const append = useCallback((msg: MessageDTO) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
    if (!cursorRef.current || msg.createdAt > cursorRef.current) cursorRef.current = msg.createdAt;
    // Our own send clears our typing state server-side; mirror that locally so
    // the composer's throttle does not suppress the next genuine keystroke.
    lastTypingPingRef.current = 0;
  }, []);

  useEffect(() => {
    function onVisibility() {
      visibleRef.current = document.visibilityState === "visible";
    }
    document.addEventListener("visibilitychange", onVisibility);
    onVisibility();

    async function tick() {
      if (!visibleRef.current) return; // paused when tab hidden
      try {
        const qs = cursorRef.current ? `?after=${encodeURIComponent(cursorRef.current)}` : "";
        const res = await fetch(`/api/threads/${threadId}/messages${qs}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as Poll;
        if (data.messages.length > 0) {
          setMessages((prev) => {
            const seen = new Set(prev.map((m) => m.id));
            const fresh = data.messages.filter((m) => !seen.has(m.id));
            return fresh.length ? [...prev, ...fresh] : prev;
          });
          cursorRef.current = data.messages.at(-1)!.createdAt;
        }
        setPresence({
          otherTyping: data.otherTyping ?? false,
          otherLastReadAt: data.otherLastReadAt ?? null,
        });
      } catch {
        // transient error; try again next tick
      }
    }

    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [threadId]);

  const reportTyping = useCallback(
    (isTyping: boolean) => {
      if (!isTyping) {
        if (!typingActiveRef.current) return;
        typingActiveRef.current = false;
        lastTypingPingRef.current = 0;
        setTypingAction(threadId, false).catch(() => {});
        return;
      }
      const now = Date.now();
      if (now - lastTypingPingRef.current < TYPING_PING_THROTTLE_MS) return;
      lastTypingPingRef.current = now;
      typingActiveRef.current = true;
      setTypingAction(threadId, true).catch(() => {});
    },
    [threadId]
  );

  // Leaving the thread with a half-written message should not leave the other
  // side staring at a typing indicator until the TTL lapses.
  useEffect(() => {
    return () => {
      if (typingActiveRef.current) setTypingAction(threadId, false).catch(() => {});
    };
  }, [threadId]);

  return { messages, presence, append, reportTyping };
}
