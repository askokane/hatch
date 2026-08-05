// Identity key for the two user-grown catalogs (School, Tag).
//
// Both tables let any user create a row by typing something no one has typed
// before, which makes near-duplicates the failure mode to design against:
// "MIT" / "M.I.T." / "mit  " must all land on one row, or the dropdown fills up
// with the same school spelled five ways and stops being useful.
//
// The rule: fold accents to their base letters, lowercase, every run of
// non-alphanumerics becomes a single "-", ends trimmed.
//
// The accent fold was added in migration 20260805140000, ahead of importing
// ~1,350 universities from 142 countries. Without it every non-English
// institution slugs to punctuation soup — "Université de Montréal" became
// `universit-de-montr-al` — and, worse, a student typing the unaccented spelling
// of their own university would fail to match the accented row and create a
// second one. Accents are the common case in this data, not the edge case.
//
// ON THE OLD WARNING, which said folding must be added here and in SQL
// simultaneously: that constraint is now retired rather than satisfied. Nothing
// computes a slug in SQL any more. Migration 20260802113000's backfill has
// already run and is historical; the accent migration and the catalog import
// both carry slugs computed HERE and embedded as literals. There is one
// implementation of this rule in the codebase and it is this function — plus a
// deliberate copy in scripts/fetch-universities.mjs, which runs at authoring
// time and is checked against this one by scripts/verify-catalog.ts.
//
// NFD splits an accented character into base + combining mark; stripping the
// marks leaves the base letter. It does not transliterate non-Latin scripts —
// "北京大学" still slugs to "" and is stored under its English label, which is
// what the catalog holds anyway.
export function catalogSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
