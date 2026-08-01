import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { TagBadge } from "@/components/ui/TagBadge";
import { COMMITMENT_LABELS, STAGE_LABELS } from "@/lib/constants";
import { FeedTimestamp } from "./PostCard";
import type { RoleFeedItemDTO } from "@/lib/feed-types";

// An open role, carried into the feed as its "opportunity" item.
//
// Deliberately NOT an intro-request surface. The discovery card
// (components/discover/RoleFeedCard) can offer that button because it is handed a
// resolved `relationship` for the owner; this card is not, and "where do I stand
// with this person" is exactly the question that must never be answered locally —
// guessing it is how a pair who are already messaging get shown a bare "Request
// intro". So the call to action is the project page, which resolves the
// relationship properly and offers the right control there.
//
// The ranked, tag-matched version of this card still lives on /discover. This one
// is chronological: the feed's promise is "what is new", not "what fits you best".
export function RoleFeedItemCard({ item }: { item: RoleFeedItemDTO }) {
  const { project, owner, role } = item;

  return (
    <article className="border border-hairline bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mono border border-hairline bg-paper px-2 py-0.5 text-2xs text-ink-muted">
          [ open role ]
        </span>
        <Link href={`/p/${project.slug}`} className="text-xs font-600 hover:underline">
          {project.name}
        </Link>
        <span className="label-mono">· {STAGE_LABELS[project.stage] ?? project.stage}</span>
      </div>

      <h3 className="mt-2 text-lg font-600">{role.title}</h3>
      <p className="mt-1 line-clamp-3 text-sm text-ink-muted">{role.description}</p>

      {role.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {role.tags.map((t) => (
            <TagBadge key={t.id} label={t.label} />
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-3">
        <Link href={`/u/${owner.handle}`} className="flex items-center gap-2 hover:underline">
          <Avatar seed={owner.avatarSeed} size={24} />
          <span className="mono text-2xs text-ink-muted">{owner.name}</span>
        </Link>
        <div className="flex items-center gap-3">
          <FeedTimestamp iso={item.createdAt} />
          <span className="mono text-2xs text-ink-muted">
            {COMMITMENT_LABELS[role.commitment] ?? role.commitment}
          </span>
          <Link href={`/p/${project.slug}`} className="mono text-2xs text-pine hover:underline">
            view role →
          </Link>
        </div>
      </div>
    </article>
  );
}
