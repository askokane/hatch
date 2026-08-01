import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { db } from "@/lib/db";
import { HANDLE_IMMUTABLE_DAYS } from "@/lib/constants";
import { getFeedPage } from "@/lib/feed-queries";
import { OwnProfile } from "@/components/profile/OwnProfile";
import type { ProfileViewData } from "@/components/profile/ProfileView";
import type { ProfileEditInitial } from "@/components/profile/ProfileEditForm";
import { FeedList } from "@/components/feed/FeedList";
import { PostComposer } from "@/components/feed/PostComposer";

export default async function OwnProfilePage() {
  const session = await requireSession("/profile");
  if (!session.profileId) redirect("/onboarding");

  // Both reads key off the session's profileId, so neither waits on the other.
  const [profile, postsPage] = await Promise.all([
    db.profile.findUnique({
      where: { id: session.profileId },
      include: {
        tags: { include: { tag: { select: { id: true, label: true, kind: true, slug: true } } } },
        intents: true,
      },
    }),
    getFeedPage({
      viewerProfileId: session.profileId,
      filter: "posts",
      authorProfileId: session.profileId,
    }),
  ]);
  if (!profile) redirect("/onboarding");

  const skills = profile.tags
    .filter((t) => t.relation === "HAS")
    .map((t) => ({ id: t.tag.id, label: t.tag.label, slug: t.tag.slug, kind: t.tag.kind }));
  const learning = profile.tags
    .filter((t) => t.relation === "LEARNING")
    .map((t) => ({ id: t.tag.id, label: t.tag.label, slug: t.tag.slug, kind: t.tag.kind }));
  const links = Array.isArray(profile.links)
    ? (profile.links as { label: string; url: string }[])
    : [];
  const intents = profile.intents.map((i) => ({ kind: i.kind, note: i.note }));

  const data: ProfileViewData = {
    handle: profile.handle,
    name: profile.name,
    school: profile.school,
    gradYear: profile.gradYear,
    bio: profile.bio,
    avatarSeed: profile.avatarSeed,
    links,
    skills: skills.map((s) => ({ id: s.id, label: s.label })),
    learning: learning.map((s) => ({ id: s.id, label: s.label })),
    intents,
    isDiscoverable: profile.isDiscoverable,
  };

  const handleLocked =
    Date.now() - profile.handleChangedAt.getTime() > HANDLE_IMMUTABLE_DAYS * 24 * 60 * 60 * 1000;

  const editInitial: ProfileEditInitial = {
    name: profile.name,
    handle: profile.handle,
    school: profile.school,
    gradYear: profile.gradYear,
    bio: profile.bio,
    links,
    skills,
    learning,
    intents,
    isDiscoverable: profile.isDiscoverable,
    handleLocked,
  };

  return (
    <div className="py-2">
      <OwnProfile
        data={data}
        editInitial={editInitial}
        postsSlot={
          <>
            <PostComposer avatarSeed={profile.avatarSeed} />
            <div className="mt-6">
              <FeedList
                initialPage={postsPage}
                filter="posts"
                authorHandle={profile.handle}
                emptyTitle="You haven't posted yet"
                emptyBody="Posts are the running record of what you're building — what shipped, what broke, what you're stuck on. Write one above and it shows up here and in everyone's feed."
              />
            </div>
          </>
        }
      />
    </div>
  );
}
