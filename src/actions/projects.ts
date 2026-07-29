"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession, requireProfile } from "@/lib/session";
import { assertProjectMember, assertProjectOwner, ForbiddenError } from "@/lib/authz";
import {
  createProjectSchema,
  updateProjectSchema,
  postUpdateSchema,
  openRoleSchema,
  inviteMemberSchema,
} from "@/lib/validation/project.schema";
import { ok, fail, type ActionResult } from "@/lib/action-result";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

async function uniqueSlug(base: string): Promise<string> {
  const slug = base || "project";
  let candidate = slug;
  let n = 1;
  while (await db.project.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${slug}-${n++}`;
  }
  return candidate;
}

async function validTagIds(ids: string[]): Promise<string[]> {
  const existing = await db.tag.findMany({ where: { id: { in: ids } }, select: { id: true } });
  return existing.map((t) => t.id);
}

// Create a project. Requires a verified email (creating implies inviting/messaging).
// The creator becomes an owner Membership in the same transaction.
export async function createProjectAction(input: {
  name: string;
  description: string;
  stage: "IDEA" | "BUILDING" | "LAUNCHED";
  visibility: "PUBLIC" | "UNLISTED";
  links: { label: string; url: string }[];
  tagIds: string[];
}): Promise<ActionResult<{ slug: string }>> {
  const session = await requireSession();
  const profileId = await requireProfile(session);

  const parsed = createProjectSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please complete the form.");
  const data = parsed.data;

  const tagIds = await validTagIds(data.tagIds);
  if (tagIds.length < 1) return fail("Add at least one recognized tag.");

  const slug = await uniqueSlug(slugify(data.name));

  await db.project.create({
    data: {
      slug,
      name: data.name,
      description: data.description,
      stage: data.stage,
      visibility: data.visibility,
      links: data.links,
      createdById: profileId,
      memberships: { create: { profileId, role: "Founder", isOwner: true } },
      tags: { create: tagIds.map((tagId) => ({ tagId })) },
    },
  });

  revalidatePath("/discover");
  redirect(`/p/${slug}`);
}

// Update project metadata. Owner only (authz re-derived from DB).
export async function updateProjectAction(
  projectId: string,
  input: {
    name: string;
    description: string;
    stage: "IDEA" | "BUILDING" | "LAUNCHED";
    visibility: "PUBLIC" | "UNLISTED";
    links: { label: string; url: string }[];
    tagIds: string[];
  }
): Promise<ActionResult> {
  const session = await requireSession();
  const profileId = await requireProfile(session);
  await assertProjectOwner(projectId, profileId);

  const parsed = updateProjectSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please complete the form.");
  const data = parsed.data;
  const tagIds = await validTagIds(data.tagIds);
  if (tagIds.length < 1) return fail("Add at least one recognized tag.");

  const project = await db.project.findUnique({ where: { id: projectId }, select: { slug: true } });

  await db.$transaction([
    db.project.update({
      where: { id: projectId },
      data: {
        name: data.name,
        description: data.description,
        stage: data.stage,
        visibility: data.visibility,
        links: data.links,
      },
    }),
    db.projectTag.deleteMany({ where: { projectId } }),
    db.projectTag.createMany({ data: tagIds.map((tagId) => ({ projectId, tagId })) }),
  ]);

  revalidatePath(`/p/${project?.slug}`);
  return ok(undefined);
}

// Close a project. Owner only.
export async function closeProjectAction(projectId: string): Promise<ActionResult> {
  const session = await requireSession();
  const profileId = await requireProfile(session);
  await assertProjectOwner(projectId, profileId);
  const project = await db.project.update({
    where: { id: projectId },
    data: { closedAt: new Date() },
    select: { slug: true },
  });
  revalidatePath(`/p/${project.slug}`);
  return ok(undefined);
}

// Post an async update. ANY member may post (not just owners). This is the check
// that blocks posting to a project you don't belong to.
export async function postUpdateAction(projectId: string, body: string): Promise<ActionResult> {
  const session = await requireSession();
  const profileId = await requireProfile(session);
  await assertProjectMember(projectId, profileId);

  const parsed = postUpdateSchema.safeParse({ body });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Write an update.");

  const project = await db.project.findUnique({ where: { id: projectId }, select: { slug: true } });
  await db.update.create({
    data: { projectId, authorProfileId: profileId, body: parsed.data.body },
  });
  revalidatePath(`/p/${project?.slug}`);
  return ok(undefined);
}

// Create an open role. Owner only. Requires 1+ valid tag.
export async function createOpenRoleAction(
  projectId: string,
  input: { title: string; description: string; commitment: "LIGHT" | "STEADY" | "HEAVY"; tagIds: string[] }
): Promise<ActionResult> {
  const session = await requireSession();
  const profileId = await requireProfile(session);
  await assertProjectOwner(projectId, profileId);

  const parsed = openRoleSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please complete the role.");
  const tagIds = await validTagIds(parsed.data.tagIds);
  if (tagIds.length < 1) return fail("A role needs at least one recognized required tag.");

  const project = await db.project.findUnique({ where: { id: projectId }, select: { slug: true } });
  await db.openRole.create({
    data: {
      projectId,
      title: parsed.data.title,
      description: parsed.data.description,
      commitment: parsed.data.commitment,
      tags: { create: tagIds.map((tagId) => ({ tagId })) },
    },
  });
  revalidatePath(`/p/${project?.slug}`);
  return ok(undefined);
}

export async function closeRoleAction(roleId: string): Promise<ActionResult> {
  const session = await requireSession();
  const profileId = await requireProfile(session);
  const role = await db.openRole.findUnique({
    where: { id: roleId },
    select: { projectId: true, project: { select: { slug: true } } },
  });
  if (!role) return fail("Role not found.");
  await assertProjectOwner(role.projectId, profileId);
  await db.openRole.update({ where: { id: roleId }, data: { status: "CLOSED" } });
  revalidatePath(`/p/${role.project.slug}`);
  return ok(undefined);
}

// Invite a member by handle. Owner only.
export async function inviteMemberAction(
  projectId: string,
  input: { handle: string; role: string }
): Promise<ActionResult> {
  const session = await requireSession();
  const profileId = await requireProfile(session);
  await assertProjectOwner(projectId, profileId);

  const parsed = inviteMemberSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid invite.");

  const invitee = await db.profile.findUnique({
    where: { handle: parsed.data.handle },
    select: { id: true },
  });
  if (!invitee) return fail("No profile with that handle.");

  const existing = await db.membership.findUnique({
    where: { projectId_profileId: { projectId, profileId: invitee.id } },
  });
  if (existing) return fail("They're already a member.");

  const project = await db.project.findUnique({ where: { id: projectId }, select: { slug: true } });
  await db.membership.create({
    data: { projectId, profileId: invitee.id, role: parsed.data.role, isOwner: false },
  });
  revalidatePath(`/p/${project?.slug}`);
  return ok(undefined);
}

// Remove a member. Owner only; cannot remove the last owner.
export async function removeMemberAction(projectId: string, memberProfileId: string): Promise<ActionResult> {
  const session = await requireSession();
  const profileId = await requireProfile(session);
  await assertProjectOwner(projectId, profileId);

  const target = await db.membership.findUnique({
    where: { projectId_profileId: { projectId, profileId: memberProfileId } },
  });
  if (!target) return fail("They're not a member.");
  if (target.isOwner) {
    const ownerCount = await db.membership.count({ where: { projectId, isOwner: true } });
    if (ownerCount <= 1) return fail("Transfer ownership before removing the last owner.");
  }
  const project = await db.project.findUnique({ where: { id: projectId }, select: { slug: true } });
  await db.membership.delete({
    where: { projectId_profileId: { projectId, profileId: memberProfileId } },
  });
  revalidatePath(`/p/${project?.slug}`);
  return ok(undefined);
}

// Transfer ownership to an existing member. Owner only.
export async function transferOwnershipAction(
  projectId: string,
  newOwnerProfileId: string
): Promise<ActionResult> {
  const session = await requireSession();
  const profileId = await requireProfile(session);
  await assertProjectOwner(projectId, profileId);

  const target = await db.membership.findUnique({
    where: { projectId_profileId: { projectId, profileId: newOwnerProfileId } },
  });
  if (!target) return fail("That person isn't a member of this project.");

  const project = await db.project.findUnique({ where: { id: projectId }, select: { slug: true } });
  await db.membership.update({
    where: { projectId_profileId: { projectId, profileId: newOwnerProfileId } },
    data: { isOwner: true },
  });
  revalidatePath(`/p/${project?.slug}`);
  return ok(undefined);
}

// Helper to surface ForbiddenError as a redirect at the page level if needed.
export async function guardMembershipOrRedirect(projectId: string, profileId: string) {
  try {
    await assertProjectMember(projectId, profileId);
    return true;
  } catch (e) {
    if (e instanceof ForbiddenError) return false;
    throw e;
  }
}
