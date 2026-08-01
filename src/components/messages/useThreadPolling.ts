"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MIN_POLL_GAP_MS, POLL_INTERVAL_MS, TYPING_PING_THROTTLE_MS } from "@/lib/constants";
import { setTypingAction, type MessageDTO, type ThreadPresence } from "@/actions/messages";

type Poll = { messages: MessageDTO[]; hasMore?: boolean } & Partial<ThreadPresence>;
type HistoryPage = { messages: MessageDTO[]; hasMore: boolean };

// Polls a thread every 3s for new messages AND the other participant's presence
// (typing + read watermark). Pauses while the tab is hidden and catches up
// immediately on return. Appends only messages newer than the last one seen,
// using an ISO timestamp cursor.
//
// Also owns the backwards cursor. The server renders only the newest page of a
// transcript, so this hook exposes `loadOlder` to walk further back through the
// same endpoint — the full history stays reachable, it is just no longer all paid
// for up front on every visit.
export function useThreadPolling(
  threadId: string,
  initial: MessageDTO[],
  initialPresence: ThreadPresence,
  initialHasOlder: boolean
) {
  const [messages, setMessages] = useState<MessageDTO[]>(initial);
  const [presence, setPresence] = useState<ThreadPresence>(initialPresence);
  const [hasOlder, setHasOlder] = useState(initialHasOlder);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const cursorRef = useRef<string | null>(initial.at(-1)?.createdAt ?? null);
  const oldestRef = useRef<string | null>(initial.at(0)?.createdAt ?? null);
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
    // First message in a previously empty thread also becomes the oldest one.
    if (!oldestRef.current) oldestRef.current = msg.createdAt;
    // Our own send clears our typing state server-side; mirror that locally so
    // the composer's throttle does not suppress the next genuine keystroke.
    lastTypingPingRef.current = 0;
  }, []);

  // Walks one page further back. Prepends, so the reader's position in the
  // existing transcript is preserved rather than replaced.
  const loadOlder = useCallback(async () => {
    const cursor = oldestRef.current;
    if (!cursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const res = await fetch(
        `/api/threads/${threadId}/messages?before=${encodeURIComponent(cursor)}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const data = (await res.json()) as HistoryPage;
      if (data.messages.length > 0) {
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const older = data.messages.filter((m) => !seen.has(m.id));
          return older.length ? [...older, ...prev] : prev;
        });
        oldestRef.current = data.messages[0].createdAt;
      }
      setHasOlder(data.hasMore);
    } catch {
      // leave the control in place; the reader can retry
    } finally {
      setLoadingOlder(false);
    }
  }, [threadId, loadingOlder]);

  useEffect(() => {
    // Self-scheduling loop rather than setInterval.
    //
    // setInterval fires on a fixed clock regardless of whether the previous
    // request finished. That is fine while a poll is quick and quietly
    // catastrophic when it is not: measured against a database a few hundred
    // milliseconds away, this endpoint took 4466ms on a 3000ms interval, so
    // every tick started before the last one returned and the in-flight
    // requests accumulated without bound. Each one holds a database connection,
    // so a thread left open would starve the pool that the reader's own clicks
    // need — the page felt slow because of its own background polling.
    //
    // Scheduling the next run only after the current one settles makes overlap
    // structurally impossible. The delay below preserves the intended cadence
    // when the server is fast (wait out the remainder of the interval) and
    // degrades to a floor when it is slow, so a struggling server is never
    // hammered harder than one that is keeping up.
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let running = false;

    function clearTimer() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    }

    async function runOnce() {
      if (stopped || running || !visibleRef.current) return;
      running = true;
      const started = Date.now();
      try {
        await tick();
      } finally {
        running = false;
        const elapsed = Date.now() - started;
        const delay = Math.min(
          POLL_INTERVAL_MS,
          Math.max(MIN_POLL_GAP_MS, POLL_INTERVAL_MS - elapsed)
        );
        if (!stopped && visibleRef.current) {
          clearTimer();
          timer = setTimeout(() => {
            timer = null;
            void runOnce();
          }, delay);
        }
      }
    }

    function onVisibility() {
      const nowVisible = document.visibilityState === "visible";
      const wasHidden = !visibleRef.current;
      visibleRef.current = nowVisible;
      if (nowVisible && wasHidden) {
        // Returning to the tab should not cost up to a full interval of staring
        // at a stale transcript — catch up right away, then let the loop resume.
        clearTimer();
        void runOnce();
      } else if (!nowVisible) {
        clearTimer();
      }
    }

    async function tick() {
      if (!visibleRef.current) return; // paused when tab hidden
      try {
        const cold = !cursorRef.current;
        const qs = cold ? "" : `?after=${encodeURIComponent(cursorRef.current!)}`;
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
          // A cold read returns a page, not a delta, so it also establishes the
          // backwards cursor and whether anything sits behind it.
          if (cold) {
            oldestRef.current = data.messages[0].createdAt;
            setHasOlder(!!data.hasMore);
          }
        }
        setPresence({
          otherTyping: data.otherTyping ?? false,
          otherLastReadAt: data.otherLastReadAt ?? null,
        });
      } catch {
        // transient error; try again next tick
      }
    }

    document.addEventListener("visibilitychange", onVisibility);
    // Sync the initial flag without forcing a fetch: the server already rendered
    // the current transcript into `initial`.
    visibleRef.current = document.visibilityState === "visible";

    if (visibleRef.current) void runOnce();
    return () => {
      stopped = true;
      clearTimer();
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

  return { messages, presence, append, reportTyping, loadOlder, hasOlder, loadingOlder };
}
