import { db } from "./db";
import { blockedProfileIds } from "./discover-queries";
import { FEED_PAGE_SIZE, FEED_SOURCE_CANDIDATES } from "./constants";
import type {
  FeedFilter,
  FeedItem,
  FeedPage,
  PostFeedItem,
  ProjectUpdateFeedItem,
  RoleFeedItemDTO,
} from "./feed-types";

// The feed reads three existing tables — Post, Update and OpenRole — and merges
// them on createdAt. It deliberately does not denormalize them into one "activity"
// table: a project update already lives on the project page and an open role
// already drives discovery, so a copy would be a second thing to keep in sync and
// a second place for a visibility rule to be got wrong.
//
// Visibility rules applied here (never in the UI):
//   - Blocked either way is excluded from every source.
//   - Updates are only surfaced from PUBLIC projects. An update inside an UNLISTED
//     project is visible on the project page to people who have the link; the feed
//     pushes it to everyone, which is a different act. This is the one boundary in
//     this file that leaks real information if it is wrong.
//   - Roles additionally require a discoverable owner, matching
//     getRankedRoleFeed(). A role card is a solicitation to contact its owner, so
//     it follows the same opt-out as the rest of discovery. A post is not a
//     solicitation — it is content the author deliberately published — so posts
//     are NOT gated on isDiscoverable, or hiding from the directory would silently
//     make posting a no-op.
//
// The viewer's own items are included. This is a chronological "what's happening"
// surface rather than a recommendation surface, and seeing your own post land is
// the confirmation that posting worked.

// Selecting MediaAsset.data here would pull the raw bytes of every photo and video
// on the page into memory and then into the server-rendered payload — megabytes
// per card, for content the browser is about to request separately from
// /api/media/[id] anyway. Nothing outside that one route may select `data`.
const MEDIA_SELECT = {
  select: { id: true, kind: true, mimeType: true, fileName: true },
  orderBy: { position: "asc" },
} as const;

const AUTHOR_SELECT = {
  select: { id: true, handle: true, name: true, avatarSeed: true, avatarAssetId: true },
} as const;

type AuthorRow = {
  id: string;
  handle: string;
  name: string;
  avatarSeed: string;
  avatarAssetId: string | null;
};

function toAuthor(p: AuthorRow) {
  return {
    profileId: p.id,
    handle: p.handle,
    name: p.name,
    avatarSeed: p.avatarSeed,
    avatarAssetId: p.avatarAssetId,
  };
}

/** Which sources a filter draws from. An author scope forces posts-only. */
function sourcesFor(filter: FeedFilter, scopedToAuthor: boolean) {
  if (scopedToAuthor) return { posts: true, updates: false, roles: false };
  return {
    posts: filter === "all" || filter === "posts",
    updates: filter === "all" || filter === "updates",
    roles: filter === "all" || filter === "roles",
  };
}

