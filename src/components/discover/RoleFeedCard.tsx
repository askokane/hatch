import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { TagBadge } from "@/components/ui/TagBadge";
import { ConnectionStatus } from "@/components/ui/ConnectionStatus";
import { COMMITMENT_LABELS, STAGE_LABELS } from "@/lib/constants";
import type { RoleFeedItem } from "@/lib/discover-queries";
import type { Relationship } from "@/lib/relationship";

// The signature element: a role card whose tag-match visualization makes the
// ranking transparent. Matched tags render in the accent; a match meter shows the
// overlap fraction; the "why" is spelled out.
export function RoleFeedCard({
  item,
  relationship,
}: {
  item: RoleFeedItem;
  /** Standing with the role's owner, so the feed agrees with the profile page. */
  relationship: Relationship;
}) {
  const { role, project, owner, score } = item;
  const matched = new Set(score.matchedTagIds);
  const total = role.tags.length;
  const matchCount = role.tags.filter((t) => matched.has(t.id)).length;
  const pct = total === 0 ? 0 : Math.round((matchCount / total) * 100);

  return (
    <article className="border border-hairline bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="label-mono">{STAGE_LABELS[project.stage]}</span>
            <span className="text-hairline">·</span>
            <Link
              href={`/p/${project.slug}`}
              className="mono text-xs text-ink-muted hover:text-ink hover:underline"
            >
              {project.name}
            </Link>
          </div>
          <h3 className="mt-1 text-lg font-600">{role.title}</h3>
        </div>

        {/* Tag-match meter — the signature visualization. */}
        <div className="shrink-0 text-right">
          <div
            className="mono text-2xs text-ink-muted"
            aria-label={`${matchCount} of ${total} required tags match your skills`}
          >
            {matchCount}/{total} match
          </div>
          <div className="mt-1 flex h-1.5 w-24 overflow-hidden border border-hairline" aria-hidden>
            {role.tags.map((t) => (
              <div
                key={t.id}
                className={`h-full flex-1 ${matched.has(t.id) ? "bg-pine" : "bg-transparent"} ${
                  t !== role.tags[role.tags.length - 1] ? "border-r border-hairline" : ""
                }`}
              />
            ))}
          </div>
          <div className="mono mt-1 text-2xs text-pine">{pct}%</div>
        </div>
      </div>

      <p className="mt-2 line-clamp-3 text-sm text-ink-muted">{role.description}</p>

      <div className="mt-3 flex flex-wrap gap-1">
        {role.tags.map((t) => (
          <TagBadge key={t.id} label={t.label} matched={matched.has(t.id)} />
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-hairline pt-3">
        <Link href={`/u/${owner.handle}`} className="flex items-center gap-2 hover:underline">
          <Avatar seed={owner.avatarSeed} size={24} />
          <span className="mono text-2xs text-ink-muted">
            {owner.name} · {owner.school}
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <ConnectionStatus relationship={relationship} />
          <span className="mono text-2xs text-ink-muted">{COMMITMENT_LABELS[role.commitment]}</span>
          <Link
            href={`/p/${project.slug}`}
            className="mono text-2xs text-pine hover:underline"
          >
            view role →
          </Link>
        </div>
      </div>
    </article>
  );
}
