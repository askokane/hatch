import { z } from "zod";
import { BIO_MAX, MIN_SKILL_TAGS, MIN_LEARNING_TAGS, MIN_INTENTS, INTENT_KINDS } from "@/lib/constants";

export const handleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Handle must be at least 3 characters.")
  .max(30, "Handle must be at most 30 characters.")
  .regex(/^[a-z0-9-]+$/, "Handle can only use lowercase letters, numbers, and hyphens.")
  .refine((h) => !h.startsWith("-") && !h.endsWith("-"), "Handle cannot start or end with a hyphen.");

const gradYearSchema = z.coerce
  .number()
  .int()
  .min(2000, "Enter a valid graduation year.")
  .max(2100, "Enter a valid graduation year.");

const linkSchema = z.object({
  label: z.string().trim().min(1).max(40),
  url: z.string().trim().url("Enter a valid URL (including https://)."),
});

const intentSchema = z.object({
  kind: z.enum(INTENT_KINDS),
  note: z.string().trim().max(240).optional().default(""),
});

export const onboardingSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(80),
  handle: handleSchema,
  school: z.string().trim().min(2, "Enter your school.").max(120),
  gradYear: gradYearSchema,
  bio: z.string().trim().max(BIO_MAX).optional().default(""),
  skillTagIds: z.array(z.string()).min(MIN_SKILL_TAGS, `Add at least ${MIN_SKILL_TAGS} skill tags.`),
  learningTagIds: z
    .array(z.string())
    .min(MIN_LEARNING_TAGS, `Add at least ${MIN_LEARNING_TAGS} learning tag.`),
  intents: z.array(intentSchema).min(MIN_INTENTS, `Choose at least ${MIN_INTENTS} intent.`),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(80),
  handle: handleSchema,
  school: z.string().trim().min(2, "Enter your school.").max(120),
  gradYear: gradYearSchema,
  bio: z.string().trim().max(BIO_MAX).optional().default(""),
  links: z.array(linkSchema).max(6, "At most 6 links.").optional().default([]),
  skillTagIds: z.array(z.string()).min(MIN_SKILL_TAGS, `Keep at least ${MIN_SKILL_TAGS} skill tags.`),
  learningTagIds: z.array(z.string()).min(MIN_LEARNING_TAGS, `Keep at least ${MIN_LEARNING_TAGS} learning tag.`),
  intents: z.array(intentSchema).min(MIN_INTENTS, `Keep at least ${MIN_INTENTS} intent.`),
  isDiscoverable: z.boolean().optional().default(true),
});
