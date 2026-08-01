// The feed's wire contract, shared by the server queries (lib/feed-queries.ts),
// the paging route (/api/feed) and the client renderers (components/feed/*).
//
// It lives in its own module, apart from the queries, for two reasons: client
// components must be able to import the types without pulling the Prisma client
// into a client bundle, and the same shapes are serialized over /api/feed, so
// they have to be JSON-safe. Every field is a primitive or a plain object, and
// timestamps are ISO strings rather than Date objects — a Date survives the
// server-component boundary but not `JSON.parse`, and the feed crosses both.

export type FeedAuthor = {
  profileId: string;
  handle: string;
  name: string;
  avatarSeed: string;
};

export type FeedMedia = {
  id: string;
  kind: "IMAGE" | "VIDEO";
  mimeType: string;
  /** Original filename, used for the image's alt text fallback. May be "". */
  fileName: string;
};

export type FeedProject = {
  slug: string;
  name: string;
  stage: string;
};

/** A profile post. `body` may be "" only when `media` is non-empty. */
export type PostFeedItem = {
  kind: "POST";
  /** Unique within its own source. Use `feedKey()` for a cross-source React key. */
  id: string;
  createdAt: string;
  author: FeedAuthor;
  body: string;
  media: FeedMedia[];
  /** True when the viewer authored it — gates the delete control. */
  isOwn: boolean;
};

/** An update posted inside a project room, surfaced to the public feed. */
export type ProjectUpdateFeedItem = {
  kind: "PROJECT_UPDATE";
  id: string;
  createdAt: string;
  author: FeedAuthor;
  body: string;
  project: FeedProject;
};

/** An open role on a public project — the feed's "opportunity" item. */
export type RoleFeedItemDTO = {
  kind: "ROLE";
  id: string;
  createdAt: string;
  project: FeedProject;
  /** The project owner, i.e. who an intro request would go to. */
  owner: FeedAuthor;
  role: {
    title: string;
    description: string;
    commitment: string;
    tags: { id: string; label: string }[];
  };
};

export type FeedItem = PostFeedItem | ProjectUpdateFeedItem | RoleFeedItemDTO;

/** Which sources a feed request draws from. "all" is the default surface. */
export const FEED_FILTERS = ["all", "posts", "updates", "roles"] as const;
export type FeedFilter = (typeof FEED_FILTERS)[number];

export function isFeedFilter(v: string | undefined): v is FeedFilter {
  return !!v && (FEED_FILTERS as readonly string[]).includes(v);
}

export type FeedPage = {
  items: FeedItem[];
  /**
   * ISO timestamp to pass as `?before=` for the next page, or null at the end.
   * The cursor is the oldest returned item's createdAt — a plain timestamp works
   * as a merge cursor across all three sources precisely because they are merged
   * on that one field.
   */
  nextCursor: string | null;
};

/**
 * React key for a merged list. Ids are unique per source table but two sources
 * could in principle collide, so the kind is part of the key.
 */
export function feedKey(item: FeedItem): string {
  return `${item.kind}:${item.id}`;
}

/** Path that serves an asset's bytes. Single source of truth for media URLs. */
export function mediaUrl(assetId: string): string {
  return `/api/media/${assetId}`;
}
