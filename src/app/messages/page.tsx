import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { resolveContextLabels, contextLabelKey } from "@/lib/context-label";
import { parseShareSnapshot } from "@/lib/validation/share.schema";
import { shareSummary } from "@/lib/share-display";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";

// The newest message, as one line of preview text. A share card has no body of
// its own, so it is described instead — "You shared @maya" rather than a row that
// looks like the conversation went quiet.
function previewOf(
  newest: { body: string; authorProfileId: string; shareSnapshot: unknown } | undefined,
  viewerProfileId: string
): string | null {
  if (!newest) return null;
  const share = parseShareSnapshot(newest.shareSnapshot);
  if (share) return shareSummary(share, newest.authorProfileId === viewerProfileId);
  return newest.body || null;
}

// A row in the list, which is one of two quite different things.
//
// Threads and project chats are separate models with separate read paths (see
// lib/project-chat-core.ts for why), but they are the same thing to the person
// looking at this page: a conversation that has something new in it. Splitting
// them into two sections would mean the more recent message is sometimes below
// the older one, and the nav badge — which counts both — would lead to a page
// that hides half of what it counted. So they are merged and sorted by activity,
// and the row itself says which kind it is.
type Row = {
  key: string;
  href: string;
  activityAt: number;
  title: string;
  /** The counterpart's handle on a thread row. A team has no single handle. */
  handle: string | null;
  subtitle: string;
  preview: string | null;
  /** Faces for the row: one for a thread, up to three for a team. */
  faces: { id: string; seed: string; assetId: string | null }[];
  extraFaces: number;
};

// The newest visible message in each of the viewer's team chats.
//
// Raw SQL for the same reason /api/nav-counts is: this has to be ONE query
// regardless of how many projects the viewer is on. Prisma's `distinct` is not
// guaranteed to compile to `DISTINCT ON`, and the version of this that resolves
// distinctness in the client would first have to fetch every message of every
// chat — the failure mode being invisible on a seeded database and severe on a
// real one.
//
// The NOT EXISTS is the same block exclusion the transcript applies, spelled the
// same way it is in nav-counts. A preview line is still the blocked person's
// words, and a listing page is a worse place to leak them than a transcript,
// because it is the page you cannot avoid looking at.
type NewestChatRow = {
  chatId: string;
  createdAt: Date;
  body: string;
  authorProfileId: string;
  authorName: string;
};

async function newestVisiblePerChat(
  chatIds: string[],
  viewerProfileId: string
): Promise<Map<string, NewestChatRow>> {
  if (chatIds.length === 0) return new Map();
  const rows = await db.$queryRaw<NewestChatRow[]>`
    SELECT DISTINCT ON (m."chatId")
           m."chatId"          AS "chatId",
           m."createdAt"       AS "createdAt",
           m."body"            AS "body",
           m."authorProfileId" AS "authorProfileId",
           p."name"            AS "authorName"
    FROM "ProjectChatMessage" m
    JOIN "Profile" p ON p."id" = m."authorProfileId"
    WHERE m."chatId" IN (${Prisma.join(chatIds)})
      AND NOT EXISTS (
        SELECT 1 FROM "Block" b
        WHERE (b."blockerProfileId" = ${viewerProfileId} AND b."blockedProfileId" = m."authorProfileId")
           OR (b."blockerProfileId" = m."authorProfileId" AND b."blockedProfileId" = ${viewerProfileId})
      )
    ORDER BY m."chatId", m."createdAt" DESC
  `;
  return new Map(rows.map((r) => [r.chatId, r]));
}

