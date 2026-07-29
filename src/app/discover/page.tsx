import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { db } from "@/lib/db";
import { getProfileCompleteness } from "@/lib/profile-complete";
import {
  getRankedRoleFeed,
  getPeople,
  getProjects,
} from "@/lib/discover-queries";
import { getRelationships, noRelationship } from "@/lib/relationship";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { RoleFeedCard } from "@/components/discover/RoleFeedCard";
import { PeopleCard } from "@/components/discover/PeopleCard";
import { ProjectCard } from "@/components/discover/ProjectCard";
import { PeopleFilterBar, ProjectFilterBar } from "@/components/discover/FilterBar";
import Link from "next/link";

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireSession("/discover");
  if (!session.profileId) redirect("/onboarding");

  // Cannot reach discovery with an empty profile.
  const completeness = await getProfileCompleteness(session.profileId);
  if (!completeness.isComplete) redirect("/onboarding");

  const sp = await searchParams;
  const tab = sp.tab ?? "roles";

  const profile = await db.profile.findUnique({
    where: { id: session.profileId },
    include: { tags: { where: { relation: "HAS" }, select: { tagId: true } } },
  });
  if (!profile) redirect("/onboarding");

  const schools = (
    await db.profile.findMany({
      where: { isDiscoverable: true },
      distinct: ["school"],
      select: { school: true },
      orderBy: { school: "asc" },
    })
  ).map((s) => s.school);

  const tabs = [
    { value: "roles", label: "open roles" },
    { value: "people", label: "people" },
    { value: "projects", label: "projects" },
  ];

  return (
    <div>
      <p className="label-mono">[ discover ]</p>
      <div className="flex items-center justify-between gap-4">
        <h1 className="mt-2 text-xl font-600">
          {tab === "roles" && "Open roles, ranked to your skills"}
          {tab === "people" && "People"}
          {tab === "projects" && "Projects"}
        </h1>
        <Link
          href="/projects/new"
          className="mono shrink-0 border border-pine bg-pine px-3 py-1.5 text-xs text-paper hover:bg-[#255c41]"
        >
          + new project
        </Link>
      </div>

      <div className="mt-4">
        <Tabs tabs={tabs} active={tab} basePath="/discover" />
      </div>

      <div className="mt-6">
        {tab === "roles" && (
          <RolesTab
            viewer={{
              profileId: session.profileId,
              school: profile.school,
              skillTagIds: profile.tags.map((t) => t.tagId),
            }}
          />
        )}
        {tab === "people" && <PeopleTab viewerId={session.profileId} filters={sp} schools={schools} />}
        {tab === "projects" && <ProjectsTab viewerId={session.profileId} filters={sp} />}
      </div>
    </div>
  );
}

async function RolesTab({
  viewer,
}: {
  viewer: { profileId: string; school: string; skillTagIds: string[] };
}) {
  const feed = await getRankedRoleFeed(viewer);
  if (feed.length === 0) {
    return (
      <EmptyState
        title="No open roles yet"
        body="When builders post roles that match your skills, they'll show up here — ranked by how well your tags overlap."
      />
    );
  }
  // One batched lookup for the whole feed rather than one per card.
  const relationships = await getRelationships(
    viewer.profileId,
    feed.map((item) => item.owner.id)
  );
  return (
    <div className="flex flex-col gap-3">
      {feed.map((item) => (
        <RoleFeedCard
          key={item.role.id}
          item={item}
          relationship={relationships.get(item.owner.id) ?? noRelationship(item.owner.id)}
        />
      ))}
    </div>
  );
}

async function PeopleTab({
  viewerId,
  filters,
  schools,
}: {
  viewerId: string;
  filters: Record<string, string | undefined>;
  schools: string[];
}) {
  const people = await getPeople(
    { profileId: viewerId },
    {
      q: filters.q,
      school: filters.school,
      gradYear: filters.gradYear ? Number(filters.gradYear) : undefined,
      intent: filters.intent,
    }
  );
  const relationships = await getRelationships(
    viewerId,
    people.map((p) => p.id)
  );
  return (
    <div className="flex flex-col gap-4">
      <PeopleFilterBar schools={schools} />
      {people.length === 0 ? (
        <EmptyState
          title="No people match those filters"
          body="Try clearing a filter or searching a different skill or interest in bios."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {people.map((p) => (
            <PeopleCard
              key={p.id}
              relationship={relationships.get(p.id) ?? noRelationship(p.id)}
              person={{
                handle: p.handle,
                name: p.name,
                school: p.school,
                gradYear: p.gradYear,
                bio: p.bio,
                avatarSeed: p.avatarSeed,
                tags: p.tags.map((t) => ({ relation: t.relation, tag: t.tag })),
                intents: p.intents,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

async function ProjectsTab({
  viewerId,
  filters,
}: {
  viewerId: string;
  filters: Record<string, string | undefined>;
}) {
  const projects = await getProjects({ profileId: viewerId }, { stage: filters.stage, tagId: filters.tagId });
  return (
    <div className="flex flex-col gap-4">
      <ProjectFilterBar />
      {projects.length === 0 ? (
        <EmptyState
          title="No projects match"
          body="Try a different stage, or check back as new project rooms open up."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={{
                slug: p.slug,
                name: p.name,
                description: p.description,
                stage: p.stage,
                tags: p.tags.map((t) => ({ tag: t.tag })),
                _count: p._count,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
