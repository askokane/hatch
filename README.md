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

Unverified accounts can log in and browse, but **cannot send intro requests or
messages**. A banner prompts them to verify.

There is no mail provider wired up, so the verification link is both printed to the
server console *and* shown in the UI at `/verify/pending` — click **Get my
verification link**, then click the link. No inbox required.

```
[HATCH:dev-mail] Verify you@example.com:
  http://localhost:3000/verify/<token>
```

Once you integrate a real email provider, set `MAIL_ENABLED=true` and the link stops
being surfaced in the UI (it will only be emailed).

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

The suite runs against its own database (`prisma/e2e-test.db`) and its own server on port **3100**, so it never touches your dev data. It covers:

1. **Signup → verify → onboarding → discoverable** — a brand-new account through the real UI.
2. **Session persistence** — login survives reload; logout clears it and re-guards protected routes.
3. **Intro request → accept → two-way messaging → survives restart** — two browser contexts hold a conversation, then the test **kills and restarts the server process** and confirms every message persisted (proving file-based persistence, not in-memory state).
4. **Constraint enforcement** — a 39-char note, a duplicate pending request, and a 6th outbound request are all rejected server-side.
5. **Authorization** — forced IDs (another user's thread via API and by URL, a non-member project, another user's profile, the admin route) all return 403 or redirect, never data.

## Architecture notes

- **`src/lib/session.ts`** — `createSession` / `getSession` / `requireSession` / `destroySession`. Tokens are 32 random bytes, stored as a SHA-256 hash, delivered as an httpOnly + sameSite=lax cookie with 30-day sliding expiry. Logout deletes the DB row.
- **`src/lib/authz.ts`** — `assertProjectOwner`, `assertProjectMember`, `assertThreadMember`, `isBlockedEitherWay`. Every server action and route handler re-derives ownership/membership from the DB using the caller's own `profileId`; a client-supplied ID is never trusted as proof of access.
- **`src/lib/ranking.ts`** — a single documented pure function scores the discovery open-roles feed (tag overlap 55, same school 20, recency 15, profile completeness 10). Non-discoverable owners and blocked users are excluded in the query (`src/lib/discover-queries.ts`), not in the UI. A comment marks the Postgres GIN-index upgrade path.
- **Tags are a table.** Profiles, projects, and roles reference tag IDs only. The picker autocompletes against the taxonomy; unrecognized input creates a `TagSuggestion` row (for review) and never a `Tag`.
- **Messaging** polls `GET /api/threads/[threadId]/messages?after=<cursor>` every 3s while the tab is visible (paused when hidden); the nav unread badge polls `GET /api/unread-count`. No websockets — a comment marks where an SSE upgrade would slot in. User text renders as plain text (React-escaped; no `dangerouslySetInnerHTML` in the message path).
- **Avatars** are deterministic inline SVG identicons generated from a seed (`src/lib/avatar.ts`) — no uploads, no external images, no faces.

## Switching to Postgres

1. In `prisma/schema.prisma`, change `datasource db { provider = "postgresql" }`.
2. Set `DATABASE_URL` to your Postgres connection string.
3. `npx prisma migrate dev` (regenerate migrations for Postgres) and `npm run seed`.

All enums and `Json` fields used here map cleanly to native Postgres types; no model changes are required.