export default async function MessagesPage() {
  const session = await requireSession("/messages");
  if (!session.profileId) redirect("/onboarding");
  const profileId = session.profileId;

  const [memberships, teamMemberships] = await Promise.all([
    db.threadMember.findMany({
      where: { profileId },
      include: {
        thread: {
          include: {
            members: {
              where: { profileId: { not: profileId } },
              include: {
                profile: {
                  select: { handle: true, name: true, avatarSeed: true, avatarAssetId: true },
                },
              },
            },
            messages: {
              orderBy: { createdAt: "desc" },
              take: 1,
              // The share columns ride along because a share message has an EMPTY
              // body — without them the newest message in a thread would render as
              // a blank preview line rather than as what it is.
              select: {
                // createdAt is what the thread ordering below reads.
                createdAt: true,
                body: true,
                authorProfileId: true,
                shareSnapshot: true,
              },
            },
          },
        },
      },
    }),
    // Project chats the viewer is on. Only projects whose chat row EXISTS are
    // listed: the row is created the first time someone opens the chat, so its
    // absence means nobody on the team has ever used it, and listing a silent
    // room for every project you have ever joined would bury the conversations
    // that are actually happening. Until then the way in is the project page.
    db.membership.findMany({
      where: { profileId, project: { chat: { isNot: null } } },
      select: {
        project: {
          select: {
            slug: true,
            name: true,
            chat: { select: { id: true, createdAt: true } },
            memberships: {
              orderBy: { isOwner: "desc" },
              take: 4,
              select: {
                profile: {
                  select: { id: true, avatarSeed: true, avatarAssetId: true },
                },
              },
            },
            _count: { select: { memberships: true } },
          },
        },
      },
    }),
  ]);

  const threads = memberships.map((m) => m.thread);

  // One batched lookup for every thread row's context label, rather than a query
  // per row.
  const labels = await resolveContextLabels(threads);

  const threadRows: Row[] = threads.map((t) => {
    const counterpart = t.members[0]?.profile ?? {
      handle: "unknown",
      name: "Unknown",
      avatarSeed: "x",
      avatarAssetId: null,
    };
    return {
      key: `t:${t.id}`,
      href: `/messages/${t.id}`,
      activityAt: t.messages[0]?.createdAt.getTime() ?? t.createdAt.getTime(),
      title: counterpart.name,
      handle: counterpart.handle,
      subtitle: labels.get(contextLabelKey(t)) ?? "Context",
      preview: previewOf(t.messages[0], profileId),
      faces: [
        {
          id: counterpart.handle,
          seed: counterpart.avatarSeed,
          assetId: counterpart.avatarAssetId,
        },
      ],
      extraFaces: 0,
    };
  });

  const chatIds = teamMemberships
    .map((m) => m.project.chat?.id)
    .filter((id): id is string => !!id);

  const newestByChat = await newestVisiblePerChat(chatIds, profileId);

  const chatRows: Row[] = teamMemberships.flatMap((m) => {
    const chat = m.project.chat;
    if (!chat) return [];
    const newest = newestByChat.get(chat.id);
    const memberCount = m.project._count.memberships;
    const faces = m.project.memberships.slice(0, 3).map((mm) => ({
      id: mm.profile.id,
      seed: mm.profile.avatarSeed,
      assetId: mm.profile.avatarAssetId,
    }));
    return [
      {
        key: `c:${chat.id}`,
        href: `/p/${m.project.slug}/chat`,
        activityAt: newest?.createdAt.getTime() ?? chat.createdAt.getTime(),
        title: m.project.name,
        handle: null,
        subtitle: `Team chat · ${memberCount} ${memberCount === 1 ? "member" : "members"}`,
        // A group preview has to name the speaker; in a room of six, "on it"
        // with no attribution tells you nothing about whether to open it.
        preview: newest
          ? `${newest.authorProfileId === profileId ? "You" : newest.authorName}: ${newest.body}`
          : null,
        faces,
        extraFaces: Math.max(0, memberCount - faces.length),
      },
    ];
  });

  const items = [...threadRows, ...chatRows].sort((a, b) => b.activityAt - a.activityAt);

  return (
    <div>
      <p className="label-mono">[ messages ]</p>
      <h1 className="mt-2 text-xl font-600">Conversations</h1>

      <div className="mt-6">
        {items.length === 0 ? (
          <EmptyState
            title="No conversations yet"
            body="When you accept an intro request — or someone accepts yours — a thread opens here. Every project you're on also has a team chat, reachable from the project."
            action={
              <Link href="/requests" className="mono border border-hairline px-4 py-2 text-xs hover:border-ink">
                View requests
              </Link>
            }
          />
        ) : (
          <ul className="flex flex-col divide-y divide-hairline border border-hairline bg-white">
            {items.map((t) => (
              <li key={t.key}>
                <Link href={t.href} className="flex items-center gap-3 p-3 hover:bg-pine-soft/40">
                  <div className="flex shrink-0 -space-x-1.5">
                    {t.faces.map((f) => (
                      <Avatar key={f.id} seed={f.seed} assetId={f.assetId} size={36} />
                    ))}
                    {t.extraFaces > 0 && (
                      <span className="mono flex h-9 items-center pl-2.5 text-2xs text-ink-muted">
                        +{t.extraFaces}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-600">{t.title}</span>
                      {t.handle && (
                        <span className="mono shrink-0 text-2xs text-ink-muted">@{t.handle}</span>
                      )}
                    </div>
                    <p className="mono text-2xs text-pine">{t.subtitle}</p>
                    {t.preview && (
                      <p className="truncate text-xs text-ink-muted">{t.preview}</p>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
