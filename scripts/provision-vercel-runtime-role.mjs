// One-time Vercel production setup. Run with Node's --env-file pointing at a
// Vercel production env pull. It creates the least-privileged runtime role and
// replaces only Vercel's DATABASE_URL; DIRECT_URL remains the migration owner.

import crypto from "node:crypto";
import { writeFileSync } from "node:fs";
import prisma from "@prisma/client";

const { PrismaClient } = prisma;

if (!process.env.DIRECT_URL) throw new Error("DIRECT_URL is required.");

const password = crypto.randomBytes(36).toString("base64url");
const escapedPassword = password.replace(/'/g, "''");
const db = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });

try {
  const statements = [
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hatch_runtime') THEN CREATE ROLE hatch_runtime LOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOSUPERUSER NOBYPASSRLS; END IF; END $$`,
    `ALTER ROLE hatch_runtime PASSWORD '${escapedPassword}'`,
    "GRANT CONNECT ON DATABASE postgres TO hatch_runtime",
    "GRANT USAGE ON SCHEMA public TO hatch_runtime",
    "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hatch_runtime",
    "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO hatch_runtime",
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hatch_runtime",
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO hatch_runtime",
    `DO $$ DECLARE t record; BEGIN FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t.tablename AND policyname='hatch_runtime_access') THEN EXECUTE format('CREATE POLICY hatch_runtime_access ON public.%I FOR ALL TO hatch_runtime USING (true) WITH CHECK (true)', t.tablename); END IF; END LOOP; END $$`,
  ];
  for (const statement of statements) await db.$executeRawUnsafe(statement);

  const runtimeUrl = new URL(process.env.DIRECT_URL);
  // Supabase pooler usernames are `role.project-ref`; replacing the whole
  // username loses the tenant identifier and the pooler refuses the connection.
  const sourceUser = decodeURIComponent(runtimeUrl.username);
  const tenantSuffix = sourceUser.includes(".") ? `.${sourceUser.split(".").slice(1).join(".")}` : "";
  runtimeUrl.username = `hatch_runtime${tenantSuffix}`;
  runtimeUrl.password = password;
  writeFileSync(".vercel/runtime-database-url.txt", `${runtimeUrl.toString()}\n`, { mode: 0o600 });
  console.log("Configured the production runtime role. Upload the generated URL through the Vercel CLI.");
} finally {
  await db.$disconnect();
}
