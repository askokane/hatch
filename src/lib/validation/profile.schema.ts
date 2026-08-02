import { z } from "zod";
import {
  BIO_MAX,
  BASED_IN_MAX,
  SCHOOL_NAME_MIN,
  SCHOOL_NAME_MAX,
  MIN_SKILL_TAGS,
  MIN_LEARNING_TAGS,
  MIN_INTENTS,
  INTENT_KINDS,
} from "@/lib/constants";
import { HANDLE_CHARSET_MESSAGE, HANDLE_PATTERN } from "@/lib/handle";

export const handleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Handle must be at least 3 characters.")
  .max(30, "Handle must be at most 30 characters.")
  .regex(HANDLE_PATTERN, HANDLE_CHARSET_MESSAGE)
  .refine(
    (h) => !h.startsWith("_") && !h.endsWith("_"),
    "Handle cannot start or end with an underscore."
  );

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

// "City, Country" by convention, but not parsed or enforced as such — a single
// free-text line keeps "London" and "São Paulo, Brazil" both expressible without
// a country dropdown that would need maintaining.
const basedInSchema = z.string().trim().max(BASED_IN_MAX).optional().default("");

export const onboardingSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(80),
  handle: handleSchema,
  school: z
    .string()
    .trim()
    .min(SCHOOL_NAME_MIN, "Enter your school.")
    .max(SCHOOL_NAME_MAX),
  gradYear: gradYearSchema,
  basedIn: basedInSchema,
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
  school: z
    .string()
    .trim()
    .min(SCHOOL_NAME_MIN, "Enter your school.")
    .max(SCHOOL_NAME_MAX),
  gradYear: gradYearSchema,
  basedIn: basedInSchema,
  bio: z.string().trim().max(BIO_MAX).optional().default(""),
  links: z.array(linkSchema).max(6, "At most 6 links.").optional().default([]),
  skillTagIds: z.array(z.string()).min(MIN_SKILL_TAGS, `Keep at least ${MIN_SKILL_TAGS} skill tags.`),
  learningTagIds: z.array(z.string()).min(MIN_LEARNING_TAGS, `Keep at least ${MIN_LEARNING_TAGS} learning tag.`),
  intents: z.array(intentSchema).min(MIN_INTENTS, `Keep at least ${MIN_INTENTS} intent.`),
  isDiscoverable: z.boolean().optional().default(true),
});
