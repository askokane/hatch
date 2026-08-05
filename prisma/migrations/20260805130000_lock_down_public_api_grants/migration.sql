-- Close the PostgREST path to this database.
--
-- WHAT WAS WRONG
--
-- Supabase provisions every project with an auto-generated REST API (PostgREST)
-- in front of the `public` schema, and grants the `anon` and `authenticated`
-- roles full DML on everything in it. That is the right default for an app built
-- ON Supabase's client libraries, where row-level security is what does the
-- authorization. HATCH is not that app: it reaches Postgres directly through
-- Prisma as `postgres`, does all of its authorization in the application layer,
-- and has never enabled RLS on a single table.
--
-- The two halves combined into a full bypass of the application. Anyone holding
-- the project's anon key could call
--
--     GET https://<project>.supabase.co/rest/v1/User?select=*
--
-- and read every password hash; the same for `Session` (session token hashes —
-- i.e. the ability to mint a valid cookie), `PasswordResetToken`, `Message` and
-- `MediaAsset`. DELETE and TRUNCATE were granted too, so the same key could have
-- emptied the database. The anon key is not a secret — Supabase treats it as a
-- publishable value and it is displayed in the project dashboard — so "nobody
-- has it" was the only thing standing in front of all of that.
--
-- WHAT THIS DOES
--
--   1. Enables row-level security on every table, with no policies. For any role
--      that does not bypass RLS, no-policy means no rows.
--   2. Revokes the table/sequence/function grants from `anon` and
--      `authenticated`.
--   3. Revokes the DEFAULT privileges that would re-grant every FUTURE table to
--      those roles. Without this the fix would silently undo itself: the next
--      Prisma migration that adds a table would hand it straight back to `anon`.
--   4. Revokes schema USAGE, so PostgREST cannot even introspect the schema.
--
-- WHY THIS IS SAFE FOR THE APP
--
-- Prisma connects as `postgres`, which owns every table here and has
-- `rolbypassrls = true`. RLS is never evaluated for it, and none of the revokes
-- below name it. The application's own queries are unaffected — verified by
-- re-running the audit and the full e2e suite after applying this.
--
-- REVERSING IT
--
-- If this project ever does adopt the Supabase client libraries, re-granting is
-- the documented Supabase default (GRANT USAGE ON SCHEMA ... plus the table
-- grants) — but do that per-table alongside real RLS policies, not wholesale.
--
-- Written against `current_schema()` rather than a hardcoded `public` so the
-- isolated e2e schema is locked down by the same migration.

DO $$
DECLARE
  target text := current_schema();
  r record;
BEGIN
  -- 1. RLS on everything. Defence in depth behind the revokes below: should a
  --    grant ever come back, no-policy RLS still yields zero rows.
  FOR r IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = target AND c.relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', target, r.relname);
  END LOOP;

  -- 2/3/4. The grant removal, for each exposed role that actually exists — these
  -- roles are Supabase-provisioned, so a plain Postgres (a contributor's local
  -- database, a CI container) must not fail this migration for their absence.
  FOR r IN
    SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')
  LOOP
    EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM %I', target, r.rolname);
    EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM %I', target, r.rolname);
    EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA %I FROM %I', target, r.rolname);

    -- The future-tables half. Default privileges are recorded per granting role,
    -- so both roles that hold them on this schema have to be cleared. `postgres`
    -- is what Prisma migrates as; `supabase_admin` provisioned the schema.
    -- Clearing supabase_admin's requires membership in it, which is not
    -- guaranteed — hence the nested handler, so a project where that is not
    -- permitted still gets everything else.
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA %I REVOKE ALL ON TABLES FROM %I',
      target, r.rolname);
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA %I REVOKE ALL ON SEQUENCES FROM %I',
      target, r.rolname);
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA %I REVOKE ALL ON FUNCTIONS FROM %I',
      target, r.rolname);

    BEGIN
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA %I REVOKE ALL ON TABLES FROM %I',
        target, r.rolname);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA %I REVOKE ALL ON SEQUENCES FROM %I',
        target, r.rolname);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA %I REVOKE ALL ON FUNCTIONS FROM %I',
        target, r.rolname);
    EXCEPTION WHEN insufficient_privilege OR undefined_object THEN
      RAISE NOTICE 'Could not clear supabase_admin default privileges for % in %; the explicit revokes above still apply.', r.rolname, target;
    END;

    EXECUTE format('REVOKE USAGE ON SCHEMA %I FROM %I', target, r.rolname);
  END LOOP;
END
$$;
