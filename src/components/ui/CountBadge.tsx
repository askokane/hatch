import { COUNT_BADGE_MAX } from "@/lib/constants";

// A nav-sized count. Anything past COUNT_BADGE_MAX renders as "9+" so the badge
// keeps a fixed width — the exact number stops mattering once it is "a lot", and
// an unbounded one would push the nav around as it grows.
//
// The accessible name always carries the real figure, so screen-reader users are
// not the ones paying for the visual truncation.
export function CountBadge({
  count,
  label,
  max = COUNT_BADGE_MAX,
}: {
  count: number;
  /** Singular noun, e.g. "unread message" / "pending request". */
  label: string;
  max?: number;
}) {
  if (count <= 0) return null;
  const display = count > max ? `${max}+` : String(count);
  return (
    <span
      className="ml-1 text-pine"
      role="status"
      aria-label={`${count} ${label}${count === 1 ? "" : "s"}`}
    >
      [{display}]
    </span>
  );
}
