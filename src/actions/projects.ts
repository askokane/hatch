"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession, requireProfile } from "@/lib/session";
import { ForbiddenError } from "@/lib/authz";
import {
  createProjectSchema,
  updateProjectSchema,
  postUpdateSchema,
  openRoleSchema,
  inviteMemberSchema,
} from "@/lib/validation/project.schema";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import type { Prisma } from "@prisma/client";
import { consumeRateLimit } from "@/lib/rate-limit";

async function lockProject(tx: Prisma.TransactionClient, projectId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`project:${projectId}`}))`;
}

async function ownerInTransaction(tx: Prisma.TransactionClient, projectId: string, profileId: string) {
  await lockProject(tx, projectId);
  return tx.membership.findFirst({ where: { projectId, profileId, isOwner: true }, select: { id: true } });
}

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
  if (!(await consumeRateLimit("project-create", profileId, 10, 24 * 60 * 60 * 1000))) return fail("Project creation limit reached. Try again later.");

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
  const parsed = updateProjectSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please complete the form.");
  const data = parsed.data;
  const tagIds = await validTagIds(data.tagIds);
  if (tagIds.length < 1) return fail("Add at least one recognized tag.");

  const project = await db.$transaction(async (tx) => {
    if (!(await ownerInTransaction(tx, projectId, profileId))) throw new ForbiddenError();
    const project = await tx.project.findUnique({ where: { id: projectId }, select: { slug: true } });
    await tx.project.update({
      where: { id: projectId },
      data: {
        name: data.name,
        description: data.description,
        stage: data.stage,
        visibility: data.visibility,
        links: data.links,
      },
    });
    await tx.projectTag.deleteMany({ where: { projectId } });
    await tx.projectTag.createMany({ data: tagIds.map((tagId) => ({ projectId, tagId })) });
    return project;
  });

  revalidatePath(`/p/${project?.slug}`);
  return ok(undefined);
}

// Close a project. Owner only.
export async function closeProjectAction(projectId: string): Promise<ActionResult> {
  const session = await requireSession();
  const profileId = await requireProfile(session);
  const project = await db.$transaction(async (tx) => {
    if (!(await ownerInTransaction(tx, projectId, profileId))) throw new ForbiddenError();
    const project = await tx.project.update({ where: { id: projectId }, data: { closedAt: new Date() }, select: { slug: true } });
    await tx.openRole.updateMany({ where: { projectId, status: "OPEN" }, data: { status: "CLOSED" } });
    return project;
  });
  revalidatePath(`/p/${project.slug}`);
  return ok(undefined);
}

// Post an async update. ANY member may post (not just owners). This is the check
// that blocks posting to a project you don't belong to.
export async function postUpdateAction(projectId: string, body: string): Promise<ActionResult> {
  const session = await requireSession();
  const profileId = await requireProfile(session);
  const parsed = postUpdateSchema.safeParse({ body });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Write an update.");

  const project = await db.$transaction(async (tx) => {
    await lockProject(tx, projectId);
    const membership = await tx.membership.findUnique({ where: { projectId_profileId: { projectId, profileId } }, select: { id: true } });
    const project = await tx.project.findUnique({ where: { id: projectId }, select: { slug: true, closedAt: true } });
    if (!membership) throw new ForbiddenError();
    if (!project || project.closedAt) return null;
    await tx.update.create({ data: { projectId, authorProfileId: profileId, body: parsed.data.body } });
    return project;
  });
  if (!project) return fail("This project is closed.");
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
  const parsed = openRoleSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please complete the role.");
  const tagIds = await validTagIds(parsed.data.tagIds);
  if (tagIds.length < 1) return fail("A role needs at least one recognized required tag.");

  const project = await db.$transaction(async (tx) => {
    if (!(await ownerInTransaction(tx, projectId, profileId))) throw new ForbiddenError();
    const project = await tx.project.findUnique({ where: { id: projectId }, select: { slug: true, closedAt: true } });
    if (!project || project.closedAt) return null;
    await tx.openRole.create({ data: {
      projectId,
      title: parsed.data.title,
      description: parsed.data.description,
      commitment: parsed.data.commitment,
      tags: { create: tagIds.map((tagId) => ({ tagId })) },
    } });
    return project;
  });
  if (!project) return fail("This project is closed.");
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
  await db.$transaction(async (tx) => {
    if (!(await ownerInTransaction(tx, role.projectId, profileId))) throw new ForbiddenError();
    await tx.openRole.update({ where: { id: roleId }, data: { status: "CLOSED" } });
  });
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
  const parsed = inviteMemberSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid invite.");

  const invitee = await db.profile.findUnique({
    where: { handle: parsed.data.handle },
    select: { id: true },
  });
  if (!invitee) return fail("No profile with that handle.");

  const result = await db.$transaction(async (tx) => {
    if (!(await ownerInTransaction(tx, projectId, profileId))) throw new ForbiddenError();
    const project = await tx.project.findUnique({ where: { id: projectId }, select: { slug: true, closedAt: true } });
    if (!project || project.closedAt) return { error: "This project is closed." } as const;
    const blocked = await tx.block.findFirst({ where: { OR: [
      { blockerProfileId: profileId, blockedProfileId: invitee.id },
      { blockerProfileId: invitee.id, blockedProfileId: profileId },
    ] }, select: { id: true } });
    if (blocked) return { error: "That person isn't available to invite." } as const;
    const connection = await tx.introRequest.findFirst({ where: { pairKey: [profileId, invitee.id].sort().join(":"), status: "ACCEPTED" }, select: { id: true } });
    if (!connection) return { error: "Connect with this person before inviting them." } as const;
    const existing = await tx.membership.findUnique({ where: { projectId_profileId: { projectId, profileId: invitee.id } } });
    if (existing) return { error: "They're already a member." } as const;
    await tx.membership.create({ data: { projectId, profileId: invitee.id, role: parsed.data.role, isOwner: false } });
    return { slug: project.slug } as const;
  });
  if ("error" in result && result.error) return fail(result.error);
  revalidatePath(`/p/${result.slug}`);
  return ok(undefined);
}

// Remove a member. Owner only; cannot remove the last owner.
export async function removeMemberAction(projectId: string, memberProfileId: string): Promise<ActionResult> {
  const session = await requireSession();
  const profileId = await requireProfile(session);
  const result = await db.$transaction(async (tx) => {
    if (!(await ownerInTransaction(tx, projectId, profileId))) throw new ForbiddenError();
    const target = await tx.membership.findUnique({ where: { projectId_profileId: { projectId, profileId: memberProfileId } } });
    if (!target) return { error: "They're not a member." } as const;
    if (target.isOwner && await tx.membership.count({ where: { projectId, isOwner: true } }) <= 1) {
      return { error: "Transfer ownership before removing the last owner." } as const;
    }
    const project = await tx.project.findUnique({ where: { id: projectId }, select: { slug: true } });
    await tx.membership.delete({ where: { projectId_profileId: { projectId, profileId: memberProfileId } } });
    return { slug: project?.slug } as const;
  });
  if ("error" in result && result.error) return fail(result.error);
  revalidatePath(`/p/${result.slug ?? ""}`);
  return ok(undefined);
}

// Transfer ownership to an existing member. Owner only.
export async function transferOwnershipAction(
  projectId: string,
  newOwnerProfileId: string
): Promise<ActionResult> {
  const session = await requireSession();
  const profileId = await requireProfile(session);
  const result = await db.$transaction(async (tx) => {
    if (!(await ownerInTransaction(tx, projectId, profileId))) throw new ForbiddenError();
    const target = await tx.membership.findUnique({ where: { projectId_profileId: { projectId, profileId: newOwnerProfileId } } });
    if (!target) return null;
    const project = await tx.project.findUnique({ where: { id: projectId }, select: { slug: true } });
    await tx.membership.update({ where: { projectId_profileId: { projectId, profileId: newOwnerProfileId } }, data: { isOwner: true } });
    return project;
  });
  if (!result) return fail("That person isn't a member of this project.");
  revalidatePath(`/p/${result.slug}`);
  return ok(undefined);
}

export async function leaveProjectAction(projectId: string): Promise<ActionResult> {
  const profileId = await requireProfile(await requireSession());
  const result = await db.$transaction(async (tx) => {
    await lockProject(tx, projectId);
    const membership = await tx.membership.findUnique({ where: { projectId_profileId: { projectId, profileId } } });
    if (!membership) return "missing" as const;
    if (membership.isOwner && await tx.membership.count({ where: { projectId, isOwner: true } }) <= 1) return "last-owner" as const;
    await tx.membership.delete({ where: { projectId_profileId: { projectId, profileId } } });
    return "left" as const;
  });
  if (result === "missing") return fail("You're not a member of this project.");
  if (result === "last-owner") return fail("Transfer ownership before leaving this project.");
  revalidatePath("/messages"); revalidatePath("/discover");
  return ok(undefined);
}

// Helper to surface ForbiddenError as a redirect at the page level if needed.
