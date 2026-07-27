import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { db } from "@/lib/db";
import { ProjectForm } from "@/components/project/ProjectForm";
import { CloseProjectButton } from "@/components/project/CloseProjectButton";

export default async function EditProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await requireSession();
  if (!session.profileId) redirect("/onboarding");

  const { slug } = await params;
  const project = await db.project.findUnique({
    where: { slug },
    include: {
      tags: { include: { tag: { select: { id: true, label: true, slug: true, kind: true } } } },
      memberships: { where: { profileId: session.profileId }, select: { isOwner: true } },
    },
  });
  if (!project) notFound();

  // Owner-only page.
  const isOwner = project.memberships[0]?.isOwner === true;
  if (!isOwner) redirect(`/p/${slug}`);

  const links = Array.isArray(project.links) ? (project.links as { label: string; url: string }[]) : [];

  return (
    <div className="mx-auto max-w-xl py-2">
      <p className="label-mono">[ edit project ]</p>
      <h1 className="mt-2 text-xl font-600">{project.name}</h1>
      <div className="mt-6">
        <ProjectForm
          mode="edit"
          projectId={project.id}
          slug={project.slug}
          initial={{
            name: project.name,
            description: project.description,
            stage: project.stage,
            visibility: project.visibility,
            links,
            tags: project.tags.map((t) => ({ id: t.tag.id, label: t.tag.label, slug: t.tag.slug, kind: t.tag.kind })),
          }}
        />
      </div>

      {!project.closedAt && (
        <div className="mt-10 border-t border-hairline pt-6">
          <p className="label-mono text-brick">[ close project ]</p>
          <p className="mt-1 text-xs text-ink-muted">
            Closing hides it from discovery and stops new intro requests. This can&apos;t be undone from the UI.
          </p>
          <div className="mt-3">
            <CloseProjectButton projectId={project.id} slug={project.slug} />
          </div>
        </div>
      )}
    </div>
  );
}
