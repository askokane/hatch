# HATCH

A builder-serious professional network for college students. Post projects and open roles, get discovered by your skills, and reach people through **context** — every intro references a real open role, project, or intent, so there are no cold DMs.

The **feed** is where the work shows up as it happens: profile posts (with photos and video), project updates from the rooms you can see, and the roles those projects are hiring for — one stream, merged newest-first. Your own posts also live on your profile.

Built as a real full-stack app: real accounts, real login sessions, real persisted messaging. A second person on another browser can sign up, be discovered, receive an intro request, accept it, and hold a conversation that survives a server restart.

## Stack

- **Next.js 15** (App Router, TypeScript) — all mutations are Server Actions
- **Prisma ORM + PostgreSQL** (Supabase in the hosted deployment). The schema was authored to be provider-agnostic — the SQLite→Postgres swap was a datasource + connection-string change only.
- **Tailwind CSS** (no component library)
- **Hand-rolled session auth** — bcrypt (cost 12), SHA-256-hashed session tokens, httpOnly cookies. No Auth.js/Clerk/external auth.
- **zod** for all input validation
- **Playwright** smoke suite
- No paid services, no API keys, no external network calls at runtime.

## Setup (clean checkout)

Requires Node 18+ (developed on Node 22/25) and a PostgreSQL database. Any
Postgres works — a free [Supabase](https://supabase.com) or [Neon](https://neon.tech)
project is easiest. From the provider's dashboard, copy the pooled (transaction,
port 6543) and direct (session, port 5432) connection strings.

```bash
npm install
cp .env.example .env          # then set DATABASE_URL + DIRECT_URL to your Postgres
npx prisma migrate deploy     # applies migrations
npm run seed                  # loads the demo dataset; prints demo credentials
npm run dev                   # http://localhost:3000
```

> On Windows PowerShell, use `copy .env.example .env` instead of `cp`.

Open http://localhost:3000 and log in with a demo account below.

## Demo credentials

The seed prints these at the end. Every seeded user shares the same password.

| Role | Email | Password |
| --- | --- | --- |
| **Primary demo** (populated inbox — 5 pending intro requests + a live thread) | `demo@stateu.edu` | `HatchDemo!2026` |
| **Admin** (can see `/admin/reports`) | `admin@hatchdemo.edu` | `HatchDemo!2026` |
| All 24 seeded users | `<various>@stateu.edu` / `@hatchdemo.edu` | `HatchDemo!2026` |

To see two-way messaging live, log in as `demo@stateu.edu` in one browser and any other seeded user in a second browser (or an incognito window).

### Who can sign up

**Any valid email address.** To run HATCH as a school-only network instead, set
`REQUIRE_EDU_EMAIL=true` — signups are then restricted to `.edu` domains, with
`DEV_EMAIL_ALLOWLIST` (comma-separated emails and/or `@domain`) as a non-production
escape hatch for test accounts.

### Email verification

**There is none.** Accounts are usable the moment they are created — sign up and
you are straight into onboarding.

This was deliberate. With no mail provider in the loop, the verification link had
to be handed to the user by the app itself, so clicking it proved only that you
could read a page the app had just rendered for you — not that you owned the
inbox. It gated intro requests and messaging behind a step that established
nothing. `User.emailVerifiedAt` is still stamped at signup and kept as the hook a
real provider would gate on later.

