# HATCH — Version History

Every commit on `main`, numbered `v0.0` upward in chronological order. The repo
carries no git tags and no GitHub issues or PRs, so the "issues resolved"
sections below are drawn from what each commit states it fixed.

| Version | Commit | Date | Title |
| --- | --- | --- | --- |
| [v0.0](#v00--initial-platform) | `b6eb120` | 2026-07-27 | Build HATCH: full-stack student networking platform |
| [v0.1](#v01--postgresql-migration) | `8fe9df4` | 2026-07-27 | Switch to PostgreSQL for hosted deployment |
| [v0.2](#v02--gitignore-cleanup) | `2dc3c73` | 2026-07-27 | Ignore .vercel; tidy gitignore |
| [v0.3](#v03--open-registration) | `2e67535` | 2026-07-27 | Open registration to any email; make verification completable without mail |
| [v0.4](#v04--messaging-depth-and-safety) | `c8de011` | 2026-07-29 | Fix six reported bugs; add typing, receipts and relationship sync |
| [v0.5](#v05--feed-nav-and-connection-pooling) | `017dbd8` | 2026-08-02 | Add feed, restructure nav, and fix database pooling |
| [v0.6](#v06--handles-and-user-grown-catalogs) | `709d651` | 2026-08-02 | Underscore handles, user-grown school/skill catalogs, based-in field |

---

## v0.0 — Initial platform

**Commit** `b6eb120` · 2026-07-27 · 122 files, +12,515

The whole product in one commit: a student networking platform where people
find collaborators, ask for an introduction with context attached, and talk.

### Stack

Next.js 15 (App Router, Server Actions), React 19, Prisma 6 over SQLite,
Tailwind 3, Zod 3, Playwright for end-to-end tests. Auth is hand-rolled —
bcrypt password hashes, SHA-256 session tokens in an httpOnly cookie — with no
third-party identity provider.

### Features

- **Accounts and sessions** — signup, login, logout, password change, forgot /
  reset password, account deletion. Email verification with a token table.
  Registration is restricted to school email domains via an allowlist
  (`src/lib/edu-allowlist.ts`). Login attempts are recorded and rate-limited.
- **Onboarding and profiles** — a multi-step wizard collects handle, name,
  school, bio, intents and tags; profiles live at `/u/[handle]` with a
  completeness check gating access to the rest of the app.
- **Project rooms** — create, edit and close projects at `/p/[slug]`, with
  membership management, an async update feed, and open roles that carry their
  own tags and commitment level.
- **Discovery** — `/discover` ranks people, projects and open roles. The
  ranking (`src/lib/ranking.ts`) is deliberately transparent: each card shows
  which of your tags matched, so the ordering is legible rather than a black box.
- **Intro requests** — you cannot cold-message. You send a request that must
  carry context (a shared project, a role, a tag overlap), and every constraint
  is enforced in the server action, not just the dialog.
- **Messaging** — an accepted request opens a thread. Messages persist; the
  client polls for new ones, with an unread badge in the nav.
- **Safety** — block, report, and an admin queue at `/admin/reports`.

### Data model

32 Prisma models/enums. Notably the tag taxonomy is a real `Tag` table with
aliases rather than free-text strings — profiles, projects and roles all
reference tag IDs, which is what makes the match visualization possible.

### Seed data

24 verified users, 10 projects with open roles, accepted threads with message
history, and a populated demo inbox (`prisma/seed.ts`, 1,172 lines).

### Tests

5 Playwright specs, all passing: signup → onboarding → discovery, session
persistence across a real server-process restart, the intro-request → thread →
message path, request constraint enforcement, and authorization bypass attempts.

---

## v0.1 — PostgreSQL migration

**Commit** `8fe9df4` · 2026-07-27 · 11 files, +533 −394

Moves off SQLite so the app can be hosted.

### Changes

- Prisma datasource switched to `postgresql` with a `directUrl`, so runtime
  traffic goes through the pooled connection while migrations use the direct one.
- The init migration was regenerated for Postgres; the SQLite migration
  (`20260726191458_init`) is replaced by `0000000000000_init`.
- `postinstall: prisma generate` added so Vercel builds a client.
- `.env.example` and `README.md` rewritten for Postgres/Supabase; e2e scripts
  now read an ambient `DATABASE_URL` / `DIRECT_URL`.

### Bugs fixed

- **Tag and bio search became case-sensitive on Postgres.** SQLite's `contains`
  ignores case; Postgres's does not, so search silently stopped matching.
  `mode: "insensitive"` added in `src/actions/tags.ts` and
  `src/lib/discover-queries.ts`.

---

## v0.2 — gitignore cleanup

**Commit** `2dc3c73` · 2026-07-27 · 1 file, +1 −16

Housekeeping only. Adds `.vercel` and drops 16 lines of stale ignore rules
(largely the SQLite artifacts that v0.1 made irrelevant). No behavior change.

---

## v0.3 — Open registration

**Commit** `2e67535` · 2026-07-27 · 11 files, +126 −36

### Features

- **Registration accepts any valid email.** School-only mode is preserved
  behind `REQUIRE_EDU_EMAIL=true`, keeping `DEV_EMAIL_ALLOWLIST` as before.
- **Site-wide verification banner** (`VerifyBanner.tsx`) prompting unverified
  users, since verification gates intro requests and messaging.
- `MAIL_ENABLED` flag added, so the link is emailed only once a provider exists.

### Issues resolved

- **Real signups could not reach a verified state.** No mail provider is wired
  up, so the verification link only ever reached the server console — an
  ordinary user had no way to see it. The link is now surfaced in the UI at
  `/verify/pending` as well.

---

## v0.4 — Messaging depth and safety

**Commit** `c8de011` · 2026-07-29 · 61 files, +1,799 −580

Six reported bugs, plus two infrastructure problems found while fixing them.

### Features

- **Typing indicator.** Presence is stored as an *expiry timestamp* rather than
  a boolean, so a client that vanishes mid-keystroke stops advertising
  "typing…" on its own — no reaper job needed.
- **Delivered / seen receipts** on the newest message you sent.
- **Live request count in the nav**, capped at "9+" so the badge keeps a fixed
  width; the exact number stays in the accessible name. Both nav badges are now
  served by one poller (`useNavCounts.ts` + `/api/nav-counts`) instead of two.
- **`src/lib/relationship.ts`** — a single answer to "where do I stand with this
  person?", replacing per-page local guesses.
- **Blocked list in settings** with unblock, since blocking hides a profile from
  discovery and would otherwise be irreversible.

### Bugs fixed

1. **Email verification gated the app but proved nothing.** With no mail
   provider, the app handed the user their own verification link — clicking it
   only proved they could read a page just rendered for them, while intro
   requests, messaging and project creation sat behind it. Verification is
   removed entirely; existing accounts are grandfathered in.
2. **Opening a thread never marked it read.** The effect only fired on change,
   so unread badges never cleared. Surfaced while building receipts.
3. **A pair already messaging still saw "Request intro" on a project page.**
   The page asked only "am I a member?" — now resolved through
   `lib/relationship.ts`.
4. **Blocking disclosed itself to the blocked party.** Made asymmetric: the
   blocker sees the block and can lift it; the blocked party is only prevented
   from acting, with neutral composer copy, no block wording in the server's
   refusal, and nothing on the page that gives it away.

### Issues resolved

- **The e2e suite wiped production.** It seeded whatever database `.env` pointed
  at. It now runs against an isolated Postgres schema via
  `scripts/with-e2e-db.mjs`, and the test server refuses to start without an
  explicit schema.
- **`sendMessageCore` was a callable endpoint that let its caller pick an
  identity.** It was exported from a `"use server"` module while taking a
  `profileId` parameter — so any client could choose whose name to write under.
  Moved to the non-action module `src/lib/messages-core.ts`.

### Data model

`EmailVerificationToken` dropped; typing-presence columns added
(migration `20260728090000_remove_verification_add_typing`).

### Tests

5 new specs (06–10) covering the six fixes. Suite: **11/11 passing**.

---

## v0.5 — Feed, nav, and connection pooling

**Commit** `017dbd8` · 2026-08-02 · 49 files, +3,701 −251

The largest release after v0.0.

### Features

- **Feed** (`/feed`) — profile posts with photo and video attachments, merged
  with project updates and open roles into one ranked timeline
  (`lib/feed-queries.ts`, `lib/feed-types.ts`). New `Post`, `MediaAsset` models
  and a `MediaKind` enum, with upload/serve routes at `/api/media`.
- **Collapsing composer.** The post box now sits on a single line until
  focused. Previously it spent roughly a third of the viewport on a label, a
  three-row textarea, a permanent character count and a raw file input — on
  every visit, for something most readers scroll past.
- **Nav restructure.** Seven equal-weight items reduced to four destinations
  plus an account menu behind the avatar; profile, admin and log out moved
  there, on the reasoning that they are account chores, not places you navigate
  to.
- **Capacity indexes** migration for the new query shapes.

### Bugs fixed

- **Connection-pool exhaustion — the real bug behind the noise.** `DATABASE_URL`
  carried no `connection_limit`, so Prisma opened its default (`cores * 2 + 1`,
  over 15) into Supabase's 15-connection session pool. It surfaced as error
  boundaries, "max clients reached", intermittent unreachability, and a
  *different* e2e spec failing on each run.
- **Overlapping pollers.** Both pollers used `setInterval`, which fires on a
  fixed clock whether or not the previous request returned — measured at 4,466 ms
  on a 3,000 ms interval. Requests overlapped and accumulated, each holding a
  connection that the user's own navigation then queued behind. Each run now
  chains off the previous one's completion.
- **Double-accept race on intro requests.** Accepting was check-then-act, so two
  concurrent accepts both passed the `PENDING` check and the second tripped the
  unique constraint on `Thread.introRequestId`. The status transition is now
  itself the lock, and the losing caller receives the same thread instead of an
  error.

### Issues resolved

- **The e2e schema guard could not be trusted through the transaction pooler.**
  The suite isolates itself by schema and then wipes it — but a transaction
  pooler does not preserve `search_path`: 12 concurrent `current_schema()` calls
  through port 6543 came back as a mix of `hatch_e2e` and `public`.
  `with-e2e-db.mjs` now pins the session port, and the seed refuses to wipe when
  it finds itself in `public`.

### Tests

New spec `11-feed-posts.spec.ts` (268 lines). Suite: **19 passed, 0 failed**.

---

## v0.6 — Handles and user-grown catalogs

**Commit** `709d651` · 2026-08-02 · 31 files, +937 −217

### Features

- **Underscore handles.** `-` gives way to `_`. The rule is an allowlist
  (`[a-z0-9_]`) rather than a blocklist, so anything platforms typically reject
  is excluded by construction. Dropping the hyphen is deliberate: handles share
  URL space with project and tag slugs, which *do* use hyphens.
  `src/lib/handle.ts` is the single definition imported by both the Zod schema
  and the wizard's client-side check, and the input repairs `-`, `.` and spaces
  to `_` as you type.
- **School catalog with type-ahead.** A `School` row is created as a side effect
  of *saving* a profile that names it (`ensureSchool`), never of typing in a box
  — so the dropdown is made of schools people actually attend. `Profile.school`
  stays free text; the catalog is a suggestion source, not a foreign key. The
  first writer's spelling becomes canonical, which is what keeps one school from
  splitting into several entries.
- **User-grown skill tags.** The tag picker's "no match" branch now creates the
  `Tag` instead of filing a `TagSuggestion` nobody actions. Creation is
  idempotent on the same normalized slug the school catalog uses
  (`lib/catalog-slug.ts`), so casing and punctuation variants resolve to the
  existing row. `TagSuggestion` is retained as a provenance log.
- **`Profile.basedIn`** — an optional single line at city/country granularity.
- New shared `ComboBox` UI primitive backing both pickers.

### Bugs fixed

- **A user-grown taxonomy could silently break alias lookups.** New tag rows
  could push a seeded row out of `searchTagsAction`'s scan window, so `k8s` →
  Kubernetes would stop resolving. The alias scan is now restricted to rows that
  actually carry aliases.

### Migration

`20260802113000_handle_underscore_school_catalog_based_in` rewrites every issued
handle, appending a numeric suffix on the collisions that creates (handles are
unique, so `a-b` and `a_b` may both already exist), and backfills the school
catalog from schools already typed into profiles using the SQL twin of
`catalogSlug()`.
