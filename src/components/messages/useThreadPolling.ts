"use client";

import { useEffect, useRef, useState } from "react";
import { POLL_INTERVAL_MS } from "@/lib/constants";
import type { MessageDTO } from "@/actions/messages";

// Polls a thread for new messages every 3s. Pauses while the tab is hidden
// (document.visibilityState) and resumes on return. Appends only messages newer
// than the last one seen, using an ISO timestamp cursor.
export function useThreadPolling(threadId: string, initial: MessageDTO[]) {
  const [messages, setMessages] = useState<MessageDTO[]>(initial);
  const cursorRef = useRef<string | null>(initial.at(-1)?.createdAt ?? null);
  const visibleRef = useRef(true);

  // Allow the composer to inject an optimistic/confirmed message immediately.
  function append(msg: MessageDTO) {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
    if (!cursorRef.current || msg.createdAt > cursorRef.current) cursorRef.current = msg.createdAt;
  }

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
        const data = (await res.json()) as { messages: MessageDTO[] };
        if (data.messages.length > 0) {
          setMessages((prev) => {
            const seen = new Set(prev.map((m) => m.id));
            const fresh = data.messages.filter((m) => !seen.has(m.id));
            return fresh.length ? [...prev, ...fresh] : prev;
          });
          cursorRef.current = data.messages.at(-1)!.createdAt;
        }
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

  return { messages, append };
}
