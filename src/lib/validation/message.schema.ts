import { z } from "zod";
import { MESSAGE_MIN, MESSAGE_MAX } from "@/lib/constants";

export const messageSchema = z.object({
  body: z
    .string()
    .trim()
    .min(MESSAGE_MIN, "Write a message.")
    .max(MESSAGE_MAX, `Messages are at most ${MESSAGE_MAX} characters.`),
});

export const reportSchema = z.object({
  subjectType: z.enum(["PROFILE", "PROJECT", "MESSAGE", "THREAD"]),
  subjectId: z.string().min(1),
  reason: z.string().trim().min(1, "Choose a reason.").max(80),
  detail: z.string().trim().max(1000).optional().default(""),
});
