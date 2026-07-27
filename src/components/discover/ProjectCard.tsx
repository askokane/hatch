import Link from "next/link";
import { TagBadge } from "@/components/ui/TagBadge";
import { STAGE_LABELS } from "@/lib/constants";

export function ProjectCard({
  project,
}: {
  project: {
    slug: string;
    name: string;
    description: string;
    stage: string;
    tags: { tag: { id: string; label: string } }[];
    _count: { memberships: number; openRoles: number };
  };
}) {
  return (
    <article className="border border-hairline bg-white p-4">
      <Link href={`/p/${project.slug}`} className="block hover:opacity-90">
        <div className="flex items-center gap-2">
          <span className="label-mono">{STAGE_LABELS[project.stage]}</span>
        </div>
        <h3 className="mt-1 text-lg font-600">{project.name}</h3>
      </Link>
      <p className="mt-2 line-clamp-2 text-sm text-ink-muted">{project.description}</p>
      <div className="mt-3 flex flex-wrap gap-1">
        {project.tags.map((t) => (
          <TagBadge key={t.tag.id} label={t.tag.label} />
        ))}
      </div>
      <div className="mono mt-4 flex gap-4 border-t border-hairline pt-3 text-2xs text-ink-muted">
        <span>{project._count.memberships} members</span>
        <span>
          {project._count.openRoles} open {project._count.openRoles === 1 ? "role" : "roles"}
        </span>
      </div>
    </article>
  );
}
