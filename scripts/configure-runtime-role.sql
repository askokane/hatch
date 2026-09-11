-- Run as the migration owner with psql variables:
-- psql "$DIRECT_URL" -v runtime_password='a-long-random-password' -f scripts/configure-runtime-role.sql
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hatch_runtime') THEN
    CREATE ROLE hatch_runtime LOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
ALTER ROLE hatch_runtime PASSWORD :'runtime_password';
SELECT format('GRANT CONNECT ON DATABASE %I TO hatch_runtime', current_database()) \gexec
GRANT USAGE ON SCHEMA public TO hatch_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hatch_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO hatch_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hatch_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO hatch_runtime;
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t.tablename AND policyname='hatch_runtime_access') THEN
      EXECUTE format('CREATE POLICY hatch_runtime_access ON public.%I FOR ALL TO hatch_runtime USING (true) WITH CHECK (true)', t.tablename);
    END IF;
  END LOOP;
END $$;
