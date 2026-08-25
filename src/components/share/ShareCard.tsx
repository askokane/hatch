import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { shareHref } from "@/lib/share-display";
import type { ShareSnapshot } from "@/lib/validation/share.schema";

// A shared profile or project, as it appears in a thread.
//
// This is the whole point of the feature: the same act that used to arrive as a
// bare URL — a line of grey text saying nothing about who is on the other end —
// arrives instead as something with a face, a name and a reason to tap it.
//
// It renders ENTIRELY from the snapshot captured when the share was sent
// (lib/share-core.ts) and never queries. Two consequences worth stating, because
// both are deliberate:
//
//   1. The transcript keeps saying what was actually sent. If a project is
//      renamed or a profile retags itself, the card does not quietly rewrite
//      what someone said six months ago. The link is the live answer.
//   2. A thread holding fifty cards still costs one query to page, on a poll
//      that runs every three seconds.
//
// Projects have no picture of their own, so they borrow the identicon generator
// seeded on the slug: deterministic, in the same visual language as every avatar
// on the platform, and stable for the life of the project.
export function ShareCard({ share, mine }: { share: ShareSnapshot; mine: boolean }) {
  const isProfile = share.kind === "PROFILE";
  const seed = isProfile ? share.avatarSeed : share.slug;
  const assetId = isProfile ? share.avatarAssetId : null;

  // Fixed width rather than shrink-to-fit, so a card carrying a one-word blurb
  // and one carrying a full sentence are the same object. 24rem (max-w-sm) is
  // what it takes for a profile's "@handle · School · 'YY" line to fit without
  // the school being cut mid-word — at 20rem it was not close.
  //
  // w-full + a max, NOT a `min(24rem, 85vw)` width: vw is measured against the
  // VIEWPORT, which is not what bounds this card. In a narrow column on a wide
  // screen the card would have overflowed its own transcript while 85vw still
  // read as plenty of room. Bounded by the parent, it cannot.
  return (
    <Link
      href={shareHref(share)}
      className={`group block w-full max-w-sm border transition-colors ${
        mine ? "border-pine bg-pine-soft hover:border-ink" : "border-hairline bg-paper hover:border-ink"
      }`}
    >
      <div className="flex items-start gap-3 p-3">
        <Avatar seed={seed} assetId={assetId} size={44} />
        <div className="min-w-0 flex-1">
          <p className="label-mono">{isProfile ? "[ profile ]" : "[ project ]"}</p>
          <p className="mt-0.5 truncate text-sm font-600">{share.name}</p>
          <p className="mono truncate text-2xs text-ink-muted">
            {isProfile ? `@${share.handle} · ${share.subtitle}` : share.subtitle}
            {!isProfile && share.closed && <span className="text-brick"> · closed</span>}
          </p>
          {/* Two lines, not one. The blurb is capped at SHARE_BLURB_MAX characters
              when the card is composed, but a single truncated line at this width
              fits barely a third of that — a project description was being cut
              after four words, which told the recipient nothing. The clamp is what
              actually bounds the height; the server cap bounds what is stored. */}
          {share.blurb && (
            <p className="mt-1 line-clamp-2 break-words text-xs text-ink">{share.blurb}</p>
          )}
        </div>
      </div>
      {/* Reads as the affordance it is. The whole card is the hit target — this
          is the label for it, not a second control. */}
      <p className="mono border-t border-hairline px-3 py-1.5 text-2xs text-pine group-hover:text-ink">
        {isProfile ? "View profile" : "View project"} →
      </p>
    </Link>
  );
}
