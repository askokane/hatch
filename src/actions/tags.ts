"use server";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { catalogSlug } from "@/lib/catalog-slug";
import {
  CATALOG_SUGGESTION_LIMIT,
  TAG_ALIAS_SCAN_MAX,
  TAG_LABEL_MAX,
  TAG_LABEL_MIN,
} from "@/lib/constants";
import { ok, fail, type ActionResult } from "@/lib/action-result";

export type TagDTO = { id: string; slug: string; label: string; kind: string };

function toDTO(t: { id: string; slug: string; label: string; kind: string }): TagDTO {
  return { id: t.id, slug: t.slug, label: t.label, kind: t.kind };
}

// Autocomplete against the taxonomy. Matches slug, label, and any alias.
// Returns [] rather than throwing on empty query.
export async function searchTagsAction(
  query: string,
  kind?: "SKILL" | "INTEREST" | "DOMAIN"
): Promise<ActionResult<TagDTO[]>> {
  await requireSession();
  const q = query.trim().toLowerCase();
  if (!q) return ok([]);

  const candidates = await db.tag.findMany({
    where: {
      ...(kind ? { kind } : {}),
      OR: [
        { slug: { contains: q, mode: "insensitive" } },
        { label: { contains: q, mode: "insensitive" } },
      ],
    },
    take: CATALOG_SUGGESTION_LIMIT,
    orderBy: { label: "asc" },
  });

  // Alias matches ("k8s" → Kubernetes) are resolved in-process because `aliases`
  // is a Json array, which Prisma cannot search element-wise here.
  //
  // The `NOT aliases = []` filter is what keeps that affordable now that the
  // taxonomy is user-grown rather than a fixed set of seeded rows. Only curated
  // rows carry aliases — createTagAction() deliberately writes none — so this
  // scans the curated set alone, and no amount of user-created tags can push a
  // seeded row out of the `take` window and silently break "k8s".
  //
  // TAG_ALIAS_SCAN_MAX is the bound on that curated set, and it has to stay
  // ahead of it: the catalog expansion took the set from 99 rows to 326. See
  // the note on the constant for why the answer past a certain size is an
  // indexed table rather than a larger number.
  const aliased = await db.tag.findMany({
    where: { ...(kind ? { kind } : {}), NOT: { aliases: { equals: [] } } },
    take: TAG_ALIAS_SCAN_MAX,
  });
  const aliasMatches = aliased.filter((t) => {
    const aliases = (t.aliases as unknown as string[]) ?? [];
    return aliases.some((a) => a.toLowerCase().includes(q));
  });

  const byId = new Map<string, TagDTO>();
  for (const t of [...candidates, ...aliasMatches]) byId.set(t.id, toDTO(t));
  return ok([...byId.values()].slice(0, CATALOG_SUGGESTION_LIMIT));
}

// Adds a skill/tag nobody has used before to the shared taxonomy and returns it
// ready to attach, so the next person who starts typing it gets it as a
// suggestion instead of creating a second copy.
//
// Idempotent by slug: "Rust", "rust" and "  RUST  " all resolve to the existing
// row rather than failing or duplicating. That matters because the caller's
// dropdown only offers "add" when the search found nothing, and search is a
// substring match — a user can still reach this with a label that already exists
// under different punctuation.
export async function createTagAction(
  rawText: string,
  kind?: "SKILL" | "INTEREST" | "DOMAIN"
): Promise<ActionResult<TagDTO>> {
  const session = await requireSession();

  const label = rawText.trim().replace(/\s+/g, " ");
  if (label.length < TAG_LABEL_MIN) return fail(`Tags need at least ${TAG_LABEL_MIN} characters.`);
  if (label.length > TAG_LABEL_MAX) return fail(`Tags must be at most ${TAG_LABEL_MAX} characters.`);

  const slug = catalogSlug(label);
  if (!slug) return fail("Tags need at least one letter or number.");

  const existing = await db.tag.findUnique({ where: { slug } });
  if (existing) {
    // Not an error: hand back the row the user was really reaching for.
    return ok(toDTO(existing));
  }

  let created;
  try {
    created = await db.tag.create({
      data: {
        slug,
        label,
        // Untyped free text has to land somewhere, and SKILL is the only kind the
        // pickers that can reach this action are collecting. INTEREST/DOMAIN stay
        // curated — nothing in the UI creates one.
        kind: kind ?? "SKILL",
        // Intentionally empty. Aliases are a curation tool, and leaving them
        // empty is also what keeps the alias scan in searchTagsAction bounded to
        // the curated set — see the comment there before changing this.
        aliases: [],
      },
    });
  } catch {
    // Lost a race to another user creating the same tag; adopt theirs.
    const winner = await db.tag.findUnique({ where: { slug } });
    if (!winner) return fail("Could not add that tag. Try again.");
    return ok(toDTO(winner));
  }

  // Provenance, not a to-do: records the raw text before normalization and the
  // row it produced, so a junk tag can be traced back to who introduced it.
  await db.tagSuggestion.create({
    data: {
      rawText,
      kind: created.kind,
      suggestedBy: session.profileId ?? null,
      resolved: true,
      resolvedTagId: created.id,
    },
  });

  return ok(toDTO(created));
}
