import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { db } from "@/lib/db";
import { HANDLE_IMMUTABLE_DAYS } from "@/lib/constants";
import { OwnProfile } from "@/components/profile/OwnProfile";
import type { ProfileViewData } from "@/components/profile/ProfileView";
import type { ProfileEditInitial } from "@/components/profile/ProfileEditForm";

export default async function OwnProfilePage() {
  const session = await requireSession("/profile");
  if (!session.profileId) redirect("/onboarding");

  const profile = await db.profile.findUnique({
    where: { id: session.profileId },
    include: {
      tags: { include: { tag: { select: { id: true, label: true, kind: true, slug: true } } } },
      intents: true,
    },
  });
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
      <OwnProfile data={data} editInitial={editInitial} />
    </div>
  );
}
