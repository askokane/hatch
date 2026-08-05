import { generateAvatarSvg } from "@/lib/avatar";
import { mediaUrl } from "@/lib/feed-types";

// One profile's picture, in one of two forms.
//
// `assetId` is an uploaded photo and wins when present; `seed` drives the
// deterministic identicon that every profile has from creation and falls back to
// the moment a picture is removed. Both branches render into the same sized,
// bordered box, so swapping one for the other never moves the layout — which is
// what lets every call site pass both and stop thinking about it.
//
// The image is decorative in every position it appears: the name or handle it
// belongs to is always adjacent in the markup, so announcing the picture too
// would just read the same identity twice. Hence `alt=""` here and `aria-hidden`
// on the generated SVG.
//
// The SVG string comes exclusively from the hash-driven generator (never user
// free-text), so dangerouslySetInnerHTML carries no injection risk — see
// lib/avatar.ts.
export function Avatar({
  seed,
  assetId,
  size = 40,
  className = "",
}: {
  seed: string;
  /** Uploaded profile picture. Null/undefined renders the identicon instead. */
  assetId?: string | null;
  size?: number;
  className?: string;
}) {
  const box = `inline-block overflow-hidden border border-hairline ${className}`;

  if (assetId) {
    return (
      <span className={box} style={{ width: size, height: size, lineHeight: 0 }}>
        {/* Plain <img>, not next/image: the bytes are served by our own session-
            gated route, which the image optimizer cannot fetch on the user's
            behalf. `object-cover` is what makes a rectangular upload sit in a
            square box without distorting a face. */}
        <img
          src={mediaUrl(assetId)}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      </span>
    );
  }

  const svg = generateAvatarSvg(seed, size);
  return (
    <span
      className={box}
      style={{ width: size, height: size, lineHeight: 0 }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
