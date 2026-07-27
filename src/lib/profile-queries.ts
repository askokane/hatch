import { db } from "./db";
import type { ProfileViewData } from "@/components/profile/ProfileView";

// Loads a profile by handle into the view shape. Returns null if not found.
export async function loadProfileByHandle(handle: string): Promise<ProfileViewData | null> {
  const profile = await db.profile.findUnique({
    where: { handle },
    include: {
      tags: { include: { tag: { select: { id: true, label: true } } } },
      intents: true,
    },
  });
  if (!profile) return null;
  return toViewData(profile);
}

export async function loadProfileById(profileId: string): Promise<ProfileViewData | null> {
  const profile = await db.profile.findUnique({
    where: { id: profileId },
    include: {
      tags: { include: { tag: { select: { id: true, label: true } } } },
      intents: true,
    },
  });
  if (!profile) return null;
  return toViewData(profile);
}

type ProfileWithRelations = {
  handle: string;
  name: string;
  school: string;
  gradYear: number;
  bio: string;
  avatarSeed: string;
  links: unknown;
  isDiscoverable: boolean;
  tags: { relation: string; tag: { id: string; label: string } }[];
  intents: { kind: string; note: string }[];
};

function toViewData(p: ProfileWithRelations): ProfileViewData {
  return {
    handle: p.handle,
    name: p.name,
    school: p.school,
    gradYear: p.gradYear,
    bio: p.bio,
    avatarSeed: p.avatarSeed,
    links: Array.isArray(p.links) ? (p.links as { label: string; url: string }[]) : [],
    isDiscoverable: p.isDiscoverable,
    skills: p.tags.filter((t) => t.relation === "HAS").map((t) => t.tag),
    learning: p.tags.filter((t) => t.relation === "LEARNING").map((t) => t.tag),
    intents: p.intents.map((i) => ({ kind: i.kind, note: i.note })),
  };
}
