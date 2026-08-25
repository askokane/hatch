import { db } from "./db";
import { getBlockState } from "./authz";
import {
  MESSAGE_DTO_SELECT,
  clearTypingAfterSend,
  threadPostingRefusal,
  toMessageDTO,
  type MessageDTO,
} from "./messages-core";
import { shareInputSchema, type ShareSnapshot } from "./validation/share.schema";
import { SHARE_BLURB_MAX, SHARE_CARD_TAGS, SHARE_TARGET_LIMIT, STAGE_LABELS } from "./constants";
import { ok, fail, type ActionResult } from "./action-result";

// Sharing a profile or a project into a thread.
//
// Like messages-core.ts, this lives outside a "use server" module on purpose:
// every export of one of those is a callable endpoint, so a helper there taking
// `profileId` as an argument would let the client name whoever it liked. The
// parameter is safe here because the only way in is a caller that read it off
// the session.
//
// THE SHAPE OF THE FEATURE: the sender picks a target and a thread. Everything
// the card says is composed here, on the server, from the target's own row —
// nothing describing the card crosses the wire inbound. That is what stops a
// share from being a way to put arbitrary text into someone's transcript under
// someone else's name and face.

/** Cuts a blurb to the card's one line, on a word boundary where there is one. */
function toBlurb(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= SHARE_BLURB_MAX) return flat;
  const cut = flat.slice(0, SHARE_BLURB_MAX - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > SHARE_BLURB_MAX * 0.6 ? cut.slice(0, lastSpace) : cut) + "…";
}

// Composes the card for a profile, or returns null when there should not be one.
//
// Null covers two cases the caller must keep indistinguishable: the profile does
// not exist, and the profile's owner has blocked the sharer. Telling those apart
// is exactly the disclosure a block exists to prevent, so they collapse here
// rather than at the call site, where one of them might grow its own wording.
async function buildProfileSnapshot(
  targetId: string,
  senderProfileId: string
): Promise<ShareSnapshot | null> {
  const profile = await db.profile.findUnique({
    where: { id: targetId },
    select: {
      id: true,
      handle: true,
      name: true,
      school: true,
      gradYear: true,
      bio: true,
      avatarSeed: true,
      avatarAssetId: true,
      tags: {
        where: { relation: "HAS" },
        take: SHARE_CARD_TAGS,
        select: { tag: { select: { label: true } } },
      },
    },
  });
  if (!profile) return null;

  // Sharing yourself is the ordinary case ("here's my profile"), and you cannot
  // block yourself, so the check is skipped rather than reasoned about.
  if (profile.id !== senderProfileId) {
    const block = await getBlockState(senderProfileId, profile.id);
    if (block.either) return null;
  }

  const skills = profile.tags.map((t) => t.tag.label);
  return {
    kind: "PROFILE",
    handle: profile.handle,
    name: profile.name,
    // Grad year in the two-digit apostrophe form everyone on the platform already
    // writes; the card has exactly one line for identity.
    subtitle: `${profile.school} · '${String(profile.gradYear).slice(-2)}`,
    // Skills first — on a platform for finding collaborators, what someone can do
    // is what a recipient is deciding on. The bio is the fallback for a profile
    // that has not tagged itself yet.
    blurb: skills.length > 0 ? skills.join(" · ") : toBlurb(profile.bio),
    avatarSeed: profile.avatarSeed,
    avatarAssetId: profile.avatarAssetId,
  };
}

async function buildProjectSnapshot(targetId: string): Promise<ShareSnapshot | null> {
  // UNLISTED projects are shareable here on purpose: unlisted means "kept out of
  // discovery", not "private" — /p/[slug] already renders one for any signed-in
  // viewer who has the link. The whole point of the setting is that the owner
  // passes the project around themselves, and a thread with someone they already
  // accepted an intro from is the most controlled way to do that.
  const project = await db.project.findUnique({
    where: { id: targetId },
    select: {
      slug: true,
      name: true,
      description: true,
      stage: true,
      closedAt: true,
      memberships: {
        where: { isOwner: true },
        take: 1,
        select: { profile: { select: { name: true } } },
      },
    },
  });
  if (!project) return null;

  const owner = project.memberships[0]?.profile.name;
  return {
    kind: "PROJECT",
    slug: project.slug,
    name: project.name,
    subtitle: owner ? `${STAGE_LABELS[project.stage]} · by ${owner}` : STAGE_LABELS[project.stage],
    blurb: toBlurb(project.description),
    closed: !!project.closedAt,
  };
}