## npm scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the dev server on :3000 |
| `npm run build` | Production build |
| `npm run start` | Start the production server (after `build`) |
| `npm run seed` | Seed the database with the demo dataset |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:reset` | Reset the dev DB and re-seed (destructive — dev only) |
| `npm run db:studio` | Open Prisma Studio |
| `npm run audit:db` | Read-only check of the database's RLS/grant posture (see Database exposure) |
| `npm run test:e2e:install` | Install the Playwright browser (run once) |
| `npm run test:e2e` | Reset+seed a separate `e2e-test.db`, build, and run the Playwright suite |

## Playwright smoke suite

```bash
npm run test:e2e:install   # once, downloads Chromium
npm run test:e2e
```

> **The suite seeds — i.e. wipes — the database it points at.** `npm run test:e2e`
> therefore routes every step through `scripts/with-e2e-db.mjs`, which rewrites
> `DATABASE_URL`/`DIRECT_URL` to an isolated Postgres schema (`hatch_e2e` by
> default, override with `E2E_SCHEMA`). Your application data lives in `public`
> and is never touched. `e2e/server-control.ts` refuses to start the test server
> if the URL has no explicit schema, so running Playwright bare cannot reach
> production either.

The suite runs on its own server on port **3100**. It covers:

1. **Signup → onboarding → discoverable** — a brand-new account through the real UI.
2. **Session persistence** — login survives reload; logout clears it and re-guards protected routes.
3. **Intro request → accept → two-way messaging → survives restart** — two browser contexts hold a conversation, then the test **kills and restarts the server process** and confirms every message persisted (proving durable storage, not in-memory state).
4. **Constraint enforcement** — a 39-char note and a 6th outbound request are rejected server-side; a duplicate request to the same person is prevented by the UI before it can be attempted.
5. **Authorization** — forced IDs (another user's thread via API and by URL, a non-member project, another user's profile, the admin route) all return 403 or redirect, never data.
6. **No verification gate** — a fresh account sends an intro request immediately; the old `/verify/*` routes are gone, not merely unlinked.
7. **Nav request badge** — shows the exact count, switches to `9+` past the cap, keeps the true figure in the accessible name, and updates on the poll without a reload.
8. **Typing + receipts** — one context types and the *other* sees the indicator; a sent message reads `✓ delivered` until the recipient opens the thread, then flips to `✓✓ seen` with no action from the sender.
9. **Relationship sync** — a connected pair is offered "Message", never "Request intro", on the project page, the profile and the discovery feed; a pending request reads as pending on all of them.
10. **Block asymmetry** — the blocker sees the block and can lift it from settings; the blocked user gets a closed composer, a refusal with no block wording, and none of the disclosing phrasings anywhere on the page.
11. **Feed + posts** — a post with no media, then one with a real PNG whose bytes are fetched back from `/api/media/[id]` and compared byte-for-byte; the post appears both in the feed and on the author's profile, and on their public profile as seen by a second account; all three item types render under their filters; the author deletes their own post; and the upload route refuses a disallowed MIME type and an oversized file, while unauthenticated calls to `/api/media` and `/api/feed` get 401.

## Architecture notes

- **`src/lib/session.ts`** — `createSession` / `getSession` / `requireSession` / `destroySession`. Tokens are 32 random bytes, stored as a SHA-256 hash, delivered as an httpOnly + sameSite=lax cookie with 30-day sliding expiry. Logout deletes the DB row.
- **`src/lib/authz.ts`** — `assertProjectOwner`, `assertProjectMember`, `assertThreadMember`, `isBlockedEitherWay`. Every server action and route handler re-derives ownership/membership from the DB using the caller's own `profileId`; a client-supplied ID is never trusted as proof of access.
- **`src/lib/ranking.ts`** — a single documented pure function scores the discovery open-roles feed (tag overlap 55, same school 20, recency 15, profile completeness 10). Non-discoverable owners and blocked users are excluded in the query (`src/lib/discover-queries.ts`), not in the UI. A comment marks the Postgres GIN-index upgrade path.
- **`src/lib/relationship.ts`** — one answer to "where do I stand with this person?", shared by the profile page, project pages and both discovery feeds. Each surface used to decide locally and partially (the project page only asked "am I a member?"), so a pair who were already messaging still saw a bare "Request intro". `getRelationships` resolves a whole feed in a fixed number of queries. The intro-request *lifecycle* and the *block* state are separate axes because they are not equally disclosable — see below.
- **Blocking is one-directional in what it discloses and bidirectional in what it prevents.** `getBlockState` (`src/lib/authz.ts`) keeps the two directions apart. The blocker is told plainly on the profile, in the thread and in settings, and can lift it there. The blocked user is only ever stopped: the composer closes with "You can't send messages in this conversation", the server's refusal carries no block wording, and nothing on their view names a block. Settings carries the block list because blocking removes the profile from discovery — without it a block would be effectively irreversible.
- **`src/lib/messages-core.ts`** — messaging logic shared by the server action and the route handler. It lives outside `actions/` on purpose: every exported async function in a `"use server"` module is a callable endpoint, so a helper there that takes `profileId` as a parameter lets the client choose whose identity to write under.
- **Typing presence** is an *expiry* (`ThreadMember.typingUntil`), not a boolean: a client that disappears mid-keystroke stops advertising "typing…" on its own, with no reaper job. A keystroke re-claims the window at most once per 2s, and sending or blurring releases it.
- **Read receipts** reuse `ThreadMember.lastReadAt`. The newest own message shows `✓ delivered` until the other member's watermark passes it, then `✓✓ seen` — only the newest, since it implies every message above it.
- **Tags are a table.** Profiles, projects, and roles reference tag IDs only — never free text — so "React" is one row rather than one string per profile. The picker autocompletes against the taxonomy, and input that matches nothing offers to *add* it: `createTagAction` creates the `Tag` on the spot, so the next person to type that skill gets it as a suggestion instead of creating a second copy of it. Creation is idempotent on a normalized slug (`src/lib/catalog-slug.ts`), which is what stops "Rust", "rust" and "RUST " from becoming three tags. `TagSuggestion` survives as the provenance log — raw text as typed, plus the row it produced.
- **Schools are the same pattern, one table over.** `School` is a shared, user-grown catalog behind the type-ahead on onboarding and profile edit. A school enters it as a side effect of someone *saving* a profile that names it (`ensureSchool`), never of typing in a box, so the dropdown is made of schools people actually attend. `Profile.school` stays free text rather than a foreign key — the catalog is a suggestion source, so a school can be renamed or merged without rewriting profiles — but the first writer's spelling becomes canonical and later users adopt it, which is what keeps "MIT" from splitting into three entries.
- **Handles are `[a-z0-9_]`.** An allowlist, not a list of banned symbols, so everything platforms typically reject in a handle (`.`, `@`, `#`, spaces, quotes, emoji, non-ASCII) is excluded by construction. The hyphen is out deliberately: handles share URL space with project and tag slugs, which *do* use hyphens, and one separator meaning two things made `/u/…` ambiguous to read. `src/lib/handle.ts` holds the one definition the zod schema and the client-side wizard check both import. Migration `20260802113000` rewrote every issued handle (`-` → `_`, numeric suffix on the collisions that creates, since `handle` is unique).
- **Messaging** polls `GET /api/threads/[threadId]/messages?after=<cursor>` every 3s while the tab is visible (paused when hidden, with an immediate catch-up tick on refocus), and typing/read presence rides along on that same response rather than adding a second poll. Every nav badge is fed by one `GET /api/nav-counts`, polled every 10s under the same visibility rules. No websockets — a comment marks where an SSE upgrade would slot in. User text renders as plain text (React-escaped; no `dangerouslySetInnerHTML` in the message path).
- **Transcripts are paged.** Opening a thread renders the newest `MESSAGE_PAGE_SIZE` messages; `?before=<cursor>` walks backwards behind a "load earlier messages" control. The whole history is reachable, it is just not re-serialized into the page payload on every visit.
- **Avatars are an uploaded picture over an identicon floor.** Every profile gets a deterministic inline SVG identicon from a seed at creation (`src/lib/avatar.ts`); `Profile.avatarAssetId` overrides it with an uploaded photo when there is one. The seed is never cleared, so removing a picture restores the same pattern the profile started with rather than leaving a hole. One `Avatar` component renders both branches into an identically sized box, which is why call sites pass both and no layout depends on which one is in play. No external image hosts — an uploaded avatar is a `MediaAsset` served by the same session-gated route as post media.
- **The profile picture is a `MediaAsset` with one extra bit.** It reuses the post-media upload validation, byte storage and serving path unchanged; `MediaAsset.isAvatar` is what separates it from a composer upload. Both kinds are `postId`-null, but an avatar is *permanently* so — without the flag it would count against the pending-upload quota and be deleted by the abandoned-upload sweep the first time its owner posted anything. `POST /api/avatar` writes the row and links it in one transaction, so the flag is true from the instant the row exists and there is no window where a fresh picture looks sweepable. Removal is a Server Action (`removeAvatarAction`) rather than a route, because only the *upload* needs a body larger than an action can carry.
- **The feed merges three sources rather than materializing a fourth.** `/feed` shows profile posts, project updates, and open roles interleaved newest-first. Updates and roles are *read* from the tables that already own them (`Update`, `OpenRole`) instead of being copied into a feed table on write, so a project update cannot go stale or diverge from what the project room shows — there is one row, read from two places. `getFeedPage` (`src/lib/feed-queries.ts`) queries the selected sources in one `Promise.all`, each bounded and ordered on `createdAt`, then merges and slices to a page. A single timestamp works as a cursor across all three precisely because all three are ordered on that same field.
- **Feed visibility is a query concern, not a UI one**, exactly as in discovery. Updates and roles belonging to `UNLISTED` projects never enter the result set, and blocked profiles are excluded in both directions via the same `blockedProfileIds` helper discovery uses — one implementation, so a block cannot mean one thing on `/discover` and another on `/feed`.
- **Posts carry optional media, and the bytes live in Postgres** (`MediaAsset.data`, a `bytea`). This is a deliberate consequence of the app's standing constraints rather than a default: no paid services and no API keys rules out object storage, and the hosted target has no writable persistent filesystem, so the database is the only durable store available. `MediaAsset` is written so the upgrade is local — nothing but the serving route reads `data`, so swapping in a storage key changes two functions and no callers.
- **The upload is a route handler, not a Server Action.** Server Actions carry a default 1 MB request body cap, and raising it is a global setting that would apply to every action in the app. `POST /api/media` takes the file, validates it, and returns an id; the post is then created with ids only. The per-file cap is 4 MB because that is where the limit is *real* — a serverless function rejects a larger body before our handler runs, so a bigger limit would work on a laptop and fail in production.
- **Media is validated by allowlist and served back from that same allowlist.** The stored MIME is re-checked against `ALLOWED_IMAGE_MIME`/`ALLOWED_VIDEO_MIME` on the way out and sent with `X-Content-Type-Options: nosniff`, so a row can never cause an arbitrary content type to be served. `GET /api/media/[id]` requires a session (media is not public), supports HTTP `Range` so `<video>` seeking works, and is cached `private, immutable` since an asset id never changes content.
- **An upload is attached, not trusted.** The composer uploads first and posts ids second, so between those two steps an asset exists with no post. `createPostAction` attaches only assets that the caller owns *and* that are still unattached, re-derived from the DB — a borrowed or already-used id is refused rather than silently dropped. Assets stranded by an abandoned composer are capped per profile and swept when that profile's next post lands.

## Database exposure

The app reaches Postgres directly through Prisma as the `postgres` role and does
all authorization in the application layer. That is a coherent design, but it sits
badly with a Supabase default, and the two combined into a live hole that the app
itself could not see:

- Supabase fronts the `public` schema with an auto-generated REST API (PostgREST)
  and grants `anon` and `authenticated` full DML on every table in it.
- Nothing here had row-level security enabled, because nothing here uses RLS.

So anyone holding the project's **anon key** — a *publishable* value, shown in the
dashboard, not a secret — could have called `/rest/v1/User?select=*` and read every
password hash, every `Session.tokenHash` (enough to mint a valid cookie), every
private message and every uploaded file, and could have issued `DELETE` or
`TRUNCATE` against any table. None of it would have touched a line of application
code.

Migration `20260805130000_lock_down_public_api_grants` closes it: RLS on with no
policies (no policy + no bypass = no rows), the `anon`/`authenticated` table,
sequence and function grants revoked, and — the part that is easy to miss — the
**default privileges granted by `postgres`** revoked too, so the next Prisma
migration that adds a table does not silently hand it back. The app is unaffected
because `postgres` owns these tables and has `rolbypassrls`, which
`npm run audit:db` prints first so the claim is checkable rather than asserted.
The line that actually settles it is `anon_can_select` on `User`, `Session`,
`PasswordResetToken`, `Message` and `MediaAsset` — all false.

Migration `20260805150000_revoke_public_schema_usage` then closes the inherited
half. Postgres grants schema `USAGE` to the pseudo-role `PUBLIC`, which every role
inherits, so the targeted `REVOKE ... FROM anon` in the previous migration was a
silent no-op — `has_schema_privilege` kept returning true. Revoking from `PUBLIC`
is what actually removes it, and the migration re-grants `CURRENT_USER`
explicitly so it is also safe on a plain Postgres, where the application would
otherwise have been relying on that same inherited grant. This is defence in
depth rather than a fix for an exploitable gap — USAGE alone confers no data
access, since reading a row also needs a table privilege — but it is the one part
of the lockdown that is structural rather than per-object, so a future table
inherits nothing.

One residual remains, known and verified harmless:
- **`supabase_admin`'s default privileges** on `public` still name `anon`. Clearing
  them needs membership in that role, which `postgres` does not have, so the
  migration's handler logs and carries on. It governs only objects created *by*
  `supabase_admin`; Prisma migrates as `postgres`, whose defaults are clean.

Two things this deliberately does **not** touch: the `storage` and `realtime`
schemas, which are Supabase's own and carry their own RLS; and the `service_role`
grants, which are the equivalent of the database password and secret by design.

If this project ever does adopt the Supabase client libraries, re-grant per-table
alongside real RLS policies — not wholesale back to the default.

**Enabling RLS on a new table is not automatic.** The migration covered the tables
that existed when it ran, and the usual way to automate the rest — an event trigger
on `CREATE TABLE` — needs superuser, which this role does not have. So it is a rule
instead: a migration that adds a table adds
`ALTER TABLE "X" ENABLE ROW LEVEL SECURITY;` in the same file. `npm run audit:db`
exits non-zero if one is missed, along with any `anon` grant or any default
privilege that would re-open the schema, so it is worth running in CI rather than
by hand.

## Uploaded images

- **EXIF is stripped server-side, on every image upload.** Bytes used to be stored
  and served verbatim, so a photo off a phone disclosed the GPS coordinates of
  wherever it was taken to any signed-in member — on a network whose premise is
  strangers meeting to collaborate, with the picture on every screen.
  `src/lib/image-metadata.ts` removes the EXIF/XMP/comment segments from JPEG, PNG
  and WebP with no new dependency. It is a metadata remover, not a re-encoder:
  pixels are never touched. Every parser is bounds-checked and forward-only, and
  bails to the original file rather than emit something corrupt — a file we cannot
  parse is one whose metadata we also cannot locate, and rejecting all such uploads
  would refuse legitimate images to no benefit. GIF is passed through: it has no
  EXIF container, and cameras do not produce GIFs.
- **The client downscales before uploading, and that is the bandwidth fix, not the
  privacy one.** An avatar is drawn at 24–72 px and was shipping at whatever the
  phone produced; a people search renders twenty of them. `lib/image-resize.ts`
  re-encodes to 256 px through a canvas, typically turning megabytes into tens of
  kilobytes. Re-encoding also discards metadata — but as a *side effect*, and it is
  skippable by posting to the route directly, which is exactly why the server pass
  above is what the guarantee rests on.
- **The size cap is checked against the resized copy, not the file you picked.**
  Checking the original would reject an ordinary 4 MB phone photo that downscales
  to about fifty kilobytes. Type is checked up front, since that answer cannot
  change; size is checked after the downscale, where it only trips when resizing
  genuinely could not help.

## Load characteristics

Concurrency here is set by the polled endpoints, not by page renders — a logged-in
client generates traffic whether or not anyone is clicking. The two rules that keep
that affordable:

- **A poll's query count must not depend on the caller's data.** `/api/nav-counts`
  issues exactly two queries regardless of how many threads the viewer is in. It
  previously ran one `COUNT` per thread, so the platform's total load grew with
  users × threads — engagement made it superlinearly more expensive. The unread
  counts are now a single grouped join against the viewer's own `ThreadMember` row,
  covered by `Message(threadId, createdAt, authorProfileId)`.
- **Hidden tabs cost nothing.** Both pollers stop on `visibilitychange` and fire a
  catch-up tick on refocus, so idle background tabs no longer multiply a single
  user's baseline.

Supporting rules applied to the read paths: `getSession` is wrapped in React's
`cache()` so the root layout and the page share one lookup per request; list
surfaces (`/messages`, `/requests`, both discovery feeds) resolve labels and
relationships in a fixed number of batched queries rather than one per row;
transcripts and the role feed are bounded and ordered rather than unbounded or
arbitrary; and the school dropdown's `DISTINCT` over all profiles is cached for an
hour instead of running on every `/discover` render.

Known remaining cost, deliberately unchanged: `hashPassword` uses `bcryptjs`
(pure JS) at cost 12, which is several hundred ms of blocking CPU per login. That
is a deliberate security/latency trade, it only affects auth bursts rather than
steady-state load, and lowering the cost factor is a security decision rather than
a tuning one. Free-text bio search is still an unindexed `ILIKE`; the next lever
there is a `pg_trgm` GIN index, which is worth adding well before six-figure
profile counts but not at this scale.

## Switching to Postgres

1. In `prisma/schema.prisma`, change `datasource db { provider = "postgresql" }`.
2. Set `DATABASE_URL` to your Postgres connection string.
3. `npx prisma migrate dev` (regenerate migrations for Postgres) and `npm run seed`.

All enums and `Json` fields used here map cleanly to native Postgres types; no model changes are required.
