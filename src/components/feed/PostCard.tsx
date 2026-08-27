"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deletePostAction } from "@/actions/posts";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/ToastProvider";
import { ReportDialog } from "@/components/safety/ReportDialog";
import { MediaGallery } from "./MediaGallery";
import { PostBody } from "./PostBody";
import { relativeTime } from "@/lib/relative-time";
import type { PostFeedItem } from "@/lib/feed-types";

// Shared by all three feed cards, so the same age is worded the same way on
// every one of them. The tiers themselves live in lib/relative-time, where they
// can be tested against fixed clocks instead of only through a rendered feed.
//
// The timestamp is computed from the reader's clock, so the server's render and
// the client's hydration can legitimately disagree by a tick. suppressHydration
// Warning marks that as expected rather than letting a routine one-second skew
// print a mismatch warning. The machine-readable value in dateTime is the ISO
// string either way, so nothing that parses this element depends on the drift.
export function FeedTimestamp({ iso }: { iso: string }) {
  return (
    <time
      dateTime={iso}
      title={new Date(iso).toLocaleString("en-US")}
      className="mono shrink-0 text-2xs text-ink-muted"
      suppressHydrationWarning
    >
      {relativeTime(iso)}
    </time>
  );
}

// A profile post. The body is plain text apart from mentions, which PostBody
// turns into links from the rows the server authorized — React escapes all of
// it, and nothing in this feature uses dangerouslySetInnerHTML.
export function PostCard({ item }: { item: PostFeedItem }) {
  const router = useRouter();
  const { notify } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    setBusy(true);
    const res = await deletePostAction(item.id);
    setBusy(false);
    if (res.ok) {
      notify("Post deleted.", "success");
      router.refresh();
    } else {
      setConfirming(false);
      notify(res.error, "error");
    }
  }

  return (
    <article className="border border-hairline bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <Link
          href={`/u/${item.author.handle}`}
          className="flex items-center gap-2 hover:underline"
        >
          <Avatar seed={item.author.avatarSeed} assetId={item.author.avatarAssetId} size={32} />
          <span>
            <span className="block text-xs font-600">{item.author.name}</span>
            <span className="mono block text-2xs text-ink-muted">@{item.author.handle}</span>
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-3">
          <FeedTimestamp iso={item.createdAt} />
          {/* Posts are the one surface here carrying content the platform never
              generated — uploaded pixels included — so the report path that every
              other user-content surface has is a floor, not an extra. Offered only
              on other people's posts: your own already has delete. */}
          {!item.isOwn && (
            <ReportDialog
              compact
              subjectType="POST"
              subjectId={item.id}
              subjectLabel={`this post by @${item.author.handle}`}
            />
          )}
          {/* Two-step inline confirm rather than window.confirm, which blocks the
              whole tab and cannot be styled or reached by the same keyboard flow
              as the rest of the card. */}
          {item.isOwn &&
            (confirming ? (
              <span className="flex items-center gap-2">
                <span className="mono text-2xs text-ink-muted">delete?</span>
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={busy}
                  className="mono text-2xs text-brick hover:underline disabled:opacity-50"
                >
                  {busy ? "deleting…" : "yes"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={busy}
                  className="mono text-2xs text-ink-muted hover:text-ink hover:underline disabled:opacity-50"
                >
                  no
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                aria-label="Delete this post"
                className="mono text-2xs text-ink-muted hover:text-brick"
              >
                delete
              </button>
            ))}
        </div>
      </div>

      <PostBody body={item.body} mentions={item.mentions} className="mt-3" />

      <MediaGallery media={item.media} />
    </article>
  );
}