// Posts a share card into a thread as a message.
//
// The body is empty: the card IS the message. That is the one case where a
// Message row has no text, and it is why nothing downstream may assume `body` is
// printable — see the thread list, which renders a label for these instead of an
// empty row.
export async function shareToThreadCore(
  threadId: string,
  profileId: string,
  input: { kind: string; targetId: string }
): Promise<ActionResult<MessageDTO>> {
  const parsed = shareInputSchema.safeParse(input);
  if (!parsed.success) return fail("That can't be shared.");

  // The same gate as a typed message, from the same function: membership (throws)
  // and blocks (refuse). A thread that is read-only for text is read-only for
  // cards.
  const refusal = await threadPostingRefusal(threadId, profileId);
  if (refusal) return fail(refusal);

  const snapshot =
    parsed.data.kind === "PROFILE"
      ? await buildProfileSnapshot(parsed.data.targetId, profileId)
      : await buildProjectSnapshot(parsed.data.targetId);

  if (!snapshot) {
    return fail(
      parsed.data.kind === "PROFILE"
        ? "That profile isn't available to share."
        : "That project isn't available to share."
    );
  }

  const message = await db.message.create({
    data: {
      threadId,
      authorProfileId: profileId,
      body: "",
      shareKind: parsed.data.kind,
      shareTargetId: parsed.data.targetId,
      shareSnapshot: snapshot,
    },
    select: MESSAGE_DTO_SELECT,
  });

  await clearTypingAfterSend(threadId, profileId);
  return ok(toMessageDTO(message));
}

// One row of the share sheet: a thread, named by whoever is on the other end.
export type ShareTarget = {
  threadId: string;
  handle: string;
  name: string;
  avatarSeed: string;
  avatarAssetId: string | null;
};

// The threads this profile may share into, most recently active first.
//
// Every one of them exists because an intro request was accepted, so this is
// already a list of people who agreed to hear from this sender. There is no
// "search everyone" step here, and there should not be one.
export async function listShareTargets(profileId: string): Promise<ShareTarget[]> {
  const [memberships, blocks] = await Promise.all([
    db.threadMember.findMany({
      where: { profileId },
      take: SHARE_TARGET_LIMIT,
      select: {
        thread: {
          select: {
            id: true,
            createdAt: true,
            members: {
              where: { profileId: { not: profileId } },
              select: {
                profileId: true,
                profile: {
                  select: { handle: true, name: true, avatarSeed: true, avatarAssetId: true },
                },
              },
            },
            messages: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
          },
        },
      },
    }),
    // One query for every block this profile is party to, rather than a block
    // check per thread. It is a personal blocklist, so the set is small, and this
    // collapses N round trips into one.
    db.block.findMany({
      where: { OR: [{ blockerProfileId: profileId }, { blockedProfileId: profileId }] },
      select: { blockerProfileId: true, blockedProfileId: true },
    }),
  ]);

  const blocked = new Set(
    blocks.map((b) => (b.blockerProfileId === profileId ? b.blockedProfileId : b.blockerProfileId))
  );

  return memberships
    .map((m) => m.thread)
    .filter((t) => {
      const other = t.members[0];
      // Either direction disqualifies. Withholding the thread discloses nothing
      // the sender does not already know: a blocked thread's composer is closed
      // for them too, so its absence here tells them only what the thread itself
      // already told them.
      return !!other && !blocked.has(other.profileId);
    })
    .sort((a, b) => {
      const at = a.messages[0]?.createdAt.getTime() ?? a.createdAt.getTime();
      const bt = b.messages[0]?.createdAt.getTime() ?? b.createdAt.getTime();
      return bt - at;
    })
    .map((t) => {
      const other = t.members[0]!.profile;
      return {
        threadId: t.id,
        handle: other.handle,
        name: other.name,
        avatarSeed: other.avatarSeed,
        avatarAssetId: other.avatarAssetId,
      };
    });
}
