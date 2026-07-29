"use client";

import { useEffect, useState } from "react";
import { POLL_INTERVAL_MS } from "@/lib/constants";

export type NavCounts = {
  unreadMessages: number;
  pendingRequests: number;
};

// Single poller for every nav badge. Deliberately NOT paused on tab-hide: the
// badges exist to tell you what happened while you were away, so they need to be
// current the instant you look back at the tab.
export function useNavCounts(enabled: boolean): NavCounts {
  const [counts, setCounts] = useState<NavCounts>({ unreadMessages: 0, pendingRequests: 0 });

  useEffect(() => {
    if (!enabled) return;
    let active = true;

    async function tick() {
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

    tick();
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [enabled]);

  return counts;
}
