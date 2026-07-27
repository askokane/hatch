"use client";

import { useEffect, useState } from "react";
import { POLL_INTERVAL_MS } from "@/lib/constants";

// Polls unread count every 3s. Not paused on tab-hide — the badge should update
// so the user sees new activity when they return to the tab.
export function UnreadBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;
    async function tick() {
      try {
        const res = await fetch("/api/unread-count", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (active) setCount(data.total ?? 0);
      } catch {
        // network hiccup; ignore this tick
      }
    }
    tick();
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  if (count <= 0) return null;
  return (
    <span className="ml-1 text-pine" aria-label={`${count} unread`}>
      [{count}]
    </span>
  );
}
