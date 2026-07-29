# HATCH

A builder-serious professional network for college students. Post projects and open roles, get discovered by your skills, and reach people through **context** — every intro references a real open role, project, or intent, so there are no cold DMs.

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

## Architecture notes

- **`src/lib/session.ts`** — `createSession` / `getSession` / `requireSession` / `destroySession`. Tokens are 32 random bytes, stored as a SHA-256 hash, delivered as an httpOnly + sameSite=lax cookie with 30-day sliding expiry. Logout deletes the DB row.
- **`src/lib/authz.ts`** — `assertProjectOwner`, `assertProjectMember`, `assertThreadMember`, `isBlockedEitherWay`. Every server action and route handler re-derives ownership/membership from the DB using the caller's own `profileId`; a client-supplied ID is never trusted as proof of access.
- **`src/lib/ranking.ts`** — a single documented pure function scores the discovery open-roles feed (tag overlap 55, same school 20, recency 15, profile completeness 10). Non-discoverable owners and blocked users are excluded in the query (`src/lib/discover-queries.ts`), not in the UI. A comment marks the Postgres GIN-index upgrade path.
- **`src/lib/relationship.ts`** — one answer to "where do I stand with this person?", shared by the profile page, project pages and both discovery feeds. Each surface used to decide locally and partially (the project page only asked "am I a member?"), so a pair who were already messaging still saw a bare "Request intro". `getRelationships` resolves a whole feed in a fixed number of queries. The intro-request *lifecycle* and the *block* state are separate axes because they are not equally disclosable — see below.
- **Blocking is one-directional in what it discloses and bidirectional in what it prevents.** `getBlockState` (`src/lib/authz.ts`) keeps the two directions apart. The blocker is told plainly on the profile, in the thread and in settings, and can lift it there. The blocked user is only ever stopped: the composer closes with "You can't send messages in this conversation", the server's refusal carries no block wording, and nothing on their view names a block. Settings carries the block list because blocking removes the profile from discovery — without it a block would be effectively irreversible.
- **`src/lib/messages-core.ts`** — messaging logic shared by the server action and the route handler. It lives outside `actions/` on purpose: every exported async function in a `"use server"` module is a callable endpoint, so a helper there that takes `profileId` as a parameter lets the client choose whose identity to write under.
- **Typing presence** is an *expiry* (`ThreadMember.typingUntil`), not a boolean: a client that disappears mid-keystroke stops advertising "typing…" on its own, with no reaper job. A keystroke re-claims the window at most once per 2s, and sending or blurring releases it.
- **Read receipts** reuse `ThreadMember.lastReadAt`. The newest own message shows `✓ delivered` until the other member's watermark passes it, then `✓✓ seen` — only the newest, since it implies every message above it.
- **Tags are a table.** Profiles, projects, and roles reference tag IDs only. The picker autocompletes against the taxonomy; unrecognized input creates a `TagSuggestion` row (for review) and never a `Tag`.
- **Messaging** polls `GET /api/threads/[threadId]/messages?after=<cursor>` every 3s while the tab is visible (paused when hidden), and typing/read presence rides along on that same response rather than adding a second poll. Every nav badge is fed by one `GET /api/nav-counts`. No websockets — a comment marks where an SSE upgrade would slot in. User text renders as plain text (React-escaped; no `dangerouslySetInnerHTML` in the message path).
- **Avatars** are deterministic inline SVG identicons generated from a seed (`src/lib/avatar.ts`) — no uploads, no external images, no faces.

## Switching to Postgres

1. In `prisma/schema.prisma`, change `datasource db { provider = "postgresql" }`.
2. Set `DATABASE_URL` to your Postgres connection string.
3. `npx prisma migrate dev` (regenerate migrations for Postgres) and `npm run seed`.

All enums and `Json` fields used here map cleanly to native Postgres types; no model changes are required.
