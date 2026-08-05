-- Fold accents into catalog slugs.
--
-- catalogSlug() previously mapped every non-[a-z0-9] run to "-", accents
-- included, so "Université de Montréal" slugged to `universit-de-montr-al`. That
-- was survivable while the catalog held nine hand-typed schools. It is not
-- survivable alongside the ~1,350-university import that follows, where 142
-- countries' worth of names are mostly accented — and the real cost is not ugly
-- identifiers but duplicate rows: a student typing the unaccented spelling of
-- their own university computes a different slug, misses the row, and creates a
-- second one.
--
-- This migration re-slugs the rows that already exist. It was run against the
-- live catalog first to find out what it would touch:
--
--   Tag:    99 rows,  0 change, 0 collisions
--   School:  9 rows,  1 change, 0 collisions
--
-- So it is one row, and there is no merge logic here because there is nothing to
-- merge. If that ever stops being true — a future fold that DOES collide two
-- rows — the merge has to repoint ProfileTag/Profile.school before deleting the
-- loser, and this migration is not that.
--
-- THE SLUG IS A LITERAL, NOT A COMPUTATION. The old comment in catalog-slug.ts
-- required any folding change to be made in TypeScript and in SQL at the same
-- time, because migration 20260802113000 computed slugs with a regexp twin. That
-- twin could never be more than approximately equal (Postgres `unaccent` maps
-- ß→ss; NFD-strip does not), which made it a standing source of drift. Rather
-- than write a second, better twin, this migration carries the value computed by
-- the one implementation in src/lib/catalog-slug.ts. No SQL in this repo
-- computes a slug any more.

UPDATE "School"
   SET "slug" = 'graded-the-american-school-of-sao-paulo'
 WHERE "slug" = 'graded-the-american-school-of-s-o-paulo';
