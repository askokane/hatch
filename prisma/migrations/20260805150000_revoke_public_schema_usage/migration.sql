-- Close the last inherited path into this schema.
--
-- Migration 20260805130000 revoked the DIRECT schema USAGE grant from `anon` and
-- `authenticated`, and the audit still reported `effective=true` for both. That
-- was not a failed revoke: Postgres grants USAGE on `public` to the pseudo-role
-- PUBLIC by default — the `=U/pg_database_owner` entry in the schema ACL — and
-- every role inherits it. Revoking from a named role cannot remove a grant that
-- was never made to that role.
--
-- IS THIS EXPLOITABLE ON ITS OWN? No. USAGE only permits resolving names inside
-- the schema; reading a row additionally requires a table privilege, and those
-- are gone, with RLS on behind them. `has_table_privilege('anon', ...)` returns
-- false for every table, which is the check that actually settles it.
--
-- So this is defence in depth, and it is worth having for one specific reason:
-- it removes an ambient grant that any FUTURE object in this schema would
-- inherit without anyone deciding to grant it. The rest of the lockdown is
-- per-object and has to be maintained per object; this is the one part that is
-- structural.
--
-- WHAT COULD BREAK
--
-- Nothing this application does. Prisma connects as `postgres`, which holds an
-- explicit `postgres=U/` entry in the ACL — inheritance from PUBLIC is not how it
-- resolves names, so removing that inheritance cannot affect it. `service_role`
-- likewise holds an explicit grant and is untouched. Supabase's own managed
-- services (Auth, Storage, Realtime) own their own schemas and do not resolve
-- names through `public`.
--
-- The thing that DOES change: PostgREST can no longer introspect this schema at
-- all, so the REST API returns nothing for it rather than an empty result set.
-- That is the intent — this project has never used PostgREST — but it is the
-- line to reverse if that ever changes:
--
--     GRANT USAGE ON SCHEMA public TO anon, authenticated;
--
-- and then grant per-table alongside real RLS policies, never wholesale.
--
-- Written against current_schema() so the isolated e2e schema gets the identical
-- treatment and the suite runs against what production actually looks like.

DO $$
DECLARE
  target text := current_schema();
BEGIN
  EXECUTE format('REVOKE USAGE ON SCHEMA %I FROM PUBLIC', target);

  -- Belt and braces: the named roles again, in case a direct grant was re-added
  -- between the previous migration and this one.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE format('REVOKE USAGE ON SCHEMA %I FROM anon', target);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE format('REVOKE USAGE ON SCHEMA %I FROM authenticated', target);
  END IF;

  -- `postgres` is what Prisma migrates and queries as. It already holds an
  -- explicit grant on a Supabase project, but a plain Postgres database would
  -- have been relying on the PUBLIC grant just revoked above — which would lock
  -- the application out of its own schema. Re-granting explicitly makes this
  -- migration safe to run anywhere, and is a no-op where the grant exists.
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO CURRENT_USER', target);
END
$$;
