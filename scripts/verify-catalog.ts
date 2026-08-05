// Static checks on the curated catalog data. No database, no network — safe to
// run anywhere, and fast enough to run before every import.
//
//   npx tsx scripts/verify-catalog.ts
//
// What it is defending against, in order of how much damage each one does:
//
//   1. slug !== catalogSlug(label). The worst one, and invisible until it bites.
//      createTagAction derives the slug from what the user types, so a row whose
//      slug is not its own label's slug is unreachable by that path — the user
//      types "M&A", computes `m-a`, finds nothing, and creates a duplicate. The
//      catalog exists to prevent duplicates; this check is why it can.
//   2. Duplicate slugs, within the new set or against the seeded one.
//   3. One alias claimed by two tags — an ambiguous lookup where the winner is
//      whichever row the query happens to return first.
//   4. Labels outside TAG_LABEL_MIN/MAX, which the create action would reject.
//   5. The slug rule in fetch-universities.mjs drifting from catalogSlug().

import { readFileSync } from "node:fs";
import { CATALOG_TAGS, CATALOG_TAG_GROUPS } from "../prisma/data/catalog-tags";
import { catalogSlug } from "../src/lib/catalog-slug";
import { TAG_LABEL_MAX, TAG_LABEL_MIN } from "../src/lib/constants";

type Uni = { slug: string; name: string; country: string; sitelinks: number };

const problems: string[] = [];
const fail = (msg: string) => problems.push(msg);

// --- tags -------------------------------------------------------------------
for (const [group, list] of Object.entries(CATALOG_TAG_GROUPS)) {
  console.log(`  ${group.padEnd(9)} ${list.length}`);
}
console.log(`  ${"TOTAL".padEnd(9)} ${CATALOG_TAGS.length}\n`);

const seen = new Set<string>();
for (const t of CATALOG_TAGS) {
  if (catalogSlug(t.label) !== t.slug) {
    fail(`slug mismatch: "${t.label}" slugs to "${catalogSlug(t.label)}" but is declared "${t.slug}"`);
  }
  if (seen.has(t.slug)) fail(`duplicate slug in curated set: ${t.slug}`);
  seen.add(t.slug);
  if (t.label.length < TAG_LABEL_MIN || t.label.length > TAG_LABEL_MAX) {
    fail(`label length out of range (${TAG_LABEL_MIN}-${TAG_LABEL_MAX}): "${t.label}"`);
  }
  for (const a of t.aliases) {
    if (a !== a.toLowerCase()) fail(`alias must be lowercase: ${t.slug} -> "${a}"`);
    if (!a.trim()) fail(`empty alias on ${t.slug}`);
  }
}

const aliasOwner = new Map<string, string>();
for (const t of CATALOG_TAGS) {
  for (const a of t.aliases) {
    const prior = aliasOwner.get(a);
    if (prior && prior !== t.slug) fail(`alias "${a}" is claimed by both ${prior} and ${t.slug}`);
    aliasOwner.set(a, t.slug);
  }
}

// An alias that is also some OTHER tag's slug resolves ambiguously.
for (const [alias, owner] of aliasOwner) {
  const asSlug = catalogSlug(alias);
  if (seen.has(asSlug) && asSlug !== owner) {
    fail(`alias "${alias}" (on ${owner}) collides with the slug of ${asSlug}`);
  }
}

// --- universities -----------------------------------------------------------
let unis: Uni[] = [];
try {
  unis = JSON.parse(readFileSync("prisma/data/universities.json", "utf8"));
} catch {
  fail("prisma/data/universities.json is missing — run: node scripts/fetch-universities.mjs");
}

const uniSlugs = new Set<string>();
for (const u of unis) {
  // The fetch script carries its own copy of the slug rule (it is .mjs and runs
  // outside the app's module graph). This is the check that keeps the copy honest.
  if (catalogSlug(u.name) !== u.slug) {
    fail(`university slug mismatch: "${u.name}" -> "${catalogSlug(u.name)}" but stored "${u.slug}"`);
  }
  if (uniSlugs.has(u.slug)) fail(`duplicate university slug: ${u.slug}`);
  uniSlugs.add(u.slug);
  if (!u.name.trim()) fail(`university with empty name (slug ${u.slug})`);
}
console.log(`  universities ${unis.length}\n`);

if (problems.length) {
  console.error(`${problems.length} problem(s):`);
  for (const p of problems.slice(0, 40)) console.error(`  - ${p}`);
  if (problems.length > 40) console.error(`  ... and ${problems.length - 40} more`);
  process.exit(1);
}
console.log("Catalog data is consistent.");
