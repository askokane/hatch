// AUTHORING-TIME TOOL. Not used at runtime, not imported by the app.
//
// Pulls the major-university list out of Wikidata and writes it to
// prisma/data/universities.json, which the seed and the catalog migration both
// read. It is committed so the list is reproducible: `node scripts/fetch-universities.mjs`
// regenerates it, and the diff shows exactly what moved.
//
// Why Wikidata and not a scrape: it is CC0, it is already structured, and — the
// reason it beats every other source here — "major" can be expressed as a filter
// rather than as taste. Sitelink count (how many Wikipedia language editions
// carry an article) is a good, language-neutral notability proxy: it ranks
// Tsinghua and ETH Zürich alongside Harvard without me hand-picking either, and
// it drops the several thousand institutions that exist in the data but that no
// student would search for.
//
// The alternative sources, for the record: Hipolabs university-domains-list
// (~10k, simple, but no notability signal to cut on) and IPEDS/College
// Scorecard (authoritative but US-only).

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const OUT = "prisma/data/universities.json";

// Minimum Wikipedia language editions carrying an article. 20 lands ~1,900
// institutions: comfortably past every well-known university in every major
// country, and short of the long tail the user-grown catalog is there to absorb.
const MIN_SITELINKS = 20;
const LIMIT = 5000;

// One class, traversed transitively: everything that is a higher education
// institution or any subclass of one.
//
// An earlier cut of this script enumerated ~16 class QIDs explicitly, on the
// stated grounds that `wdt:P31/wdt:P279*` would time out on the public endpoint.
// That was an assumption, and it was wrong — the traversal below returns in
// about 20 seconds. Enumerating was also worse on both axes it was supposed to
// help: it MISSED the University of Tokyo, National University of Singapore and
// Central Saint Martins (each typed under a subclass that was not in the list),
// while simultaneously dragging in Al-Azhar Mosque, the American Museum of
// Natural History and the British Council through the looser catch-all classes.
// The transitive form finds all three of the former and none of the latter,
// because "subclass of higher education institution" is exactly the question
// being asked.
const ROOT_CLASS = "wd:Q38723"; // higher education institution

const QUERY = `
SELECT ?item ?itemLabel ?countryLabel ?sitelinks WHERE {
  ?item wdt:P31/wdt:P279* ${ROOT_CLASS} .
  ?item wikibase:sitelinks ?sitelinks .
  FILTER(?sitelinks >= ${MIN_SITELINKS})
  OPTIONAL { ?item wdt:P17 ?country . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT ${LIMIT}
`;
// No ORDER BY: sorting the transitive result set server-side pushed the endpoint
// into a 502, and it buys nothing here. LIMIT sits comfortably above the row
// count the sitelink filter yields, so nothing is truncated and the order the
// rows arrive in cannot change which ones are kept. The output file is sorted by
// name in JS below.

// The identity rule, and it must stay byte-identical to catalogSlug() in
// src/lib/catalog-slug.ts — including the NFD accent fold, without which every
// "Université"/"Universität" lands on a slug full of dashes.
function catalogSlug(name) {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Wikidata returns "Q12345" as the label when an item has no English one, and
// occasionally carries a parenthetical disambiguator that is not part of the
// institution's name.
function cleanName(raw) {
  return raw
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

// WDQS is a free shared endpoint and returns a transient 429/502/504 often
// enough that a single attempt is not a reliable build step.
async function query(sparql, attempts = 4) {
  for (let i = 1; i <= attempts; i++) {
    const res = await fetch(
      `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`,
      {
        headers: {
          Accept: "application/sparql-results+json",
          // WDQS rejects requests without a descriptive agent.
          "User-Agent": "HATCH-catalog-build/1.0 (student network; catalog seeding)",
        },
      }
    );
    if (res.ok) return res.json();
    if (i === attempts) {
      console.error(`Wikidata returned ${res.status} ${res.statusText} after ${attempts} attempts`);
      process.exit(1);
    }
    const wait = i * 5000;
    console.error(`  ${res.status} ${res.statusText}; retrying in ${wait / 1000}s (${i}/${attempts - 1})`);
    await new Promise((r) => setTimeout(r, wait));
  }
}

const json = await query(QUERY);
const rows = json.results.bindings;
console.log(`Wikidata returned ${rows.length} rows`);

const bySlug = new Map();
let skippedUnlabelled = 0;
let skippedDuplicate = 0;

for (const r of rows) {
  const name = cleanName(r.itemLabel?.value ?? "");
  if (!name || /^Q\d+$/.test(name)) {
    skippedUnlabelled++;
    continue;
  }
  const slug = catalogSlug(name);
  if (!slug) continue;
  if (bySlug.has(slug)) {
    skippedDuplicate++;
    continue;
  }
  bySlug.set(slug, {
    slug,
    name,
    country: r.countryLabel?.value ?? "",
    sitelinks: Number(r.sitelinks?.value ?? 0),
  });
}

// Alphabetical in the file so a regenerated list produces a readable diff rather
// than a reshuffle; the sitelink ranking has already done its job as the filter.
const out = [...bySlug.values()].sort((a, b) => a.name.localeCompare(b.name));

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n", "utf8");

console.log(
  `Wrote ${out.length} universities to ${OUT} ` +
    `(skipped ${skippedUnlabelled} unlabelled, ${skippedDuplicate} slug-duplicates)`
);
console.log("Sample:", out.slice(0, 5).map((u) => u.name).join(" | "));
