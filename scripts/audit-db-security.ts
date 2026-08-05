// READ-ONLY audit of the database's security posture. Makes no writes.
//
//   npm run audit:db                                  # whatever DATABASE_URL points at
//   node scripts/with-e2e-db.mjs npx tsx scripts/audit-db-security.ts   # the e2e schema
//
// This exists because the dangerous state it checks for is INVISIBLE from the
// application: HATCH talks to Postgres as `postgres` and would behave identically
// whether or not the whole schema were also readable by an anonymous REST caller.
// Migration 20260805130000 closed that path; this is how you confirm it is still
// closed, and it is worth re-running after any change to roles or grants.
//
// What each section should say on a healthy database:
//
//   rolbypassrls                 true   — the app's role is unaffected by RLS
//   RLS enabled                  true on every table
//   policies                     (none) — deliberate: no policy + no bypass = no rows
//   anon/authenticated grants    (none) — the finding that mattered
//   anon_can_select / auth_...   false on every row — the decisive check
//   schema USAGE                 direct_grant false; `effective` may still read
//                                       true, inherited from PUBLIC — see the
//                                       note on that query, it is not a finding
//   default privileges           no anon/authenticated entries granted BY
//                                       postgres for this schema, or the next
//                                       migration re-opens the hole
//   SECURITY DEFINER functions   (none)
//
// The "SSL on this connection" line reports the POOLER-to-Postgres hop and reads
// false through Supavisor; it says nothing about the client-to-pooler hop, which
// is the one `sslmode` in DATABASE_URL governs. Do not read it as "unencrypted".
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function q(label: string, sql: string) {
  console.log(`\n=== ${label}`);
  try {
    const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(sql);
    if (rows.length === 0) {
      console.log("  (none)");
      return;
    }
    for (const r of rows) {
      console.log(
        "  " +
          Object.entries(r)
            .map(([k, v]) => `${k}=${typeof v === "bigint" ? v.toString() : JSON.stringify(v)}`)
            .join("  ")
      );
    }
  } catch (e) {
    console.log("  ERROR:", (e as Error).message.split("\n")[0]);
  }
}

async function main() {
  await q(
    "Connection identity",
    `select current_user, session_user, current_database() as db, current_schema() as schema`
  );

  await q(
    "Current role attributes (rolbypassrls is what makes RLS safe for Prisma)",
    `select rolname, rolsuper, rolbypassrls, rolcanlogin
       from pg_roles where rolname = current_user`
  );

  await q(
    "Tables in public: RLS enabled? forced? who owns them?",
    `select c.relname as table, c.relrowsecurity as rls_enabled,
            c.relforcerowsecurity as rls_forced, pg_get_userbyid(c.relowner) as owner
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = current_schema() and c.relkind = 'r'
      order by c.relrowsecurity, c.relname`
  );

  await q(
    "Row-level security policies defined",
    `select schemaname, tablename, policyname, roles::text, cmd
       from pg_policies where schemaname = current_schema()`
  );

  await q(
    "Privileges granted to the PostgREST roles (anon / authenticated) on public tables",
    `select grantee, table_name, string_agg(distinct privilege_type, ',') as privs
       from information_schema.role_table_grants
      where table_schema = current_schema() and grantee in ('anon','authenticated','public')
      group by grantee, table_name
      order by grantee, table_name`
  );

  // NOTE the two columns. `effective` is true for anon on `public` even after the
  // lockdown, and that is NOT a finding: Postgres grants schema USAGE to the
  // pseudo-role PUBLIC by default (the `=U/...` entry in the ACL below), which
  // every role inherits, so a targeted `REVOKE USAGE ... FROM anon` is a silent
  // no-op. Closing it would mean `REVOKE USAGE ON SCHEMA public FROM PUBLIC`,
  // which reaches well beyond the two roles in question.
  //
  // It does not need closing to make the data safe. USAGE only permits resolving
  // names inside the schema; reading a row additionally requires a table grant,
  // and those are gone. The line that actually proves the door is shut is the
  // has_table_privilege check below.
  await q(
    "Schema USAGE: effective (may be inherited from PUBLIC) vs granted directly",
    `select n.nspname, r.rolname,
            has_schema_privilege(r.rolname, n.nspname, 'USAGE') as effective,
            coalesce(aclcontains(n.nspacl, makeaclitem(r.oid, r.oid, 'USAGE', false)), false) as direct_grant
       from pg_namespace n, pg_roles r
      where n.nspname in (current_schema(), 'public','storage','auth')
        and r.rolname in ('anon','authenticated')
      order by (n.nspname = current_schema()) desc, n.nspname, r.rolname`
  );

  await q(
    "The decisive check: can the PostgREST roles actually read the sensitive tables?",
    `select t.tbl as table_name,
            has_table_privilege('anon', format('%I.%I', current_schema(), t.tbl), 'SELECT') as anon_can_select,
            has_table_privilege('authenticated', format('%I.%I', current_schema(), t.tbl), 'SELECT') as auth_can_select
       from (values ('User'),('Session'),('PasswordResetToken'),('Message'),('MediaAsset')) as t(tbl)
      where to_regclass(format('%I.%I', current_schema(), t.tbl)) is not null`
  );

  await q(
    "Raw ACL on this schema (an `=U/` entry means USAGE is held by PUBLIC)",
    `select nspname, coalesce(nspacl::text, '(owner default)') as acl
       from pg_namespace where nspname = current_schema()`
  );

  await q(
    "Default privileges that would grant future tables to anon/authenticated",
    `select defaclrole::regrole::text as grantor, defaclnamespace::regnamespace::text as schema,
            defaclobjtype as objtype, defaclacl::text as acl
       from pg_default_acl`
  );

  await q(
    "SECURITY DEFINER functions in public (a classic privilege-escalation surface)",
    `select p.proname, pg_get_userbyid(p.proowner) as owner, p.prosecdef,
            coalesce(array_to_string(p.proconfig, ','), '(no search_path pinned)') as config
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = current_schema() and p.prosecdef`
  );

  await q(
    "Views in public owned by a privileged role (SECURITY DEFINER views bypass caller RLS)",
    `select c.relname as view, pg_get_userbyid(c.relowner) as owner
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = current_schema() and c.relkind in ('v','m')`
  );

  await q(
    "Extensions installed in the public schema",
    `select e.extname, n.nspname as schema
       from pg_extension e join pg_namespace n on n.oid = e.extnamespace
      order by n.nspname, e.extname`
  );

  await q("SSL on this connection", `select ssl, version from pg_stat_ssl where pid = pg_backend_pid()`);

  await verdict();
}

