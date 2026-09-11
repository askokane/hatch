import { notFound, redirect } from "next/navigation";
import { requireSession, requireProfile } from "@/lib/session";
import { db } from "@/lib/db";
import { isBlockedEitherWay } from "@/lib/authz";

export default async function StableProfileLink({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireProfile(await requireSession());
  const { id } = await params;
  const profile = await db.profile.findUnique({ where: { id }, select: { handle: true } });
  if (!profile || (id !== viewer && await isBlockedEitherWay(viewer, id))) notFound();
  redirect(`/u/${profile.handle}`);
}
