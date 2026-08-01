"use client";

import { useEffect, useState } from "react";
import { MIN_POLL_GAP_MS, NAV_POLL_INTERVAL_MS } from "@/lib/constants";

export type NavCounts = {
  unreadMessages: number;
  pendingRequests: number;
};

// Single poller for every nav badge.
//
// The badges exist to tell you what happened while you were away, so they must be
// current the instant you look back at the tab. This used to be implemented by
// never pausing — which met the requirement but meant a backgrounded tab polled
// forever, and several idle tabs multiplied one user's baseline cost with no one
// watching the result.
//
// Pausing while hidden and firing an immediate tick on refocus satisfies the same
// requirement more cheaply: nobody can observe a stale badge in a tab they are not
// looking at, and the refetch lands before they can read the nav.
export function useNavCounts(enabled: boolean): NavCounts {
  const [counts, setCounts] = useState<NavCounts>({ unreadMessages: 0, pendingRequests: 0 });

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/nav-counts", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!active) return;
        setCounts({
          unreadMessages: data.unreadMessages ?? 0,
          pendingRequests: data.pendingRequests ?? 0,
        });
      } catch {
        // network hiccup; the next tick will catch up
      }
    }

    // Self-scheduling, for the same reason the thread poller is: this fires on
    // every authenticated page, and a fixed interval keeps firing whether or not
    // the last request came back. Measured on a slow link this endpoint took up
    // to 3583ms, so a 10s interval was not far off overlapping — and every
    // in-flight poll holds a database connection that the reader's own
    // navigation then has to queue behind. Chaining the next run to the previous
    // one's completion removes that failure mode entirely.
    let running = false;

    async function runOnce() {
      if (!active || running || document.visibilityState !== "visible") return;
      running = true;
      const started = Date.now();
      try {
        await tick();
      } finally {
        running = false;
        const elapsed = Date.now() - started;
        const delay = Math.min(
          NAV_POLL_INTERVAL_MS,
          Math.max(MIN_POLL_GAP_MS, NAV_POLL_INTERVAL_MS - elapsed)
        );
        if (active && document.visibilityState === "visible") {
          stop();
          timer = setTimeout(() => {
            timer = null;
            void runOnce();
          }, delay);
        }
      }
    }

    function stop() {
      if (timer === null) return;
      clearTimeout(timer);
      timer = null;
    }

    function onVisibility() {
      if (document.visibilityState === "visible") {
        // Catch up on whatever landed while hidden, then resume the cadence.
        stop();
        void runOnce();
      } else {
        stop();
      }
    }

    document.addEventListener("visibilitychange", onVisibility);
    onVisibility();

    return () => {
      active = false;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled]);

  return counts;
}
