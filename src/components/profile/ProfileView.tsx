import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { TagBadge } from "@/components/ui/TagBadge";
import { INTENT_LABELS } from "@/lib/constants";

export type ProfileViewData = {
  handle: string;
  name: string;
  school: string;
  gradYear: number;
  basedIn: string;
  bio: string;
  avatarSeed: string;
  links: { label: string; url: string }[];
  skills: { id: string; label: string }[];
  learning: { id: string; label: string }[];
  intents: { kind: string; note: string }[];
  isDiscoverable: boolean;
};

// Renders a profile with the two field classes visually and structurally split:
// IDENTITY (human-read) on the left, INTENT (machine-read/structured) on the right.
//
// `postsSlot` is filled by the page with the same FeedList the main feed uses,
// scoped to this profile's author. It is passed in rather than queried here so
// this component stays a pure renderer — and so the own-profile page can put a
// composer above the list without this file knowing anything about posting.
export function ProfileView({
  data,
  isOwn,
  actionSlot,
  postsSlot,
}: {
  data: ProfileViewData;
  isOwn: boolean;
  actionSlot?: React.ReactNode;
  postsSlot?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <Avatar seed={data.avatarSeed} size={72} />
          <div>
            <h1 className="text-xl font-600">{data.name}</h1>
            <p className="mono text-xs text-ink-muted">@{data.handle}</p>
            <p className="mt-1 text-xs text-ink-muted">
              {data.school} · Class of {data.gradYear}
            </p>
            {data.basedIn && (
              <p className="mono mt-1 text-2xs text-ink-muted">based in {data.basedIn}</p>
            )}
            {isOwn && !data.isDiscoverable && (
              <p className="mono mt-1 text-2xs text-brick">[ hidden from discovery ]</p>
            )}
          </div>
        </div>
        {actionSlot}
      </div>

      <div className="mt-10 grid gap-10 md:grid-cols-2">
        {/* IDENTITY — loose, human-read */}
        <section aria-labelledby="identity-h">
          <p id="identity-h" className="label-mono">
            [ identity ]
          </p>
          <div className="mt-3 border-t border-hairline pt-3">
            {data.bio ? (
              <p className="text-sm leading-relaxed">{data.bio}</p>
            ) : (
              <p className="text-xs text-ink-muted">No bio yet.</p>
            )}
            {data.links.length > 0 && (
              <ul className="mt-4 flex flex-col gap-1">
                {data.links.map((l, i) => (
                  <li key={i}>
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mono text-xs text-pine underline underline-offset-2"
                    >
                      {l.label} ↗
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* INTENT — structured, machine-read */}
        <section aria-labelledby="intent-h">
          <p id="intent-h" className="label-mono">
            [ intent ]
          </p>
          <div className="mt-3 border-t border-hairline pt-3">
            <p className="label-mono mb-1">skills</p>
            <div className="flex flex-wrap gap-1">
              {data.skills.length > 0 ? (
                data.skills.map((t) => <TagBadge key={t.id} label={t.label} />)
              ) : (
                <span className="text-xs text-ink-muted">None listed.</span>
              )}
            </div>

            <p className="label-mono mb-1 mt-4">learning</p>
            <div className="flex flex-wrap gap-1">
              {data.learning.length > 0 ? (
                data.learning.map((t) => <TagBadge key={t.id} label={t.label} learning />)
              ) : (
                <span className="text-xs text-ink-muted">None listed.</span>
              )}
            </div>

            <p className="label-mono mb-1 mt-4">looking for</p>
            <ul className="flex flex-col gap-1">
              {data.intents.length > 0 ? (
                data.intents.map((i) => (
                  <li key={i.kind} className="text-xs">
                    <span className="mono text-pine">{INTENT_LABELS[i.kind]}</span>
                    {i.note && <span className="text-ink-muted"> — {i.note}</span>}
                  </li>
                ))
              ) : (
                <span className="text-xs text-ink-muted">Nothing listed.</span>
              )}
            </ul>
          </div>
        </section>
      </div>

      {/* POSTS — full width below the two columns: a running record rather than
          a profile field, so it reads as a timeline, not a third attribute. */}
      {postsSlot && (
        <section aria-labelledby="posts-h" className="mt-12">
          <p id="posts-h" className="label-mono">
            [ posts ]
          </p>
          <div className="mt-3 border-t border-hairline pt-4">{postsSlot}</div>
        </section>
      )}

      {isOwn && (
        <p className="mt-8 text-2xs text-ink-muted">
          <Link href="/settings" className="underline">
            Account settings
          </Link>
        </p>
      )}
    </div>
  );
}
