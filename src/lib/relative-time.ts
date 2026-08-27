// How a post's age is worded, everywhere it is shown.
//
// The scale is Instagram's: a compact relative age while that age is still the
// useful fact ("3h ago" answers "is this fresh?" at a glance), then an absolute
// date once it stops being one. "63w ago" is arithmetic the reader has to do;
// "Dec 26, 2024" is a date they can just read. The tiers step up at the point
// where the smaller unit gets noisy:
//
//   < 1 minute   just now
//   < 1 hour     1m … 59m
//   < 1 day      1h … 23h
//   < 1 week     1d … 6d
//   < ~5 weeks   1w … 4w
//   < 1 year     1mo … 11mo
//   otherwise    Dec 26, 2024
//
// Units floor rather than round, so the label is a floor on the real age: a
// post three and a half days old reads "3d ago", never "4d ago" — the reader
// is never told something is older than it is.
//
// Pure, and `now` is injectable, so the wording is testable without waiting a
// month for a post to age.

// Averaged over a 4-year cycle (365.25 / 12). Months are the one unit with no
// fixed length; approximating is what lets "2mo ago" stay a constant-time
// calculation, and no reader can tell a 61-day month from a 60-day one.
const DAYS_PER_MONTH = 30.4375;

export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  // Clamped at zero: a clock a second ahead of the server should read "just
  // now", not "-1m ago".
  const seconds = Math.max(0, Math.floor((now - then) / 1000));
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  // Weeks run to four. At five the month tier takes over, which is both shorter
  // to read and closer to how people describe that distance out loud.
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;

  const months = Math.floor(days / DAYS_PER_MONTH);
  if (months < 12) return `${months}mo ago`;

  return absoluteDate(then);
}

// The fallback, and the title tooltip's companion: always carries the year,
// because by the time we fall back the year is the part that disambiguates.
export function absoluteDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
