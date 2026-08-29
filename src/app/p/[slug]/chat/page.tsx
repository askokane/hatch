import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { db } from "@/lib/db";
import { ForbiddenError } from "@/lib/authz";
import {
  PROJECT_CHAT_MESSAGE_SELECT,
  blockedFrom,
  getChatForProject,
  getProjectChatPresence,
  toProjectChatMessageDTO,
  visibleAuthorFilter,
  type ProjectChatMessageDTO,
} from "@/lib/project-chat-core";
import { MESSAGE_PAGE_SIZE } from "@/lib/constants";
import { Avatar } from "@/components/ui/Avatar";
import { ReportDialog } from "@/components/safety/ReportDialog";
import { ProjectChatView, type ChatComposerState } from "@/components/project/ProjectChatView";

// The project's group chat. Everyone on the team is in it; there is nothing to
// join and nothing to be invited to, which is why this page has no membership
// affordance of any kind — the team roster IS the member list, and it is managed
// where it already was, on the project page.
export default async function ProjectChatPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await requireSession();
  if (!session.profileId) redirect("/onboarding");
  const profileId = session.profileId;

  const { slug } = await params;

  const project = await db.project.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, closedAt: true },
  });
  if (!project) notFound();

  // Authorization and lazy creation in one step. A non-member is redirected to
  // the project's public page rather than shown anything — and, because the
  // membership check runs before the upsert, cannot bring a chat row into
  // existence by asking for one.
  let ctx;
  try {
    ctx = await getChatForProject(project.id, profileId);
  } catch (e) {
    if (e instanceof ForbiddenError) redirect(`/p/${project.slug}`);
    throw e;
  }

  // Who this viewer must not be shown, resolved once and applied to the
  // transcript query itself rather than to its result — see blockedFrom().
  const blocked = await blockedFrom(profileId);
  const visible = visibleAuthorFilter(blocked);

  // The transcript is loaded as the newest page plus one probe row, exactly as a
  // thread's is: an unbounded read here would serialize every message the team
  // had ever sent into the RSC payload on every visit.
  const [team, newestFirst] = await Promise.all([
    db.membership.findMany({
      where: { projectId: project.id },
      orderBy: { isOwner: "desc" },
      select: {
        isOwner: true,
        role: true,
        profile: {
          select: { id: true, handle: true, name: true, avatarSeed: true, avatarAssetId: true },
        },
      },
    }),
    db.projectChatMessage.findMany({
      where: { chatId: ctx.chatId, ...visible },
      orderBy: { createdAt: "desc" },
      take: MESSAGE_PAGE_SIZE + 1,
      select: PROJECT_CHAT_MESSAGE_SELECT,
    }),
  ]);

  const hasOlder = newestFirst.length > MESSAGE_PAGE_SIZE;
  const page = (hasOlder ? newestFirst.slice(0, MESSAGE_PAGE_SIZE) : newestFirst).reverse();

  const presence = await getProjectChatPresence(ctx, profileId, blocked);

  const composer: ChatComposerState = ctx.projectClosed
    ? { kind: "PROJECT_CLOSED" }
    : { kind: "OPEN" };

  const initialMessages: ProjectChatMessageDTO[] = page.map(toProjectChatMessageDTO);

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/p/${project.slug}`} className="mono text-2xs text-ink-muted hover:text-ink">
        ← {project.name}
      </Link>

      {/* Pinned team header — the group-chat equivalent of a thread's pinned
          counterpart. The faces are the room. */}
      <div className="mt-3 flex items-center justify-between gap-3 border border-hairline bg-white p-3">
        <div className="min-w-0">
          <p className="text-sm font-600">{project.name}</p>
          <p className="mono text-2xs text-pine">
            team chat · {team.length} {team.length === 1 ? "member" : "members"}
            {project.closedAt && " · closed"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ul className="flex -space-x-1.5">
            {team.slice(0, 5).map((m) => (
              <li key={m.profile.id} title={`${m.profile.name}${m.isOwner ? " · owner" : ""}`}>
                <Avatar seed={m.profile.avatarSeed} assetId={m.profile.avatarAssetId} size={24} />
              </li>
            ))}
            {team.length > 5 && (
              <li className="mono flex h-6 items-center pl-2.5 text-2xs text-ink-muted">
                +{team.length - 5}
              </li>
            )}
          </ul>
          <ReportDialog
            subjectType="PROJECT_CHAT"
            subjectId={ctx.chatId}
            subjectLabel="this team chat"
          />
        </div>
      </div>

      <div className="mt-3">
        <ProjectChatView
          chatId={ctx.chatId}
          myProfileId={profileId}
          initialMessages={initialMessages}
          initialHasOlder={hasOlder}
          initialPresence={presence}
          composer={composer}
        />
      </div>
    </div>
  );
}
