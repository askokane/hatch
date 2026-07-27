import { z } from "zod";

export const projectStageSchema = z.enum(["IDEA", "BUILDING", "LAUNCHED"]);
export const projectVisibilitySchema = z.enum(["PUBLIC", "UNLISTED"]);
export const commitmentSchema = z.enum(["LIGHT", "STEADY", "HEAVY"]);

const linkSchema = z.object({
  label: z.string().trim().min(1).max(40),
  url: z.string().trim().url("Enter a valid URL (including https://)."),
});

export const createProjectSchema = z.object({
  name: z.string().trim().min(2, "Enter a project name.").max(80),
  description: z.string().trim().min(10, "Add a short description (10+ characters).").max(1200),
  stage: projectStageSchema,
  visibility: projectVisibilitySchema.optional().default("PUBLIC"),
  links: z.array(linkSchema).max(6).optional().default([]),
  tagIds: z.array(z.string()).min(1, "Add at least one tag.").max(10),
});

export const updateProjectSchema = createProjectSchema;

export const postUpdateSchema = z.object({
  body: z.string().trim().min(1, "Write an update.").max(2000),
});

export const openRoleSchema = z.object({
  title: z.string().trim().min(2, "Enter a role title.").max(80),
  description: z.string().trim().min(10, "Describe the role (10+ characters).").max(1000),
  commitment: commitmentSchema,
  tagIds: z.array(z.string()).min(1, "Add at least one required tag.").max(8),
});

export const inviteMemberSchema = z.object({
  handle: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Enter a member handle."),
  role: z.string().trim().min(1, "Enter a role.").max(40),
});
