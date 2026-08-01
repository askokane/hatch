"use client";

import { useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { PostCard } from "./PostCard";
import { ProjectUpdateCard } from "./ProjectUpdateCard";
import { RoleFeedItemCard } from "./RoleFeedItemCard";
import { feedKey, type FeedFilter, type FeedItem, type FeedPage } from "@/lib/feed-types";

// The merged list. The server renders page one; this component appends the rest.
//
// Paging state has to survive re-renders but be discarded when the server hands
// down a genuinely new first page — which is exactly what happens after posting
// or deleting, since both call router.refresh(). Holding the accumulated pages in
// state without that reset is the classic version of this bug: you post, the
// server sends a first page containing your new post, and the stale state renders
// the old list on top of it, so the thing you just wrote does not appear.
//
// The reset keys off the *content* of the first page rather than the prop's
// object identity: a refresh that changed nothing would still produce a new
// object, and silently throwing away the reader's loaded pages for that is a
// worse failure than the one being fixed.
export function FeedList({
  initialPage,
  filter,
  authorHandle,
  emptyTitle,
  emptyBody,
}: {
  initialPage: FeedPage;
  filter: FeedFilter;
  /** Scopes paging to one author, for the profile tab. */
  authorHandle?: string;
  emptyTitle: string;
  emptyBody: string;
}) {
  const signature = useMemo(
    () => `${initialPage.items.map(feedKey).join(",")}|${initialPage.nextCursor ?? ""}`,
    [initialPage]
  );

  const [seenSignature, setSeenSignature] = useState(signature);
  const [appended, setAppended] = useState<FeedItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(initialPage.nextCursor);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Adjusting state during render (rather than in an effect) so the new first
  // page and the cleared tail commit together — an effect would paint the stale
  // list for one frame first.
  if (signature !== seenSignature) {
    setSeenSignature(signature);
    setAppended([]);
    setCursor(initialPage.nextCursor);
    setError(null);
  }

  // The cursor is a timestamp, so an item on a page boundary can legitimately
  // arrive twice. De-duping on the way out is cheaper than trying to make the
  // boundary exact, and it also covers a double-fetch of the same cursor.
  const items = useMemo(() => {
    const seen = new Set<string>();
    const out: FeedItem[] = [];
    for (const item of [...initialPage.items, ...appended]) {
      const key = feedKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  }, [initialPage.items, appended]);

  async function loadMore() {
    if (busy || !cursor) return;
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ filter, before: cursor });
      if (authorHandle) params.set("author", authorHandle);
      const res = await fetch(`/api/feed?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Feed request failed: ${res.status}`);
      const page: FeedPage = await res.json();
      setAppended((prev) => [...prev, ...page.items]);
      // A cursor that did not move would offer the button forever and refetch the
      // same rows on every press. Treat it as the end of the feed.
      setCursor(page.nextCursor === cursor ? null : page.nextCursor);
    } catch {
      setError("Couldn't load more right now. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (items.length === 0) {
    return <EmptyState title={emptyTitle} body={emptyBody} />;
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => {
        switch (item.kind) {
          case "POST":
            return <PostCard key={feedKey(item)} item={item} />;
          case "PROJECT_UPDATE":
            return <ProjectUpdateCard key={feedKey(item)} item={item} />;
          case "ROLE":
            return <RoleFeedItemCard key={feedKey(item)} item={item} />;
        }
      })}

      {error && (
        <p role="alert" className="mono text-2xs text-brick">
          {error}
        </p>
      )}

      {cursor && (
        <button
          type="button"
          onClick={loadMore}
          disabled={busy}
          aria-busy={busy}
          className="mono border border-hairline bg-white px-4 py-2 text-xs text-ink-muted hover:border-ink hover:text-ink disabled:opacity-50"
        >
          {busy ? "loading…" : "load older"}
        </button>
      )}
    </div>
  );
}
