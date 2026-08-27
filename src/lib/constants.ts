// Shared enums-as-labels and tunable constants used across the app.

export const INTENT_LABELS: Record<string, string> = {
  COFOUNDER: "Co-founder",
  TEAMMATE: "Teammate",
  MENTOR: "Mentor",
  FEEDBACK: "Feedback",
  INTERNSHIP: "Internship",
};

export const INTENT_KINDS = ["COFOUNDER", "TEAMMATE", "MENTOR", "FEEDBACK", "INTERNSHIP"] as const;
export type IntentKindT = (typeof INTENT_KINDS)[number];

export const COMMITMENT_LABELS: Record<string, string> = {
  LIGHT: "Light · 1–3 hrs/wk",
  STEADY: "Steady · 4–8 hrs/wk",
  HEAVY: "Heavy · 8+ hrs/wk",
};

export const STAGE_LABELS: Record<string, string> = {
  IDEA: "Idea",
  BUILDING: "Building",
  LAUNCHED: "Launched",
};

export const ROLE_STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  FILLED: "Filled",
  CLOSED: "Closed",
};

export const TAG_KINDS = ["SKILL", "INTEREST", "DOMAIN"] as const;

// Polling / messaging.
//
// POLL_INTERVAL_MS drives an OPEN thread, where the reader is watching for a
// reply and latency is the whole experience — it stays tight.
//
// NAV_POLL_INTERVAL_MS drives the nav badges, which every logged-in client polls
// from every page. That makes it the app's baseline load per concurrent user, and
// a badge is not worth the same urgency as a live conversation. Both pollers pause
// on a hidden tab and tick immediately on refocus, so a slower interval is
// invisible to someone returning to the tab.
//
// The ceiling here is a product promise, not a guess: the badge is specified to go
// live without a navigation, and e2e/07-nav-request-badge.spec.ts holds that to a
// 15s budget. 10s keeps a comfortable margin inside it while costing a third of
// the request volume the old 3s interval did.
export const POLL_INTERVAL_MS = 3000;
export const NAV_POLL_INTERVAL_MS = 10000;

// Floor on the gap between the END of one poll and the START of the next.
//
// Both pollers schedule themselves rather than running on a fixed interval, so
// a request can never overlap its predecessor. That alone is not quite enough:
// when a response takes longer than its interval, "wait out the remainder"
// computes to zero and the client would poll back-to-back forever. This floor
// is the concession to a slow link — under load each poller settles into a
// steady rhythm instead of consuming every connection it can get, which is what
// let background polling starve the user's own page loads.
export const MIN_POLL_GAP_MS = 1000;

// Nav badges show the exact count up to this value, then "9+".
export const COUNT_BADGE_MAX = 9;

// Typing presence. A keystroke claims the next TYPING_TTL_MS as "typing"; the
// client re-claims no more often than TYPING_PING_THROTTLE_MS. The TTL must
// comfortably exceed both the throttle and the poll interval, or the indicator
// flickers between ticks.
export const TYPING_TTL_MS = 6000;
export const TYPING_PING_THROTTLE_MS = 2000;

// Intro request constraints (enforced server-side)
export const NOTE_MIN = 40;
export const NOTE_MAX = 500;
export const MESSAGE_MIN = 1;
export const MESSAGE_MAX = 2000;
export const MAX_PENDING_OUTBOUND = 5;

// Share cards (a profile or project passed into a thread). The blurb is the one
// free-text line on the card; it is truncated to this rather than wrapped, so a
// card is always the same height whatever it points at and a column of them
// stays scannable.
export const SHARE_BLURB_MAX = 140;
// Skills shown on a shared profile card before the line is truncated.
export const SHARE_CARD_TAGS = 3;
// Threads offered in the share sheet. Everyone you can share with is someone you
// already have an accepted intro with, so this is a small list by construction —
// the cap is a guard against a power user's sheet, not a pager.
export const SHARE_TARGET_LIMIT = 50;

// Profile constraints
export const HANDLE_IMMUTABLE_DAYS = 7;
export const BIO_MAX = 600;
// "Based in" is one line at city/country granularity, not an address — the cap is
// set to fit the longest real "City, Country" with room to spare while making it
// obvious the field is not somewhere to write a paragraph.
export const BASED_IN_MAX = 80;
export const MIN_SKILL_TAGS = 3;
export const MIN_LEARNING_TAGS = 1;
export const MIN_INTENTS = 1;

// Ceilings on what a user may add to the two shared catalogs (School, Tag).
// Anyone can create a row in either, so these are the guard that keeps a
// paste-in from becoming a permanent dropdown entry everyone else has to scroll
// past.
export const SCHOOL_NAME_MIN = 2;
export const SCHOOL_NAME_MAX = 120;
export const TAG_LABEL_MIN = 2;
export const TAG_LABEL_MAX = 40;
// Type-ahead results per dropdown.
export const CATALOG_SUGGESTION_LIMIT = 20;

