import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { STAGE_LABELS } from "@/lib/constants";
import { FeedTimestamp } from "./PostCard";
import type { ProjectUpdateFeedItem } from "@/lib/feed-types";

// A project's changelog entry, surfaced out of the project room into the feed.
//
// The chip leads rather than the author, which is the whole difference from a
// post: this is the project speaking, and the person who typed it is attribution
// rather than the subject. Three item types share one column, so each has to be
// identifiable before it is read.
export function ProjectUpdateCard({ item }: { item: ProjectUpdateFeedItem }) {
  const { project, author, body } = item;

  return (
    <article className="border border-hairline bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mono border border-pine bg-pine-soft px-2 py-0.5 text-2xs text-pine">
          [ project update ]
        </span>
        <Link href={`/p/${project.slug}`} className="text-xs font-600 hover:underline">
          {project.name}
        </Link>
        <span className="label-mono">· {STAGE_LABELS[project.stage] ?? project.stage}</span>
      </div>

      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{body}</p>

      <div className="mt-4 flex items-center justify-between border-t border-hairline pt-3">
        <Link href={`/u/${author.handle}`} className="flex items-center gap-2 hover:underline">
          <Avatar seed={author.avatarSeed} size={24} />
          <span className="mono text-2xs text-ink-muted">
            {author.name} · @{author.handle}
          </span>
        </Link>
        <FeedTimestamp iso={item.createdAt} />
      </div>
    </article>
  );
}
