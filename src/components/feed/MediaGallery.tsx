import { mediaUrl, type FeedMedia } from "@/lib/feed-types";

// A post's attachments.
//
// Plain <img>/<video> rather than next/image: these are same-origin bytes served
// by our own route handler, so the optimizer would need remotePatterns config to
// touch them and would buy nothing the route does not already do — it returns the
// exact stored bytes under an immutable cache header.
//
// Alt text is either the uploader's filename or a factual statement that an image
// is attached. It never describes the picture: nothing in this path has seen the
// pixels, and an invented description is worse for a screen-reader user than an
// honest one.
export function MediaGallery({ media }: { media: FeedMedia[] }) {
  if (media.length === 0) return null;

  // A lone attachment is shown whole rather than cropped, bounded by the column
  // width and a height ceiling so one tall portrait cannot push the next card off
  // the screen. Sized `w-auto max-w-full` rather than `w-full`: forcing the width
  // would upscale anything narrower than the column — a phone screenshot, a small
  // diagram — into a blurry stretch of its own pixels. Growing an image past its
  // natural size never adds detail, it only removes it.
  //
  // A set is gridded and cropped instead, because uniform cells are what make a
  // group read as one gallery; there the crop is the point.
  const single = media.length === 1;
  const frame = single
    ? "mx-auto max-h-[26rem] w-auto max-w-full object-contain"
    : "aspect-[4/3] w-full object-cover";

  return (
    <ul className={`mt-3 grid gap-1 ${single ? "grid-cols-1" : "grid-cols-2"}`}>
      {media.map((m) => (
        <li key={m.id} className="overflow-hidden border border-hairline bg-black/[0.03]">
          {m.kind === "IMAGE" ? (
            <img
              src={mediaUrl(m.id)}
              alt={m.fileName || "Image attached to this post"}
              loading="lazy"
              className={frame}
            />
          ) : (
            // Never autoplay: a feed that starts playing on scroll spends the
            // reader's bandwidth without being asked. preload="metadata" fetches
            // only enough for the poster frame and duration.
            <video
              src={mediaUrl(m.id)}
              controls
              preload="metadata"
              playsInline
              aria-label={m.fileName || "Video attached to this post"}
              className={frame}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