// Ceiling on the alias scan in searchTagsAction.
//
// Alias matching ("k8s" → Kubernetes) cannot be done in the database: `aliases`
// is a Json array and Prisma cannot search it element-wise, so the rows that
// carry aliases are pulled into memory and filtered there. Only curated rows
// have aliases — createTagAction deliberately writes none — so this scans the
// curated set alone, never the user-grown tail.
//
// It was 500 when the curated set was 99 rows. The catalog expansion added 227,
// taking it to 326, and a bound sized for the old set is the kind of thing that
// stops working silently: past the limit, alias lookups for whichever rows fall
// outside the window simply stop resolving, with no error. 2000 restores a wide
// margin.
//
// This is a stopgap, not a design. If the curated set ever approaches this
// number, the fix is a real TagAlias table with an index — not a bigger constant.
export const TAG_ALIAS_SCAN_MAX = 2000;

// Pagination
export const PAGE_SIZE = 20;

// --- Feed & posts ---

// A post may be text-only, media-only, or both — but never empty. The action
// enforces "body non-empty OR at least one media item", so POST_BODY_MIN is not
// a constant: emptiness is only a failure in the absence of media.
export const POST_BODY_MAX = 1000;
export const POST_MEDIA_MAX = 4;

// Mentions on posts ("@handle").
//
// POST_MENTION_MAX bounds how many people ONE post may name. It is not a
// performance guard — resolution is a single indexed lookup whatever the count —
// it is the ceiling that keeps a post from being a broadcast. You can only
// mention people who accepted an intro from you, so the abuse case is narrow to
// begin with; ten is comfortably past what a real post does and well short of
// "notify everyone I have ever spoken to".
export const POST_MENTION_MAX = 10;
// Rows in the composer's "@" suggestion list. The list is a scan-and-pick, not a
// browser: past about this many the user is faster typing another letter.
export const MENTION_SUGGESTION_LIMIT = 8;

// The feed merges three sources (posts, project updates, open roles) on
// createdAt. Each source is read with its own bounded query and the merged
// result is sliced to FEED_PAGE_SIZE, so one prolific source cannot starve the
// others and no single request is unbounded.
export const FEED_PAGE_SIZE = 20;
// Per-source candidate ceiling. Must be >= FEED_PAGE_SIZE: each source has to be
// able to supply a whole page on its own, or a page whose items all come from
// one source would come back short and end paging early.
export const FEED_SOURCE_CANDIDATES = 40;

// Media limits, enforced server-side in the upload route (a client-side check is
// a courtesy, never the guard).
//
// Both caps are 4 MB, and video is not the larger of the two, which looks wrong
// until you follow where the request actually dies. The binding constraint is
// the deployment target, not this app: a Vercel serverless function rejects a
// request body over ~4.5 MB before the handler ever runs, so a 20 MB video would
// upload fine on `npm run dev` and fail in production with an error we never got
// to write. A limit that only holds on a developer's laptop is worse than a
// smaller one that holds everywhere, so the cap is set where it is real.
//
// This is also the reason a video posted here is a short clip rather than a
// full recording. Lifting it is not a matter of raising these numbers: the
// upload has to stop going through our own origin at all. The route would hand
// the client a presigned URL, the browser would PUT the bytes straight to object
// storage, and MediaAsset would hold a key instead of `data` — at which point
// the per-file ceiling becomes the storage provider's, not the function's.
export const IMAGE_BYTES_MAX = 4 * 1024 * 1024; // 4 MB
export const VIDEO_BYTES_MAX = 4 * 1024 * 1024; // 4 MB

// Profile pictures are held to a tighter cap than post photos, and not to save
// storage. An avatar is displayed at 24–72 px and is fetched on nearly every
// screen — a people search renders twenty of them — so its bytes are paid
// repeatedly in a way a post photo's are not. 1 MB is well above what any
// reasonable photo needs at that size and still keeps a list of avatars cheap.
export const AVATAR_BYTES_MAX = 1024 * 1024; // 1 MB

// MIME allowlist. An allowlist rather than a blocklist, and the served
// Content-Type is echoed from this list rather than from the upload, so a file
// cannot be stored as one type and served as another (e.g. text/html).
export const ALLOWED_IMAGE_MIME = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
export const ALLOWED_VIDEO_MIME = ["video/mp4", "video/webm", "video/quicktime"] as const;

// Uploads sit unattached between "file chosen" and "post created". This caps how
// many a single profile may hold in that state, so an abandoned composer cannot
// accumulate blobs without bound.
export const PENDING_UPLOAD_MAX = 12;

// Thread transcripts load the newest MESSAGE_PAGE_SIZE messages and walk backwards
// from there on demand. Opening a thread used to select its entire history, so a
// long-running conversation grew its own page weight without bound — the whole
// transcript was serialized into the server-rendered payload every visit. Nothing
// is unreachable: ThreadView pages older messages in with the same cursor the
// live tail already uses.
export const MESSAGE_PAGE_SIZE = 50;

// Ceiling on a single live-tail catch-up response. The tail is normally a handful
// of messages, but a client that slept through a long burst must not be handed an
// unbounded array; it re-polls immediately when a page comes back full.
export const MESSAGE_TAIL_MAX = 200;
