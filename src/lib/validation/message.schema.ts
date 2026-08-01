import { z } from "zod";
import { MESSAGE_MIN, MESSAGE_MAX } from "@/lib/constants";

export const messageSchema = z.object({
  body: z
    .string()
    .trim()
    .min(MESSAGE_MIN, "Write a message.")
    .max(MESSAGE_MAX, `Messages are at most ${MESSAGE_MAX} characters.`),
});

// Mirrors the SubjectType enum in the schema. POST joined it with the feed:
// user-authored media is the one surface here that carries content the platform
// never generated, so a report path on it is a floor, not an extra.
export const reportSchema = z.object({
  subjectType: z.enum(["PROFILE", "PROJECT", "MESSAGE", "THREAD", "POST"]),
  subjectId: z.string().min(1),
  reason: z.string().trim().min(1, "Choose a reason.").max(80),
  detail: z.string().trim().max(1000).optional().default(""),
});

// Derived rather than hand-written, so the action signature and the dialog prop
// cannot drift from what the validator actually accepts.
export type ReportSubjectType = z.infer<typeof reportSchema>["subjectType"];
