import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { loadProfileByHandle } from "@/lib/profile-queries";
import { db } from "@/lib/db";
import { ProfileView } from "@/components/profile/ProfileView";
import { ProfileActions } from "@/components/profile/ProfileActions";

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

  // Intro contexts owned by this profile that the viewer can reference:
  // open roles on their projects, their public projects, and their intents.
  const [roles, projects, intents] = await Promise.all([
    db.openRole.findMany({
      where: { status: "OPEN", project: { memberships: { some: { profileId: target.id, isOwner: true } } } },
      select: { id: true, title: true, project: { select: { name: true } } },
    }),
    db.project.findMany({
      where: { visibility: "PUBLIC", memberships: { some: { profileId: target.id, isOwner: true } } },
      select: { id: true, name: true },
    }),
    db.intent.findMany({ where: { profileId: target.id }, select: { id: true, kind: true } }),
  ]);

  return (
    <div className="py-2">
      <ProfileView
        data={data}
        isOwn={false}
        actionSlot={
          <ProfileActions
            targetProfileId={target.id}
            targetName={data.name}
            targetHandle={data.handle}
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
