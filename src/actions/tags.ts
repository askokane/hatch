"use server";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { ok, fail, type ActionResult } from "@/lib/action-result";

export type TagDTO = { id: string; slug: string; label: string; kind: string };

// Autocomplete against the taxonomy only. Matches slug, label, and any alias.
// Returns [] rather than throwing on empty query.
export async function searchTagsAction(
  query: string,
  kind?: "SKILL" | "INTEREST" | "DOMAIN"
): Promise<ActionResult<TagDTO[]>> {
  await requireSession();
  const q = query.trim().toLowerCase();
  if (!q) return ok([]);

  // SQLite `contains` is case-insensitive for ASCII by default here. We match on
  // slug/label directly; alias matching is done in-process since aliases is Json.
  const candidates = await db.tag.findMany({
    where: {
      ...(kind ? { kind } : {}),
      OR: [
        { slug: { contains: q, mode: "insensitive" } },
        { label: { contains: q, mode: "insensitive" } },
      ],
    },
    take: 20,
    orderBy: { label: "asc" },
  });

  // Also pull alias matches (Json array) for tags not already matched.
  const all = await db.tag.findMany({ where: kind ? { kind } : {}, take: 500 });
  const aliasMatches = all.filter((t) => {
    const aliases = (t.aliases as unknown as string[]) ?? [];
    return aliases.some((a) => a.toLowerCase().includes(q));
  });

  const byId = new Map<string, TagDTO>();
  for (const t of [...candidates, ...aliasMatches]) {
    byId.set(t.id, { id: t.id, slug: t.slug, label: t.label, kind: t.kind });
  }
  return ok([...byId.values()].slice(0, 20));
}

// Free-text that didn't resolve to a Tag: log a suggestion, never create a Tag.
export async function suggestTagAction(
  rawText: string,
  kind?: "SKILL" | "INTEREST" | "DOMAIN"
): Promise<ActionResult<undefined>> {
  const session = await requireSession();
  const text = rawText.trim();
  if (!text) return fail("Enter a tag.");
  await db.tagSuggestion.create({
    data: { rawText: text, kind: kind ?? null, suggestedBy: session.profileId ?? null },
  });
  return ok(undefined);
}
