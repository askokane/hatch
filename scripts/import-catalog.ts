// Additive catalog import. Adds curated tags and universities to a database that
// already has users in it.
//
//   npm run catalog:import              # DATABASE_URL
//   npm run catalog:import -- --dry-run # report only, write nothing
//
// WHY THIS IS NOT THE SEED. `npm run seed` deleteMany()s every table before it
// rebuilds — it is a "make this database look like the demo dataset" tool, and
// pointing it at production would destroy every real account. This script only
// ever inserts, uses skipDuplicates so re-running is a no-op, and never issues a
// delete or an update. The two are not interchangeable and must not be merged.
//
// WHY NOT A MIGRATION. Tag.id and School.id are `@default(cuid())`, and Prisma
// generates cuids in the CLIENT, not in the database — the columns have no
// server-side default. A raw-SQL migration would therefore have to invent its
// own ids, which would either be uuids (inconsistent with every existing row) or
// literals baked into the file. Going through the Prisma client keeps ids in one
// format produced by one generator. The seed carries the same data so a fresh
// database and the e2e schema get it without this script running at all.
//
// IDENTITY IS THE SLUG, and slugs here are the literals in the data files, which
// scripts/verify-catalog.ts has already checked equal catalogSlug(label). A row
// whose slug is already present is left exactly as it is: the catalog is
// user-grown, so an existing row may be one somebody created by typing it, and
// their spelling is the canonical one (the same first-writer-wins rule
// ensureSchool applies).

import { PrismaClient, TagKind } from "@prisma/client";
import { readFileSync } from "node:fs";
import { CATALOG_TAGS } from "../prisma/data/catalog-tags";

type Uni = { slug: string; name: string; country: string; sitelinks: number };

const db = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

async function main() {
  const universities: Uni[] = JSON.parse(readFileSync("prisma/data/universities.json", "utf8"));

  console.log(`Source data: ${CATALOG_TAGS.length} curated tags, ${universities.length} universities`);
  if (dryRun) console.log("DRY RUN — nothing will be written.\n");

  // --- tags ---------------------------------------------------------------
  const existingTags = new Set(
    (await db.tag.findMany({ select: { slug: true } })).map((t) => t.slug)
  );
  const newTags = CATALOG_TAGS.filter((t) => !existingTags.has(t.slug));

  console.log(`Tags:         ${existingTags.size} present, ${newTags.length} to add`);
  if (newTags.length !== CATALOG_TAGS.length) {
    const overlap = CATALOG_TAGS.length - newTags.length;
    console.log(`              (${overlap} already exist and are left untouched)`);
  }

  // --- schools ------------------------------------------------------------
  const existingSchools = new Set(
    (await db.school.findMany({ select: { slug: true } })).map((s) => s.slug)
  );
  const newSchools = universities.filter((u) => !existingSchools.has(u.slug));

  console.log(`Schools:      ${existingSchools.size} present, ${newSchools.length} to add`);

  if (dryRun) {
    console.log("\nWould add, first 10 tags:");
    newTags.slice(0, 10).forEach((t) => console.log(`  ${t.kind.padEnd(8)} ${t.label}`));
    console.log("\nWould add, first 10 schools:");
    newSchools.slice(0, 10).forEach((s) => console.log(`  ${s.name}`));
    return;
  }

  if (newTags.length > 0) {
    // skipDuplicates is belt-and-braces on top of the filter above: between the
    // read and this write, someone using the app can create a tag by typing it.
    const res = await db.tag.createMany({
      data: newTags.map((t) => ({
        slug: t.slug,
        label: t.label,
        kind: t.kind as TagKind,
        aliases: t.aliases,
      })),
      skipDuplicates: true,
    });
    console.log(`\nInserted ${res.count} tags`);
  }

  if (newSchools.length > 0) {
    // Chunked: a single createMany of ~1,350 rows is one very large statement
    // over a pooled connection, and the pool has a 30s timeout. 250 keeps each
    // round trip small enough to be uninteresting.
    const CHUNK = 250;
    let inserted = 0;
    for (let i = 0; i < newSchools.length; i += CHUNK) {
      const res = await db.school.createMany({
        data: newSchools.slice(i, i + CHUNK).map((s) => ({ slug: s.slug, name: s.name })),
        skipDuplicates: true,
      });
      inserted += res.count;
      process.stdout.write(`\rInserted ${inserted}/${newSchools.length} schools`);
    }
    console.log("");
  }

  const [tagCount, schoolCount, aliased] = await Promise.all([
    db.tag.count(),
    db.school.count(),
    db.$queryRawUnsafe<{ n: number }[]>(`select count(*)::int as n from "Tag" where aliases::text <> '[]'`),
  ]);
  console.log(`\nFinal: ${tagCount} tags, ${schoolCount} schools`);
  console.log(`Rows carrying aliases: ${aliased[0].n} (TAG_ALIAS_SCAN_MAX must stay above this)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