// The part that makes this more than a wall of text to skim.
//
// The lockdown migration enabled RLS on the tables that existed WHEN IT RAN. A
// table added by a later migration gets none, and the normal way to automate
// that — an event trigger on CREATE TABLE — needs superuser, which this role does
// not have (`rolsuper=false`, printed above). So enforcement lives here instead:
// a non-zero exit, which means this can be wired into CI or a pre-push hook and
// the gap gets caught by a machine rather than by remembering.
async function verdict() {
  console.log("\n=== VERDICT");
  const problems: string[] = [];

  const unprotected = await db.$queryRawUnsafe<{ table: string }[]>(
    `select c.relname as table
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = current_schema() and c.relkind = 'r' and c.relrowsecurity = false`
  );
  for (const row of unprotected) {
    problems.push(
      `${row.table}: RLS is OFF. Add "ALTER TABLE \\"${row.table}\\" ENABLE ROW LEVEL SECURITY;" to the migration that created it.`
    );
  }

  const granted = await db.$queryRawUnsafe<{ grantee: string; table_name: string }[]>(
    `select distinct grantee, table_name
       from information_schema.role_table_grants
      where table_schema = current_schema() and grantee in ('anon','authenticated')
      order by grantee, table_name`
  );
  for (const row of granted) {
    problems.push(`${row.table_name}: granted to "${row.grantee}" — reachable over the REST API.`);
  }

  // The one that re-opens everything quietly: if `postgres` hands new tables to
  // anon by default, the next migration undoes the lockdown without anyone
  // touching a grant. supabase_admin's own entry is excluded — it applies only to
  // objects supabase_admin itself creates, and it cannot be cleared by this role.
  const defaults = await db.$queryRawUnsafe<{ acl: string }[]>(
    `select defaclacl::text as acl
       from pg_default_acl
      where defaclnamespace = current_schema()::regnamespace
        and defaclrole = 'postgres'::regrole
        and (defaclacl::text like '%anon=%' or defaclacl::text like '%authenticated=%')`
  );
  if (defaults.length > 0) {
    problems.push(
      "postgres DEFAULT PRIVILEGES still grant new tables to anon/authenticated — the next migration would re-open the schema."
    );
  }

  if (problems.length === 0) {
    console.log("  OK — every table has RLS on, and anon/authenticated hold nothing.");
    return;
  }
  for (const p of problems) console.log(`  FAIL  ${p}`);
  console.log(`\n  ${problems.length} problem(s). Exiting non-zero.`);
  process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
