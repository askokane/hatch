"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, requireProfile } from "@/lib/session";
import { ensureSchool } from "@/lib/school-catalog";
import { updateProfileSchema } from "@/lib/validation/profile.schema";
import { HANDLE_IMMUTABLE_DAYS } from "@/lib/constants";
import { ok, fail, type ActionResult } from "@/lib/action-result";

type UpdateProfileInput = {
  name: string;
  handle: string;
  school: string;
  gradYear: number;
  basedIn: string;
  bio: string;
  links: { label: string; url: string }[];
  skillTagIds: string[];
  learningTagIds: string[];
  intents: { kind: string; note: string }[];
  isDiscoverable: boolean;
};

// Updates the CALLER'S OWN profile only. Never accepts a profileId from the
// client — the target is always session.profileId, so there is no ID to tamper.
export async function updateProfileAction(
  input: UpdateProfileInput
): Promise<ActionResult<{ handle: string }>> {
  const session = await requireSession();
  const profileId = await requireProfile(session);

  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Please fix the highlighted fields.");
  }
  const data = parsed.data;

  const current = await db.profile.findUnique({ where: { id: profileId } });
  if (!current) return fail("Profile not found.");

  // Handle immutability after 7 days.
  if (data.handle !== current.handle) {
    const ageMs = Date.now() - current.handleChangedAt.getTime();
    if (ageMs > HANDLE_IMMUTABLE_DAYS * 24 * 60 * 60 * 1000) {
      return fail(
        `Handles can only be changed within ${HANDLE_IMMUTABLE_DAYS} days of creation.`,
        { handle: "This handle can no longer be changed." }
      );
    }
    const taken = await db.profile.findUnique({ where: { handle: data.handle } });
    if (taken && taken.id !== profileId) {
      return fail("That handle is taken.", { handle: "That handle is taken." });
    }
  }

  // Validate tag IDs exist.
  const allTagIds = [...new Set([...data.skillTagIds, ...data.learningTagIds])];
  const existing = await db.tag.findMany({ where: { id: { in: allTagIds } }, select: { id: true } });
  const existingIds = new Set(existing.map((t) => t.id));
  const skillIds = data.skillTagIds.filter((id) => existingIds.has(id));
  const learningIds = data.learningTagIds.filter((id) => existingIds.has(id));
  if (skillIds.length < 3 || learningIds.length < 1) {
    return fail("Keep at least 3 skill tags and 1 learning tag.");
  }

  // Same catalog write as onboarding: editing your profile to a school nobody
  // has used yet is the other way a school enters the dropdown.
  const school = await ensureSchool(data.school);

  await db.$transaction([
    db.profile.update({
      where: { id: profileId },
      data: {
        name: data.name,
        handle: data.handle,
        school,
        gradYear: data.gradYear,
        basedIn: data.basedIn ?? "",
        bio: data.bio ?? "",
        links: data.links,
        isDiscoverable: data.isDiscoverable,
        ...(data.handle !== current.handle ? { handleChangedAt: new Date() } : {}),
      },
    }),
    db.profileTag.deleteMany({ where: { profileId } }),
    db.profileTag.createMany({
      data: [
        ...skillIds.map((tagId) => ({ profileId, tagId, relation: "HAS" as const })),
        ...learningIds.map((tagId) => ({ profileId, tagId, relation: "LEARNING" as const })),
      ],
    }),
    db.intent.deleteMany({ where: { profileId } }),
    ...data.intents.map((i) =>
      db.intent.create({ data: { profileId, kind: i.kind as never, note: i.note ?? "" } })
    ),
  ]);

  revalidatePath("/profile");
  revalidatePath(`/u/${data.handle}`);
  return ok({ handle: data.handle });
}

// Toggles discoverability on the caller's own profile.
export async function setDiscoverableAction(isDiscoverable: boolean): Promise<ActionResult> {
  const session = await requireSession();
  const profileId = await requireProfile(session);
  await db.profile.update({ where: { id: profileId }, data: { isDiscoverable } });
  revalidatePath("/profile");
  return ok(undefined);
}
