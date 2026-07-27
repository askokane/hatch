import { z } from "zod";
import { NOTE_MIN, NOTE_MAX } from "@/lib/constants";

export const introRequestSchema = z.object({
  toProfileId: z.string().min(1),
  contextType: z.enum(["ROLE", "PROJECT", "INTENT"]),
  contextId: z.string().min(1),
  note: z
    .string()
    .trim()
    .min(NOTE_MIN, `Your note must be at least ${NOTE_MIN} characters.`)
    .max(NOTE_MAX, `Your note must be at most ${NOTE_MAX} characters.`),
});
