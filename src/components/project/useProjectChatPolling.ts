"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MIN_POLL_GAP_MS, POLL_INTERVAL_MS, TYPING_PING_THROTTLE_MS } from "@/lib/constants";
import {
  setProjectChatTypingAction,
  type ProjectChatMessageDTO,
  type ProjectChatPresence,
} from "@/actions/project-chat";

type Poll = { messages: ProjectChatMessageDTO[]; hasMore?: boolean } & Partial<ProjectChatPresence>;
type HistoryPage = { messages: ProjectChatMessageDTO[]; hasMore: boolean };
const cursorOf = (message: ProjectChatMessageDTO | undefined) => message ? `${message.createdAt}~${message.id}` : null;

// Polls a project group chat every 3s for new messages and team presence (who is
// typing, how many people have read your newest message). Pauses while the tab is
// hidden and catches up immediately on return.
//
// This is the group twin of useThreadPolling, and the loop below is deliberately
// the same shape as that one — self-scheduling rather than setInterval. That is
// not copied style, it is the fix for a measured failure: on a fixed clock a tick
// starts before the previous one returns whenever the endpoint is slower than the
// interval, in-flight requests accumulate without bound, and each one holds a
// database connection that the reader's own clicks then queue behind. Chaining
// the next run to the previous one's completion makes the overlap structurally
// impossible. A group chat polls the same 3s cadence against a heavier query, so
// it needs the property more than the thread does, not less.
export function useProjectChatPolling(
  chatId: string,
  initial: ProjectChatMessageDTO[],
  initialPresence: ProjectChatPresence,
  initialHasOlder: boolean
) {
  const [messages, setMessages] = useState<ProjectChatMessageDTO[]>(initial);
  const [presence, setPresence] = useState<ProjectChatPresence>(initialPresence);
  const [hasOlder, setHasOlder] = useState(initialHasOlder);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [connectionState, setConnectionState] = useState<"online" | "degraded" | "revoked">("online");
  const cursorRef = useRef<string | null>(cursorOf(initial.at(-1)));
  const oldestRef = useRef<string | null>(cursorOf(initial.at(0)));
  const visibleRef = useRef(true);
  const failuresRef = useRef(0);

  const lastTypingPingRef = useRef(0);
  const typingActiveRef = useRef(false);

  // Lets the composer inject its own confirmed message immediately rather than
  // waiting up to a full interval to see what it just sent.
  const append = useCallback((msg: ProjectChatMessageDTO) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
    // First message in a previously empty chat also becomes the oldest one.
    if (!oldestRef.current) oldestRef.current = cursorOf(msg);
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
        `/api/project-chats/${chatId}/messages?before=${encodeURIComponent(cursor)}`,
        { cache: "no-store", signal: AbortSignal.timeout(10_000) }
      );
      if (!res.ok) { setConnectionState(res.status === 401 || res.status === 403 ? "revoked" : "degraded"); return; }
      setConnectionState("online");
      const data = (await res.json()) as HistoryPage;
      if (data.messages.length > 0) {
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const older = data.messages.filter((m) => !seen.has(m.id));
          return older.length ? [...older, ...prev] : prev;
        });
        oldestRef.current = cursorOf(data.messages[0]);
      }
      setHasOlder(data.hasMore);
    } catch {
      setConnectionState("degraded");
      // leave the control in place; the reader can retry
    } finally {
      setLoadingOlder(false);
    }
  }, [chatId, loadingOlder]);

  useEffect(() => {
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
        const target = Math.min(60_000, POLL_INTERVAL_MS * 2 ** Math.min(failuresRef.current, 4));
        const delay = Math.max(MIN_POLL_GAP_MS, target - elapsed);
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
      if (!visibleRef.current) return;
      try {
        const cold = !cursorRef.current;
        const qs = cold ? "" : `?after=${encodeURIComponent(cursorRef.current!)}`;
        const res = await fetch(`/api/project-chats/${chatId}/messages${qs}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) { failuresRef.current++; setConnectionState(res.status === 401 || res.status === 403 ? "revoked" : "degraded"); if (res.status === 401 || res.status === 403) stopped = true; return; }
        failuresRef.current = 0;
        setConnectionState("online");
        const data = (await res.json()) as Poll;
        if (data.messages.length > 0) {
          setMessages((prev) => {
            const seen = new Set(prev.map((m) => m.id));
            const fresh = data.messages.filter((m) => !seen.has(m.id));
            return fresh.length ? [...prev, ...fresh] : prev;
          });
          cursorRef.current = cursorOf(data.messages.at(-1));
          // A cold read returns a page, not a delta, so it also establishes the
          // backwards cursor and whether anything sits behind it.
          if (cold) {
            oldestRef.current = cursorOf(data.messages[0]);
            setHasOlder(!!data.hasMore);
          }
        }
        setPresence({
          typingNames: data.typingNames ?? [],
          seenByCount: data.seenByCount ?? 0,
          otherMemberCount: data.otherMemberCount ?? 0,
        });
      } catch {
        failuresRef.current++;
        setConnectionState("degraded");
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
  }, [chatId]);

  const reportTyping = useCallback(
    (isTyping: boolean) => {
      if (!isTyping) {
        if (!typingActiveRef.current) return;
        typingActiveRef.current = false;
        lastTypingPingRef.current = 0;
        setProjectChatTypingAction(chatId, false).catch(() => {});
        return;
      }
      const now = Date.now();
      if (now - lastTypingPingRef.current < TYPING_PING_THROTTLE_MS) return;
      lastTypingPingRef.current = now;
      typingActiveRef.current = true;
      setProjectChatTypingAction(chatId, true).catch(() => {});
    },
    [chatId]
  );

  // Leaving the chat with a half-written message should not leave the team
  // staring at a typing indicator until the TTL lapses.
  useEffect(() => {
    return () => {
      if (typingActiveRef.current) setProjectChatTypingAction(chatId, false).catch(() => {});
    };
  }, [chatId]);

  return { messages, presence, append, reportTyping, loadOlder, hasOlder, loadingOlder, connectionState };
}
