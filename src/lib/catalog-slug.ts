// Identity key for the two user-grown catalogs (School, Tag).
//
// Both tables let any user create a row by typing something no one has typed
// before, which makes near-duplicates the failure mode to design against:
// "MIT" / "M.I.T." / "mit  " must all land on one row, or the dropdown fills up
// with the same school spelled five ways and stops being useful.
//
// The rule is deliberately blunt — lowercase, every run of non-alphanumerics
// becomes a single "-", ends trimmed. It does NOT fold accents: the School
// backfill in migration 20260802113000 runs the identical transform in SQL
// (`regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')` + trim), and Postgres
// treats "é" as a non-match there. Folding here and not there would split one
// school across two rows on the first upsert after deploy. If accent folding is
// ever added, it has to be added in both places at once.
export function catalogSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
