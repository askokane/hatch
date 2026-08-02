"use server";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { CATALOG_SUGGESTION_LIMIT } from "@/lib/constants";
import { ok, type ActionResult } from "@/lib/action-result";

export type SchoolDTO = { id: string; name: string };

// Type-ahead over the shared school catalog.
//
// There is no create action here on purpose. A school row is a side effect of
// someone finishing onboarding or saving their profile with a school no one has
// used before (ensureSchool, called from those two actions) — never of typing in
// a box. That ordering is what keeps the dropdown made of schools people are
// actually at, instead of every half-typed string anyone ever left in the field.
export async function searchSchoolsAction(query: string): Promise<ActionResult<SchoolDTO[]>> {
  await requireSession();
  const q = query.trim();
  if (!q) return ok([]);

  const rows = await db.school.findMany({
    where: { name: { contains: q, mode: "insensitive" } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    // Over-fetch so the prefix-first re-rank below has something to promote from;
    // a plain alphabetical cut would push "Boston University" off the list for
    // someone typing "bo" in favour of "Aberdeen … Boston …" style matches.
    take: CATALOG_SUGGESTION_LIMIT * 3,
  });

  const lower = q.toLowerCase();
  const ranked = rows.sort((a, b) => {
    const aPrefix = a.name.toLowerCase().startsWith(lower) ? 0 : 1;
    const bPrefix = b.name.toLowerCase().startsWith(lower) ? 0 : 1;
    return aPrefix - bPrefix || a.name.localeCompare(b.name);
  });

  return ok(ranked.slice(0, CATALOG_SUGGESTION_LIMIT));
}
