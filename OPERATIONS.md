# HATCH operations

Production uses separate database identities. `DIRECT_URL` belongs to the migration owner. `DATABASE_URL` belongs to the `hatch_runtime` DML-only role created with `scripts/configure-runtime-role.sql`. The production build refuses owner, `postgres`, or shared runtime credentials. Use certificate-verifying TLS parameters supported by the provider in both URLs.

The demo seed is destructive and runs only when `ALLOW_DESTRUCTIVE_SEED=e2e` targets `hatch_e2e`/`hatch_e2e_*`, or when `ALLOW_DESTRUCTIVE_SEED=demo` targets a non-public schema outside production. Never share those databases with production. Production deploys also check that no seeded account still accepts the documented demo password.

Set `PASSWORD_RESET_WEBHOOK_URL` to a mail-delivery endpoint that accepts `{ template, to, link }`; optionally set `PASSWORD_RESET_WEBHOOK_SECRET`. Production never logs reset credentials and disables a token if delivery fails. Set `MEDIA_PROCESSOR_URL` and optionally `MEDIA_PROCESSOR_SECRET` to a service that validates, strips metadata from, and returns safe video bytes. Video upload stays unavailable in production without it.

Set `CRON_SECRET` for the daily `/api/internal/maintenance` Vercel cron. It removes expired sessions and reset tokens, 30-day abuse logs, uploads abandoned for a day, and orphan avatars.

Run `npm run verify`, `npm run security:audit`, the isolated browser suite, and a production build before release. Migrations must remain backward compatible with the currently serving release. Use expand/contract changes across releases for renames and removals.

Before a schema release, take a provider snapshot and record its identifier. Quarterly, restore a snapshot to a separate database, apply migrations, run `npm run audit:db`, and execute the browser suite against an isolated schema there. Record recovery time and row-count checks. A migration failure aborts deployment; it does not substitute for restore testing.
