import Link from "next/link";
import { toBodySegments } from "@/lib/mentions";
import type { ResolvedMention } from "@/lib/feed-types";

// A post body with its mentions turned into links.
//
// The rule this component exists to hold: it links what the SERVER stored and
// nothing else. It never looks a handle up, and an "@word" the author typed at
// somebody they are not connected to arrives here with no matching entry in
// `mentions`, so it renders as the plain text it always was. There is no client
// path that can promote a token — see lib/mentions.ts and the PostMention model.
//
// Everything still goes through React's own escaping: the segments are strings
// placed as children, and nothing in this feature uses dangerouslySetInnerHTML.
export function PostBody({
  body,
  mentions,
  className = "",
}: {
  body: string;
  mentions: ResolvedMention[];
  className?: string;
}) {
  if (!body) return null;
  const segments = toBodySegments(body, mentions);

  return (
    // `whitespace-pre-wrap` is what keeps the author's own line breaks, and it is
    // why the segments must not introduce whitespace of their own — each one is
    // an exact slice of the body, so joining them reproduces it character for
    // character.
    <p className={`whitespace-pre-wrap text-sm leading-relaxed ${className}`}>
      {segments.map((segment, i) =>
        segment.kind === "text" ? (
          segment.text
        ) : (
          <Link
            key={i}
            // The body says "@alice"; the link goes wherever Alice is NOW. The two
            // differ after a rename, and following the stored text instead would
            // point every old mention at a 404.
            href={`/u/${segment.mention.currentHandle}`}
            // The name is not in the visible text — the body only carries the
            // handle — so it goes in the title for a reader who wants it and in
            // nothing that would change the line's length.
            title={segment.mention.name}
            className="font-600 text-pine hover:underline"
          >
            {segment.text}
          </Link>
        )
      )}
    </p>
  );
}
