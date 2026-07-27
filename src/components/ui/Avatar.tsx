import { generateAvatarSvg } from "@/lib/avatar";

// Renders the deterministic identicon. The SVG string comes exclusively from the
// hash-driven generator (never user free-text), so dangerouslySetInnerHTML here
// carries no injection risk — see lib/avatar.ts.
export function Avatar({
  seed,
  size = 40,
  className = "",
}: {
  seed: string;
  size?: number;
  className?: string;
}) {
  const svg = generateAvatarSvg(seed, size);
  return (
    <span
      className={`inline-block overflow-hidden border border-hairline ${className}`}
      style={{ width: size, height: size, lineHeight: 0 }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
