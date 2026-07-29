import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { db } from "@/lib/db";
import { getRelationship, noRelationship } from "@/lib/relationship";
import { STAGE_LABELS } from "@/lib/constants";
import { Avatar } from "@/components/ui/Avatar";
import { TagBadge } from "@/components/ui/TagBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { UpdateComposer } from "@/components/project/UpdateComposer";
import { RoleComposer } from "@/components/project/RoleComposer";
import { MemberManager } from "@/components/project/MemberManager";
import { ProjectRoleCard } from "@/components/project/ProjectRoleCard";

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await requireSession();
  if (!session.profileId) redirect("/onboarding");
  const viewerProfileId = session.profileId;

  const { slug } = await params;
  const project = await db.project.findUnique({
    where: { slug },
    include: {
      tags: { include: { tag: { select: { id: true, label: true } } } },
      memberships: {
        include: { profile: { select: { id: true, handle: true, name: true, avatarSeed: true } } },
        orderBy: { isOwner: "desc" },
      },
      updates: {
        include: { author: { select: { handle: true, name: true, avatarSeed: true } } },
        orderBy: { createdAt: "desc" },
      },
      openRoles: {
        include: { tags: { include: { tag: { select: { id: true, label: true } } } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!project) notFound();

  const myMembership = project.memberships.find((m) => m.profile.id === viewerProfileId);
  const isMember = !!myMembership;
  const isOwner = !!myMembership?.isOwner;
  const owner = project.memberships.find((m) => m.isOwner)?.profile;

  const links = Array.isArray(project.links) ? (project.links as { label: string; url: string }[]) : [];

  // Viewer's skill tag IDs, to highlight matched tags on roles.
  const viewerSkills = await db.profileTag.findMany({
    where: { profileId: viewerProfileId, relation: "HAS" },
    select: { tagId: true },
  });
  const viewerSkillSet = new Set(viewerSkills.map((s) => s.tagId));

  // Where the viewer stands with the project owner. Resolved once here and
  // handed to every role card, so the page cannot contradict the owner's
  // profile page or the discovery feed.
  const ownerRelationship = owner
    ? await getRelationship(viewerProfileId, owner.id)
    : null;

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="label-mono">{STAGE_LABELS[project.stage]}</span>
            {project.visibility === "UNLISTED" && (
              <span className="mono text-2xs text-ink-muted">· unlisted</span>
            )}
            {project.closedAt && <span className="mono text-2xs text-brick">· closed</span>}
          </div>
          <h1 className="mt-1 text-2xl font-600">{project.name}</h1>
        </div>
        {isOwner && (
          <Link
            href={`/p/${project.slug}/edit`}
            className="mono border border-hairline px-3 py-1.5 text-xs hover:border-ink"
          >
            Edit project
          </Link>
        )}
      </div>

      <p className="mt-4 max-w-2xl text-sm leading-relaxed">{project.description}</p>

      <div className="mt-3 flex flex-wrap gap-1">
        {project.tags.map((t) => (
          <TagBadge key={t.tag.id} label={t.tag.label} />
        ))}
      </div>

      {links.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-3">
          {links.map((l, i) => (
            <li key={i}>
              <a href={l.url} target="_blank" rel="noreferrer noopener" className="mono text-xs text-pine underline">
                {l.label} ↗
              </a>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8 grid gap-8 md:grid-cols-3">
        <div className="md:col-span-2">
          {/* Async updates feed */}
          <section aria-labelledby="updates-h">
            <div className="flex items-center justify-between">
              <p id="updates-h" className="label-mono">
                [ updates ]
              </p>
            </div>
            {isMember && !project.closedAt && (
              <div className="mt-3">
                <UpdateComposer projectId={project.id} />
              </div>
            )}
            <div className="mt-4 flex flex-col gap-4">
              {project.updates.length === 0 ? (
                <EmptyState
                  title="No updates yet"
                  body="Updates are the project's public changelog — dated notes on what shipped and what's next."
                />
              ) : (
                project.updates.map((u) => (
                  <div key={u.id} className="border-l-2 border-hairline pl-3">
                    <p className="mono text-2xs text-ink-muted">
                      {formatDate(u.createdAt)} · @{u.author.handle}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{u.body}</p>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Open roles */}
          <section aria-labelledby="roles-h" className="mt-10">
            <div className="flex items-center justify-between">
              <p id="roles-h" className="label-mono">
                [ open roles ]
              </p>
              {isOwner && !project.closedAt && <RoleComposer projectId={project.id} />}
            </div>
            <div className="mt-4 flex flex-col gap-3">
              {project.openRoles.filter((r) => r.status !== "CLOSED").length === 0 ? (
                <EmptyState
                  title="No open roles"
                  body={isOwner ? "Post a role to tell builders exactly who you need." : "This project isn't looking for anyone right now."}
                />
              ) : (
                project.openRoles
                  .filter((r) => r.status !== "CLOSED")
                  .map((r) => (
                    <ProjectRoleCard
                      key={r.id}
                      role={{
                        id: r.id,
                        title: r.title,
                        description: r.description,
                        commitment: r.commitment,
                        status: r.status,
                        tags: r.tags.map((t) => ({ id: t.tag.id, label: t.tag.label })),
                      }}
                      ownerProfileId={owner?.id ?? ""}
                      ownerName={owner?.name ?? "the owner"}
                      viewerMatchedTagIds={r.tags.filter((t) => viewerSkillSet.has(t.tag.id)).map((t) => t.tag.id)}
                      relationship={ownerRelationship ?? noRelationship()}
                      projectOpen={!project.closedAt}
                      isMember={isMember}
                      canManage={isOwner}
                    />
                  ))
              )}
            </div>
          </section>
        </div>

        {/* Team sidebar */}
        <aside>
          <p className="label-mono">[ team ]</p>
          <ul className="mt-3 flex flex-col gap-3">
            {project.memberships.map((m) => (
              <li key={m.profile.id}>
                <Link href={`/u/${m.profile.handle}`} className="flex items-center gap-2 hover:underline">
                  <Avatar seed={m.profile.avatarSeed} size={28} />
                  <span className="text-xs">
                    {m.profile.name}
                    <span className="mono block text-2xs text-ink-muted">
                      {m.role}
                      {m.isOwner && " · owner"}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {isOwner && (
            <div className="mt-6">
              <MemberManager
                projectId={project.id}
                members={project.memberships.map((m) => ({
                  profileId: m.profile.id,
                  handle: m.profile.handle,
                  name: m.profile.name,
                  role: m.role,
                  isOwner: m.isOwner,
                }))}
              />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
