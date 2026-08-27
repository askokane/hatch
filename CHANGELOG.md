# HATCH — Version History

Every commit on `main`, numbered `v0.0` upward in chronological order. There are
no GitHub issues or PRs, so the "issues resolved" sections below are drawn from
what each commit states it fixed.

Every version listed below has an annotated git tag. The commit that *updates*
this file cannot number itself, so it is always documented one update later —
which is why the newest commit on `main` is briefly absent from the table.

| Version | Commit | Date | Title |
| --- | --- | --- | --- |
| [v0.0](#v00--initial-platform) | `b6eb120` | 2026-07-27 | Build HATCH: full-stack student networking platform |
| [v0.1](#v01--postgresql-migration) | `8fe9df4` | 2026-07-27 | Switch to PostgreSQL for hosted deployment |
| [v0.2](#v02--gitignore-cleanup) | `2dc3c73` | 2026-07-27 | Ignore .vercel; tidy gitignore |
| [v0.3](#v03--open-registration) | `2e67535` | 2026-07-27 | Open registration to any email; make verification completable without mail |
| [v0.4](#v04--messaging-depth-and-safety) | `c8de011` | 2026-07-29 | Fix six reported bugs; add typing, receipts and relationship sync |
| [v0.5](#v05--feed-nav-and-connection-pooling) | `017dbd8` | 2026-08-02 | Add feed, restructure nav, and fix database pooling |
| [v0.6](#v06--handles-and-user-grown-catalogs) | `709d651` | 2026-08-02 | Underscore handles, user-grown school/skill catalogs, based-in field |
| [v0.7](#v07--this-changelog) | `74b8809` | 2026-08-05 | Add CHANGELOG documenting v0.0 through v0.6 |
| [v0.8](#v08--profile-pictures-and-the-postgrest-lockdown) | `8bafa99` | 2026-08-05 | Add profile picture uploads; close the PostgREST hole in the database |
| [v0.9](#v09--university-catalog-import) | `09e9f2b` | 2026-08-05 | Add university/tag catalog import and accent-folded slugs |
| [v0.10](#v010--avatar-size-cap-ordering) | `d168860` | 2026-08-05 | Check the avatar size cap against the resized copy, not the original |
| [v0.11](#v011--security-and-image-documentation) | `6fe6de8` | 2026-08-05 | Document the EXIF stripping, the USAGE revoke, and the RLS-on-new-tables rule |
| [v0.12](#v012--e2e-port-guard) | `4b426f6` | 2026-08-05 | Reclaim an orphaned e2e server instead of refusing to run |
| [v0.13](#v013--migrations-run-from-the-build) | `11bdce9` | 2026-08-06 | Apply migrations from the build, on production deploys only |
| [v0.14](#v014--changelog-through-v013) | `6993e31` | 2026-08-06 | Document v0.7 through v0.13 in the CHANGELOG |
| [v0.15](#v015--build-log-honesty) | `02847d0` | 2026-08-06 | Stop the build log claiming migrations it did not apply; tag v0.7-v0.14 |
| [v0.16](#v016--people-search) | `076c617` | 2026-08-24 | Find people by name and skill, not just bio; fold the filters away |
| [v0.17](#v017--changelog-through-v016) | `3c13be4` | 2026-08-25 | Document v0.15 and v0.16 in the CHANGELOG; tag both |
| [v0.18](#v018--share-cards-in-threads) | `a69dfff` | 2026-08-25 | Share a profile or project into a thread as a card, not a link |
| [v0.19](#v019--changelog-through-v018) | `fe5c73d` | 2026-08-25 | Document v0.17 and v0.18 in the CHANGELOG; tag both |
| [v0.20](#v020--mentions-on-posts) | `a934bfd` | 2026-08-26 | Mention people you are connected to in a post |

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

---

## v0.7 — This changelog

**Commit** `74b8809` · 2026-08-05 · 1 file, +283

Documentation only. Numbers every commit on `main` to that point and adds
annotated tags `v0.0`–`v0.6`. Versions are assigned retroactively; `package.json`
still declares `1.0.0` and is untouched.

---

## v0.8 — Profile pictures and the PostgREST lockdown

**Commit** `8bafa99` · 2026-08-05 · 46 files, +1,896 −76

### Features

- **Uploaded profile pictures.** `Profile.avatarAssetId` overrides the
  deterministic identicon every profile has carried since creation. It is a
  scalar FK rather than a join because an avatar is drawn on every people card,
  feed item, thread row and nav bar, so the listing queries have to pick it up in
  the same `select` as the handle. Null means "render the identicon", which is
  why every existing row was already correct with no backfill. The seed is never
  cleared, so removing a picture restores the pattern the profile started with.
- **The bytes are a `MediaAsset`**, reusing the post-media upload validation,
  storage and serving route unchanged. `MediaAsset.isAvatar` separates the two:
  both kinds are `postId`-null, but an avatar is permanently so. Upload is a
  route handler because a photo exceeds the 1 MB Server Action body cap; removal
  is an action, because it carries no body.
- **EXIF is stripped server-side on every image upload.** `lib/image-metadata.ts`
  removes EXIF/XMP/comment segments from JPEG, PNG and WebP with no new
  dependency. Every parser is bounds-checked and bails to the original file
  rather than emit something corrupt.
- **The client downscales to 256 px** through a canvas before uploading, turning
  a multi-megabyte camera photo into tens of kilobytes. That is the bandwidth
  fix; it is skippable by posting to the route directly, which is why the server
  strip above is what the privacy guarantee rests on.
- **`npm run audit:db`** — a read-only report on the database's RLS and grant
  posture that exits non-zero on a regression.

### Bugs fixed

- **Posting anything would have deleted your own profile picture.** The
  abandoned-upload sweep in `createPostAction` deletes every `postId`-null asset
  belonging to the author, which an avatar is by design. `isAvatar` exempts it.
- **A profile picture could be claimed as a post attachment.** The same asset is
  owned by the caller and is `postId`-null — exactly the claim predicate — and
  its id is the `src` of the caller's own `<img>`. A crafted call attached it to
  a post, and deleting that post then cascaded the avatar out from under the
  profile. The claim predicate now carries `isAvatar: false`, making the
  invariant total rather than half-held.

### Security

- **The database was readable and writable through Supabase's REST API.**
  PostgREST fronts the `public` schema and grants `anon`/`authenticated` full DML
  on every table; nothing here had RLS, because nothing here uses RLS. Anyone
  holding the project's anon key — a publishable value, displayed in the
  dashboard, not a secret — could have read every password hash and every
  `Session.tokenHash` (enough to mint a valid cookie), or issued `DELETE` and
  `TRUNCATE`, without touching a line of application code.

### Migration

`20260805120000_profile_avatar_upload` adds `Profile.avatarAssetId` (nullable,
unique, `ON DELETE SET NULL`) and `MediaAsset.isAvatar`. Additive; no backfill.

`20260805130000_lock_down_public_api_grants` enables RLS on every table with no
policies, revokes the `anon`/`authenticated` table, sequence and function grants,
and revokes the **default privileges** that would otherwise re-grant every future
table — without which the next migration to add a table would silently re-open
the schema. The app is unaffected because `postgres` owns these tables and has
`rolbypassrls`.

### Tests

Spec 12 covers the upload round trip, the sweep regression, replacement,
removal, the claim guard and EXIF stripping end to end. Spec 13 unit-tests the
metadata parser, asserting byte-for-byte equality against clean files — which
catches a parser that drops the right segment and a stray byte with it.

---

## v0.9 — University catalog import

**Commit** `09e9f2b` · 2026-08-05 · 10 files, +8,910 −12

Not authored as part of the profile-picture work; committed separately so the two
features have distinct histories. Described from the diff rather than from
review.

### Features

- **~1,350-university catalog** in `prisma/data/`, with
  `scripts/fetch-universities.mjs`, `import-catalog.ts` and `verify-catalog.ts`
  as the fetch/import/verify path.
- **`catalogSlug()` folds accents.** Previously every non-`[a-z0-9]` run
  collapsed to `-`, so a university's accented and unaccented spellings produced
  different slugs and therefore duplicate rows — survivable at nine hand-typed
  schools, not across 142 countries of mostly accented names.

### Bugs fixed

- **`TAG_ALIAS_SCAN_MAX` raised from 500 to 2000.** The alias scan cannot run in
  the database (`aliases` is a Json array), so curated rows are filtered in
  memory. The catalog expansion took that set from 99 rows to 326; past the old
  bound, alias lookups outside the window stop resolving with no error.

### Migration

`20260805140000_fold_accents_in_catalog_slugs` re-slugs existing rows. Measured
against the live catalog before running: 1 `School` row changes, 0 collisions,
so it carries no merge logic.

---

## v0.10 — Avatar size cap ordering

**Commit** `d168860` · 2026-08-05 · 2 files, +30 −13

### Bugs fixed

- **An ordinary phone photo was rejected for being too large**, despite
  downscaling to roughly fifty kilobytes. The cap applies to what gets uploaded —
  the 256 px re-encode — but was being checked against the file the user picked.
  Type is still checked up front, since that answer cannot change; size moved to
  after the downscale, where it only trips when resizing genuinely could not
  help. The hint text no longer quotes a byte limit, because the limit no longer
  applies to anything the user can see.

---

## v0.11 — Security and image documentation

**Commit** `6fe6de8` · 2026-08-05 · 2 files, +48 −10

Documentation only, but one paragraph was wrong rather than merely stale: the
README described the lockdown as leaving two residuals, one of which had since
been closed. Also records the rule the migration cannot enforce for itself —
a new table needs its own `ENABLE ROW LEVEL SECURITY`, because automating that
needs superuser — and which half of the image pipeline is the guard.

### Migration

`20260805150000_revoke_public_schema_usage` revokes schema `USAGE` from the
pseudo-role `PUBLIC`, which every role inherits and which a per-role revoke
therefore could not reach. It re-grants `CURRENT_USER` explicitly so the
migration is also safe on a plain Postgres, where the application would otherwise
have been relying on that same inherited grant. Defence in depth: `USAGE` alone
confers no data access, since reading a row also needs a table privilege.

---

## v0.12 — e2e port guard

**Commit** `4b426f6` · 2026-08-05 · 2 files, +29 −7

### Bugs fixed

- **An interrupted test run blocked every subsequent run.** The guard on port
  3100 exists to stop the suite testing a stale build, and that reasoning stands
  — but it treated both ways of reaching an occupied port as the same situation.
  A PID file is left behind only when a run was interrupted before teardown, and
  it names a process the harness itself spawned; that case is now reclaimed. With
  no PID file the occupant is something else, quite possibly a developer's own
  dev server, so that case still refuses. This cost three full suite runs in one
  session to rediscover.
- The PID file is now gitignored. A committed one would carry a PID from another
  machine, which the new branch above would act on.

---

## v0.13 — Migrations run from the build

**Commit** `11bdce9` · 2026-08-06 · 3 files, +192 −2

### Features

- **`npm run build` applies pending migrations**, via
  `scripts/migrate-then-build.mjs`. Migrations were previously a manual step
  separate from deploying, so code and schema were two independent actions that
  could be done in either order, or one without the other — this project spent a
  day with a database three migrations ahead of the code running against it.
- **Builds first, migrates second.** A compile error is far likelier than a
  migration failure, and migrating first means a broken build has already mutated
  the database. Nothing is lost by waiting: the deploy goes live only once the
  whole command exits 0, so migrations still land before traffic reaches the new
  code.
- **Production deploys only**, guarded on `VERCEL_ENV`. There is one database, so
  preview builds point at the same Postgres production does; without the guard,
  opening a pull request would migrate the live database before anyone had read
  the migration.
- Fails closed, resolves the connection string before building so a
  misconfiguration costs a second rather than a full compile, and refuses to
  migrate over a transaction pooler (port 6543 / `pgbouncer=true`), which does
  not preserve session state.

### Consequence to keep in mind

Migrations now run while the **previous** release is still serving, so every
migration must be backward-compatible with the release before it. Add columns;
do not rename or drop them in the same deploy that stops using them. Widen now,
narrow in a later deploy once nothing reads the old shape.

---

## v0.14 — Changelog through v0.13

**Commit** `6993e31` · 2026-08-06 · 1 file, +203 −3

Documentation only. Numbers the seven commits since `v0.7`.

Corrects a claim in this file's own header while there: it stated the repo
carried no git tags, which stopped being true in the very commit that wrote the
sentence — `v0.0`–`v0.6` were tagged by it.

---

## v0.15 — Build log honesty

**Commit** `02847d0` · 2026-08-06 · 2 files, +23 −3

### Bugs fixed

- **The build log claimed migrations it had not applied.** The migrate step
  printed "[build] migrations applied." unconditionally, so a deploy with
  nothing pending logged that line directly beneath Prisma's own "No pending
  migrations to apply." A log that contradicts itself is worst exactly when
  someone is reading it to find out what happened, which is the only time anyone
  reads one. It now reports that the step finished and leaves Prisma's output
  above it to say what was actually done.

### Repository

- **Tags `v0.7` through `v0.14`**, generated from the table above rather than
  typed, so a tag cannot point somewhere this document does not claim. All 15
  were verified against the table.
- The header's note on tags is replaced. It said v0.7 onward were untagged,
  which this commit made false; it now states the rule that actually holds.

---

## v0.16 — People search

**Commit** `076c617` · 2026-08-24 · 4 files, +597 −81

### Bugs fixed

- **Searching for a person by name found nobody.** The People search queried
  `bio` and nothing else, so the first thing anyone types — a name — reliably
  returned "no people match", because a person's name is not in their own bio.
  Search now covers name, handle, school, based-in, bio and tag labels.
- **Matches came back in the wrong order.** The database returns rows by
  `updatedAt`, which is right for browsing and wrong for searching: the person
  you named ranked behind two people who merely mentioned them. Matches are now
  ranked — a name outranks a handle, which outranks a skill, which outranks an
  incidental mention in someone else's bio. A text search pulls a bounded
  candidate set of 240 and lets relevance pick the page of 60, mirroring the
  two-pass shape the ranked role feed already uses, so the cap never silently
  decides the answer.
- **The three controls disagreed about when they applied.** Text needed a submit
  button, the school dropdown fired on change, and grad year fired on blur — an
  invisible rule nobody could have guessed. People typed, saw nothing happen,
  and concluded the search was broken.

### Features

- **One interaction model: change a control, the results follow.** No submit
  step. Text fields debounce 300ms so a word costs one query rather than six;
  chips and the typeahead apply instantly.
- **Navigation is `replace`, not `push`.** Refining a search no longer buries
  the page you arrived from under a history entry per keystroke-batch — leaving
  takes one Back press.
- **Stale results dim instead of blanking.** The whole thing runs inside a
  transition, with a live result count beside the filter chips.
- **Active filters are visible and removable**, as chips with an × and a "clear
  all". Nothing on screen used to say that a filter set three navigations ago
  was still narrowing the results.
- **Inputs are controlled and synced from the URL**, so back/forward and chip
  removal update the fields. The `defaultValue` inputs they replaced went on
  displaying a filter that had already been cleared.
- **The narrowing filters fold behind a toggle**, since most searches are a name
  or a skill and three unasked-for controls made the surface read as a form to
  fill in rather than a box to type in. Folding them is only safe while an
  applied filter stays legible, so the toggle carries a count and a filtered URL
  arrives open — which is what a shared or bookmarked link looks like.
- School became a free-text datalist typeahead. It is a `contains` match
  server-side, so a partial name works and a campus missing from the list is not
  a dead end; a `<select>` of every school was neither. "Looking for" became five
  toggle chips, sized to match the fields beside them.
- Grad year holds a partial entry back from the URL. "20" is a valid number that
  matches nobody, so committing it emptied the page between the second and
  fourth keystroke.
- `/` focuses the search box, Escape clears it, Enter flushes the debounce, and
  the field is 16px so mobile does not zoom on focus.

### Tests

`e2e/11-people-search.spec.ts` covers the four properties this rests on: finds a
person by name as you type, matches handles, skills and schools, does not pile
up history entries, and folds the filters without hiding one that is applied.

---

## v0.17 — Changelog through v0.16

**Commit** `3c13be4` · 2026-08-25 · 1 file, +88

Documentation only. Numbers the two commits that were outstanding, and creates
their annotated tags.

Two rather than one: `02847d0` was still sitting in the gap this file's header
describes, and its own message says "this commit will be v0.15". Numbering the
people-search work v0.15 would have skipped it, so that commit took v0.15 and
the search work became v0.16.

---

## v0.18 — Share cards in threads

**Commit** `a69dfff` · 2026-08-25 · 20 files, +1,063 −95

### Features

- **A shared profile or project arrives as a card, not a URL.** Passing someone
  on used to mean pasting a link into a message, which lands as a line of grey
  text saying nothing about who is on the other end — the recipient has to click
  it to find out whether it was worth clicking. A share now carries a name, a
  handle or a stage, a one-line blurb and an avatar, and the whole card is the
  link. A Share control sits on every profile, on your own profile, and on every
  project page for every viewer rather than only its owner.
- **The share sheet lists conversations, not users.** Every row is someone whose
  intro request was accepted, or who accepted one, so there is no "search
  everyone" step and a share cannot become a way to reach someone who has not
  already agreed to be reachable. Rows send independently and each reports its
  own outcome: sharing to three people is three taps with three confirmations,
  rather than a multi-select whose failure mode is "two of them worked". The
  search field appears only above five conversations, since a search box over
  four rows is furniture.
- **Projects get a mark of their own.** They have no picture, so a card borrows
  the identicon generator seeded on the slug — deterministic, stable for the
  life of the project, and in the same visual language as every avatar on the
  platform.

### Data model

- **A share IS a message** — three nullable columns on `Message` (`shareKind`,
  `shareTargetId`, `shareSnapshot`) rather than a side table. It holds its place
  in the transcript, carries a read receipt and counts towards unread exactly as
  any other message does. A second ordered source would have forced every reader
  — the 3s poll, the history backfill, the unread count — to learn about it; the
  existing `[threadId, createdAt, authorProfileId]` index still serves paging
  untouched.
- **`shareTargetId` is deliberately not a foreign key.** It points at either a
  Profile or a Project so it could not be one anyway, but the deciding reason is
  deletion: a sent message is a record of what was sent. `CASCADE` would erase
  messages out of someone else's transcript and `SET NULL` would leave a card
  with nothing behind it — both rewrite history to satisfy referential tidiness
  nobody asked for.
- **The card renders from a snapshot taken at send time.** So the transcript
  keeps saying what was actually shared when a project is later renamed, and a
  thread holding fifty cards still costs one query to page. The snapshot is
  parsed on read rather than cast, because Prisma types JSON as `unknown` and a
  row that fails to parse should cost one card, not the whole transcript.

### Safety

- **Sharing is gated by the same function as typing.** `sendMessageCore`'s
  membership and block checks are extracted to `threadPostingRefusal` and shared,
  so a thread that is read-only for text is read-only for cards. A block cannot
  close one door and leave the other open.
- **A blocked counterpart is withheld from the share sheet in both directions.**
  This discloses nothing the sender does not already know: that thread's composer
  is already closed for them, so its absence tells them only what the thread
  itself did.
- **"Does not exist" and "blocked you" are one refusal.** A profile that is gone
  and a profile whose owner blocked the sharer collapse into a single
  indistinguishable message, collapsed inside the snapshot builder rather than at
  the call site where one of them might grow its own wording. Telling those apart
  is exactly what a block exists to prevent.
- **The client sends a kind and an id and nothing else.** Everything the card
  *says* is composed server-side from the target's own row — which is what stops
  a share from being a way to put arbitrary text into someone's thread under
  someone else's name and face.

### Bugs fixed

- **The transcript opened on its OLDEST message.** `scrollIntoView({behavior:
  "smooth"})` is a request the browser may decline, and declining it means no
  scroll at all rather than an instant one — in a Chrome where smooth scrolling
  is unavailable it did nothing whatever. Every reader had to scroll down to find
  what they came for, and a message arriving while they watched did not bring
  itself into view. Assigning `scrollTop` is not a request, so it cannot be
  declined. This predates the share work and was confirmed against the
  unmodified component; it is listed here because it is what buried the cards.
- **The thread list rendered a share as a blank preview line**, since a share
  message has an empty body. It now describes what was shared, in the right voice
  for who sent it — "You shared @maya" against "Shared @maya".
- **The card's blurb was cut after about four words.** The server caps it at 140
  characters, but a single truncated line at the card's width fits barely a third
  of that, so a project description told the recipient nothing. Two lines now,
  and the card is wide enough that a profile's "@handle · School · 'YY" line
  survives intact rather than losing the school mid-word.
- **Card width was measured against the viewport** (`85vw`) rather than against
  its parent. The viewport is not what bounds this card: in a narrow column on a
  wide screen it would have overflowed its own transcript while `85vw` still read
  as plenty of room.

### Refactor

- The three places that independently built a `MessageDTO` — the send action,
  the poll route and the server-rendered thread page — are now one
  `toMessageDTO` over one shared select. They were already drifting-prone, and
  growing the row by three fields would have made it worse.

### Tests

`e2e/14-share-cards.spec.ts` drives both kinds through two real browser contexts:
composed by the sender, delivered to the recipient, described in the thread list,
opening on the newest message, and following through to the page it names. The
scroll assertion reads the container's offset rather than visibility, because a
card further up the transcript is still "visible" to Playwright while a reader
would have to go looking for it.

---

## v0.19 — Changelog through v0.18

**Commit** `fe5c73d` · 2026-08-25 · 1 file, +124

Documentation only. Numbers the two commits outstanding at the time — the
previous changelog update and the share-card work — and creates their annotated
tags.

---

## v0.20 — Mentions on posts

**Commit** `a934bfd` · 2026-08-26 · 13 files, +1,012 −8

### Features

- **You can name someone in a post, if you are connected to them.** Typing "@"
  in the composer opens a list of the people whose intro request you accepted or
  who accepted yours; picking one writes their handle into the draft, and the
  posted handle renders as a link to their profile. An "@handle" belonging to
  somebody you have not connected to stays exactly what it looks like — text.
- **The list is keyboard-first.** Arrow keys move, Enter or Tab picks, Escape
  dismisses without clearing the half-typed handle, and Ctrl/Cmd+Enter still
  posts even mid-mention. It sits in the composer's flow rather than floating
  over it: an absolutely positioned popover would have to be measured against a
  textarea that grows as you type and a toolbar that appears on focus, and the
  composer is an expanding surface anyway.
- **An empty query is a real result.** The moment just after "@" is typed shows
  who you could name at all, which is the useful answer then — not nothing.

### The rule, and where it is enforced

- **Decided once, on the server, at write time.** `createPostAction` scans the
  body it was handed, resolves the handles against the profiles sharing a thread
  with the author, and writes a `PostMention` row per survivor in the same
  transaction as the post. The renderer links those rows and nothing else.
- **Because deciding at render time would make the rule retroactive.** A body
  re-scanned on every read is a body whose meaning changes underneath its
  author: an "@alice" typed at a stranger would quietly become a live mention
  months later, the moment the two of them connected, on the reader's machine.
  Writing the decision down is what stops a mention from being something the
  post acquires after the fact.
- **The suggestion list is a convenience, not a gate.** Nothing describing a
  mention crosses the wire inbound — the client posts the same body it always
  did. A caller who never opens the list and types a handle by hand gets exactly
  the same answer, and one who tampers with what it returns gets nothing extra.
- **A block in either direction disqualifies**, and a handle that resolves to
  nobody, to a stranger, or to either side of a block is left out silently. The
  alternative is an error message that confirms whether a given handle exists
  and whether that person has blocked you.
- **Ten per post.** Not a performance bound — resolution is one indexed lookup
  whatever the count — but the ceiling that keeps a post from being a broadcast.

### Data model

- **`PostMention` is the authorization record, not an index.** It is what the
  renderer is permitted to link, which is why it is a table and not something
  derived from the body on read.
- **It stores the handle as written alongside the profile id**, because the two
  answer different questions and drift apart. The body still reads "@alice"
  after Alice renames herself, so matching the token needs the old string; the
  link has to resolve today, so it is built from her current handle. Either
  field alone silently unlinks every existing mention on the first rename.
- **One row per person per post.** A body naming someone three times is one
  relationship; all three tokens render from the same row.
- **Cascading deletes on both sides, for different reasons.** By `postId`,
  because the mention is part of the post. By `profileId`, because — unlike a
  share card — a mention is not a snapshot of anything, it is a live pointer at
  a person, and when that person deletes their account the body degrades to the
  plain text it always was underneath.
- **No backfill.** Every existing post predates the affordance, and an empty
  table is exactly what "no post mentions anyone" looks like. Rescanning old
  bodies would be the retroactive-rule failure above, applied wholesale.
- **RLS is enabled on the new table.** Migrations `20260805130000` and
  `20260805150000` revoked the default privileges that would hand a fresh table
  to `anon`/`authenticated`, so there is nothing left to revoke — but RLS is
  per-table state and a new table starts without it.

### Structure

- **`lib/mentions.ts` is pure string work** — token scanning, body-to-segments,
  and the "@word" the caret is inside — so the composer and the feed cannot
  disagree about what counts as a mention. If they could, a post might carry a
  row nothing renders, or render a link the server never authorized.
- **`lib/mention-core.ts` holds the database half**, outside any `"use server"`
  module, on the same reasoning as `messages-core.ts` and `share-core.ts`: every
  export of one of those is a callable endpoint, so a helper there taking a
  profile id as an argument would let the client name whoever it liked as the
  author.
- The scanner checks the character before an "@" by index rather than with a
  lookbehind. `foo@bar` must not read as a mention of @bar, and a lookbehind
  that fails to parse takes the whole module with it — on a surface whose
  fallback would be a blank feed.

### Tests

`e2e/15-post-mentions.spec.ts` posts one body naming a connection **and** a
stranger, because that is the case where a "resolve them all" bug looks like a
working feature until you read the second name. It checks the rendered result in
two browser contexts — a link for one, plain text for the other, and the same
for the person mentioned — and then checks the stored rows, since the UI
assertion alone cannot tell "the server refused" from "the server stored it and
the renderer declined to draw it". A second test holds the cascade, reading the
database rather than the schema file: a hand-written migration is exactly where
a correct `onDelete` in Prisma and a missing one in Postgres part company.
