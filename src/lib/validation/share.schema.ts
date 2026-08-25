import { z } from "zod";
import { SHARE_BLURB_MAX } from "@/lib/constants";

// The wire + storage contract for share attachments (Message.shareKind /
// shareTargetId / shareSnapshot).
//
// The snapshot is stored as JSON, which Prisma hands back as `unknown`, so it is
// parsed on every read rather than cast. That is not ceremony: rows written by an
// older shape of this feature, or by a hand-edited database, would otherwise
// reach the renderer as a half-populated object and break a transcript that has
// nothing else wrong with it. A row that fails to parse degrades to "no card",
// which the transcript can absorb.

export const shareKindSchema = z.enum(["PROFILE", "PROJECT"]);
export type ShareKind = z.infer<typeof shareKindSchema>;

// `kind` is duplicated here even though Message.shareKind already carries it, so
// the snapshot is a complete, self-describing value: the client narrows on the
// snapshot alone, and nothing has to keep a column and a JSON blob agreeing.
const profileSnapshotSchema = z.object({
  kind: z.literal("PROFILE"),
  handle: z.string().min(1),
  name: z.string().min(1),
  /** "Stanford · '27" — the identity line under the name. */
  subtitle: z.string().default(""),
  /** Skills if they have any, else the opening of their bio. May be empty. */
  blurb: z.string().max(SHARE_BLURB_MAX).default(""),
  avatarSeed: z.string().min(1),
  avatarAssetId: z.string().nullable().default(null),
});

const projectSnapshotSchema = z.object({
  kind: z.literal("PROJECT"),
  slug: z.string().min(1),
  name: z.string().min(1),
  /** "Building · by Maya Chen" */
  subtitle: z.string().default(""),
  blurb: z.string().max(SHARE_BLURB_MAX).default(""),
  /** Frozen with the rest: a card sent before a project closed still reads as it
      did when it was sent, and the project page is the live answer. */
  closed: z.boolean().default(false),
});

export const shareSnapshotSchema = z.discriminatedUnion("kind", [
  profileSnapshotSchema,
  projectSnapshotSchema,
]);

export type ShareSnapshot = z.infer<typeof shareSnapshotSchema>;
export type ProfileShareSnapshot = z.infer<typeof profileSnapshotSchema>;
export type ProjectShareSnapshot = z.infer<typeof projectSnapshotSchema>;

// What the client is allowed to ask to share. Note what is absent: anything
// describing how the card should look. The sender picks a target; the server
// decides what the card says, every time.
export const shareInputSchema = z.object({
  kind: shareKindSchema,
  targetId: z.string().min(1).max(64),
});

// Parses a stored Message.shareSnapshot. Returns null for "this message has no
// usable card" — both for a plain message (null column) and for a malformed one.
export function parseShareSnapshot(raw: unknown): ShareSnapshot | null {
  if (raw == null) return null;
  const parsed = shareSnapshotSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
