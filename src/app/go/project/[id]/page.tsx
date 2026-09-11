import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { db } from "@/lib/db";

export default async function StableProjectLink({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const project = await db.project.findUnique({ where: { id }, select: { slug: true } });
  if (!project) notFound();
  redirect(`/p/${project.slug}`);
}
