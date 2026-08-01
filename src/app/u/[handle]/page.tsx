import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { loadProfileByHandle } from "@/lib/profile-queries";
import { getRelationship } from "@/lib/relationship";
import { getFeedPage } from "@/lib/feed-queries";
import { db } from "@/lib/db";
import { ProfileView } from "@/components/profile/ProfileView";
import { ProfileActions } from "@/components/profile/ProfileActions";
import { FeedList } from "@/components/feed/FeedList";

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const session = await requireSession();
  if (!session.profileId) redirect("/onboarding");

  const { handle } = await params;
  const data = await loadProfileByHandle(handle.toLowerCase());
  if (!data) notFound();

  const target = await db.profile.findUnique({
    where: { handle: handle.toLowerCase() },
    select: { id: true },
  });
  if (!target) notFound();

  const isOwn = target.id === session.profileId;
  if (isOwn) redirect("/profile");

  const relationship = await getRelationship(session.profileId, target.id);

  // Intro contexts owned by this profile that the viewer can reference:
  // open roles on their projects, their public projects, and their intents —
  // plus the first page of their posts, batched into the same round trip.
  const [roles, projects, intents, postsPage] = await Promise.all([
    db.openRole.findMany({
      where: { status: "OPEN", project: { memberships: { some: { profileId: target.id, isOwner: true } } } },
      select: { id: true, title: true, project: { select: { name: true } } },
    }),
    db.project.findMany({
      where: { visibility: "PUBLIC", memberships: { some: { profileId: target.id, isOwner: true } } },
      select: { id: true, name: true },
    }),
    db.intent.findMany({ where: { profileId: target.id }, select: { id: true, kind: true } }),
    getFeedPage({
      viewerProfileId: session.profileId,
      filter: "posts",
      authorProfileId: target.id,
    }),
  ]);

  return (
    <div className="py-2">
      <ProfileView
        data={data}
        isOwn={false}
        postsSlot={
          <FeedList
            initialPage={postsPage}
            filter="posts"
            authorHandle={data.handle}
            emptyTitle="No posts yet"
            emptyBody={`${data.name} hasn't posted anything yet. Posts are the running record of what someone is building — when they write one, it shows up here and in the feed.`}
          />
        }
        actionSlot={
          <ProfileActions
            targetProfileId={target.id}
            targetName={data.name}
            targetHandle={data.handle}
            relationship={relationship}
            contexts={{
              roles: roles.map((r) => ({ id: r.id, label: `Role: ${r.title} (${r.project.name})` })),
              projects: projects.map((p) => ({ id: p.id, label: `Project: ${p.name}` })),
              intents: intents.map((i) => ({ id: i.id, label: `Intent: ${i.kind}` })),
            }}
          />
        }
      />
    </div>
  );
}
