import { z } from "zod";
import { POST_BODY_MAX, POST_MEDIA_MAX } from "@/lib/constants";

// A post is the one piece of user content here with no single required field.
// Text-only, media-only and both are all legitimate; only the empty post is not.
// That makes the rule a cross-field refinement rather than a `min(1)` on `body` —
// putting the minimum on the field itself would reject a perfectly good
// photo-with-no-caption, which is most of what people actually post.
export const createPostSchema = z
  .object({
    body: z.string().trim().max(POST_BODY_MAX, `Keep it under ${POST_BODY_MAX} characters.`).default(""),
    mediaIds: z
      .array(z.string())
      .max(POST_MEDIA_MAX, `Up to ${POST_MEDIA_MAX} photos or videos per post.`)
      .default([]),
  })
  .refine((v) => v.body.length > 0 || v.mediaIds.length > 0, {
    message: "Write something or add a photo or video.",
    path: ["body"],
  });

export type CreatePostInput = z.infer<typeof createPostSchema>;