export async function getFeedPage(args: {
  viewerProfileId: string;
  filter: FeedFilter;
  before?: string | null;
  authorProfileId?: string | null;
}): Promise<FeedPage> {
  const { viewerProfileId, filter, authorProfileId } = args;

  // A malformed cursor must not silently become `undefined` and widen the query to
  // the newest page forever — the caller (the route) validates the string, and this
  // second check keeps a direct server-side caller honest too.
  const beforeDate = args.before ? new Date(args.before) : null;
  const cursor = beforeDate && !Number.isNaN(beforeDate.getTime()) ? beforeDate : null;
  const olderThan = cursor ? { createdAt: { lt: cursor } } : {};

  const scopedToAuthor = !!authorProfileId;
  const want = sourcesFor(filter, scopedToAuthor);

  const blocked = await blockedProfileIds(viewerProfileId);
  const notBlocked = { id: { notIn: [...blocked] } };

  const [postRows, updateRows, roleRows] = await Promise.all([
    want.posts
      ? db.post.findMany({
          where: {
            ...olderThan,
            // The block exclusion applies to the author-scoped read too: a
            // profile page stays reachable by handle after a block, so without
            // this the blocked pair could still read each other's posts there.
            ...(authorProfileId ? { authorProfileId } : {}),
            author: notBlocked,
          },
          select: {
            id: true,
            body: true,
            createdAt: true,
            authorProfileId: true,
            author: AUTHOR_SELECT,
            media: MEDIA_SELECT,
          },
          orderBy: { createdAt: "desc" },
          take: FEED_SOURCE_CANDIDATES,
        })
      : Promise.resolve([]),

    want.updates
      ? db.update.findMany({
          where: {
            ...olderThan,
            author: notBlocked,
            project: { visibility: "PUBLIC" },
          },
          select: {
            id: true,
            body: true,
            createdAt: true,
            author: AUTHOR_SELECT,
            project: { select: { slug: true, name: true, stage: true } },
          },
          orderBy: { createdAt: "desc" },
          take: FEED_SOURCE_CANDIDATES,
        })
      : Promise.resolve([]),

    want.roles
      ? db.openRole.findMany({
          where: {
            ...olderThan,
            status: "OPEN",
            project: {
              visibility: "PUBLIC",
              closedAt: null,
              memberships: {
                some: {
                  isOwner: true,
                  profile: {
                    ...notBlocked,
                    // Own roles stay visible even if the viewer has hidden
                    // themselves from discovery.
                    OR: [{ isDiscoverable: true }, { id: viewerProfileId }],
                  },
                },
              },
            },
          },
          select: {
            id: true,
            title: true,
            description: true,
            commitment: true,
            createdAt: true,
            tags: { select: { tag: { select: { id: true, label: true } } } },
            project: {
              select: {
                slug: true,
                name: true,
                stage: true,
                memberships: {
                  where: { isOwner: true },
                  select: { profile: AUTHOR_SELECT },
                  take: 1,
                },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: FEED_SOURCE_CANDIDATES,
        })
      : Promise.resolve([]),
  ]);

  const merged: FeedItem[] = [];

  for (const p of postRows) {
    const item: PostFeedItem = {
      kind: "POST",
      id: p.id,
      createdAt: p.createdAt.toISOString(),
      author: toAuthor(p.author),
      body: p.body,
      media: p.media.map((m) => ({
        id: m.id,
        kind: m.kind,
        mimeType: m.mimeType,
        fileName: m.fileName,
      })),
      isOwn: p.authorProfileId === viewerProfileId,
    };
    merged.push(item);
  }

  for (const u of updateRows) {
    const item: ProjectUpdateFeedItem = {
      kind: "PROJECT_UPDATE",
      id: u.id,
      createdAt: u.createdAt.toISOString(),
      author: toAuthor(u.author),
      body: u.body,
      project: u.project,
    };
    merged.push(item);
  }

  for (const r of roleRows) {
    const owner = r.project.memberships[0]?.profile;
    // A project with no owner row cannot happen through the app (creation makes
    // one in the same transaction), but the feed refuses to render a role with
    // nobody to contact rather than inventing a placeholder.
    if (!owner) continue;
    const item: RoleFeedItemDTO = {
      kind: "ROLE",
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      project: { slug: r.project.slug, name: r.project.name, stage: r.project.stage },
      owner: toAuthor(owner),
      role: {
        title: r.title,
        description: r.description,
        commitment: r.commitment,
        tags: r.tags.map((t) => ({ id: t.tag.id, label: t.tag.label })),
      },
    };
    merged.push(item);
  }

  merged.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));

  // --- Paging ---
  //
  // Why one timestamp works as a cursor across three tables: every source is read
  // with the SAME ordering key, so "everything newer than X" is a well-defined set
  // spanning all of them. Nothing can be skipped, either: the cursor is the oldest
  // item on the page, and any row newer than it is by definition within the top
  // FEED_PAGE_SIZE of the merged set — which is far inside each source's
  // FEED_SOURCE_CANDIDATES window, so it was certainly fetched and certainly sorted
  // into this page.
  //
  // The one hazard is a tie. The next request uses a strict `<`, so any row sharing
  // the cursor's exact millisecond but falling below the slice would be skipped
  // forever. Rather than switch to `<=` and dedupe (which cannot terminate if a
  // whole page shares one timestamp), the page is extended to the end of the tie,
  // so the cut always lands on a timestamp boundary and `<` is exact.
  let end = Math.min(FEED_PAGE_SIZE, merged.length);
  if (end < merged.length) {
    const boundary = merged[end - 1]!.createdAt;
    while (end < merged.length && merged[end]!.createdAt === boundary) end++;
  }
  const items = merged.slice(0, end);

  // Only when every queried source came back short is `merged` known to hold all
  // remaining rows; if it also fit entirely on this page, there is nothing after it.
  const queried = [
    want.posts ? postRows.length : null,
    want.updates ? updateRows.length : null,
    want.roles ? roleRows.length : null,
  ].filter((n): n is number => n !== null);
  const everySourceShort = queried.every((n) => n < FEED_SOURCE_CANDIDATES);
  const exhausted = everySourceShort && items.length === merged.length;

  return {
    items,
    nextCursor: exhausted || items.length === 0 ? null : items[items.length - 1]!.createdAt,
  };
}
