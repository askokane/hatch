import { db } from "@/lib/db";
import { catalogSlug } from "@/lib/catalog-slug";

// Records a school in the shared catalog and returns the name that should be
// stored on the profile.
//
// The return value is the point of this function, not a courtesy: when the slug
// already exists, the CATALOG's spelling wins over what this user typed. So the
// second person to join from MIT writes "MIT" onto their profile even if they
// typed "mit", and the discover school filter — which is a DISTINCT over
// Profile.school, not over this table — keeps showing one entry rather than one
// per casing. First writer sets the canonical spelling; that is the deliberate
// trade for not having an admin-curated list.
//
// Callers must have validated length first (the zod schema does). A name with
// nothing sluggable in it ("???") is returned untouched and NOT catalogued —
// it would be an entry no one could ever match against.
export async function ensureSchool(rawName: string): Promise<string> {
  const name = rawName.trim().replace(/\s+/g, " ");
  const slug = catalogSlug(name);
  if (!slug) return name;

  const existing = await db.school.findUnique({ where: { slug } });
  if (existing) return existing.name;

  try {
    const created = await db.school.create({ data: { slug, name } });
    return created.name;
  } catch {
    // Two people onboarding from the same new school at once: the slug unique
    // constraint rejects the loser, who then adopts the winner's spelling.
    const winner = await db.school.findUnique({ where: { slug } });
    return winner?.name ?? name;
  }
}
