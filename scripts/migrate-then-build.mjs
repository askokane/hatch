// Vercel's build command: compile, then apply pending migrations.
//
// WHY THIS EXISTS
//
// The build was `next build` alone, so migrations were applied by hand. That is
// not a small omission — it means the deployed code and the deployed schema are
// two separate manual steps that can be done in either order, or one and not the
// other. This project spent a full day with a database three migrations ahead of
// the code running against it, which was survivable only because every migration
// involved happened to be additive.
//
// ORDER: BUILD FIRST, THEN MIGRATE
//
// The obvious arrangement is migrate-then-build, and it is the wrong one. A
// compile error is far more likely than a migration failure, and migrating first
// means a broken build still mutates the database — producing exactly the drift
// this script exists to prevent. Building first means the common failure never
// touches Postgres.
//
// The deploy only goes live once this whole command exits 0, so migrations still
// finish before any traffic reaches the new code. Nothing is gained by moving
// them earlier.
//
// THE RULE THIS CREATES
//
// Migrations run while the PREVIOUS release is still serving. So every migration
// must be backward-compatible with the release before it: add columns, don't
// rename or drop them. Widen now, narrow in a later deploy once nothing reads the
// old shape. This is the expand/contract pattern, and it is not optional once
// migrations are automatic.

import { spawnSync } from "node:child_process";
import { join } from "node:path";

const isWin = process.platform === "win32";
const plan = process.argv.includes("--plan");

// Local bin rather than `npx`: npx would go to the network if the binary were
// missing, and a build step should fail loudly instead of silently fetching a
// different version of Prisma than the one in the lockfile.
function bin(name) {
  return join(process.cwd(), "node_modules", ".bin", isWin ? `${name}.cmd` : name);
}

function run(name, args) {
  const result = spawnSync(bin(name), args, {
    stdio: "inherit",
    shell: isWin,
    env: process.env,
  });
  if (result.error) {
    console.error(`[build] failed to start ${name}: ${result.error.message}`);
    process.exit(1);
  }
  return result.status ?? 1;
}

// Migrations run on PRODUCTION deploys only.
//
// Preview deployments are the hazard here, and it is not theoretical: this
// project has one database, so a preview build is pointed at the same Postgres
// production is. Without this guard, opening a pull request would migrate the
// live database — before anyone had reviewed the migration.
//
// VERCEL_ENV is set by Vercel to "production" | "preview" | "development", and is
// absent entirely on a developer's machine, so a local `npm run build` also skips.
const vercelEnv = process.env.VERCEL_ENV ?? null;
const shouldMigrate = vercelEnv === "production";

// Logged without credentials: enough to confirm in the build output which
// database was touched, which is the first question asked when a deploy goes
// wrong, and never enough to leak the password into Vercel's log retention.
function describeTarget() {
  const raw = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!raw) return "(no connection string)";
  try {
    const u = new URL(raw);
    const schema = u.searchParams.get("schema") ?? "public";
    return `${u.host}${u.pathname} schema=${schema}`;
  } catch {
    return "(unparseable connection string)";
  }
}

console.log(`[build] VERCEL_ENV=${vercelEnv ?? "(unset — local build)"}`);
if (!shouldMigrate) console.log("[build] skipping migrations: not a production deploy");

// Resolved BEFORE the build rather than after it, so a misconfiguration costs a
// second rather than a full compile.
//
// schema.prisma declares `directUrl = env("DIRECT_URL")`, which is a DIFFERENT
// variable from the pooled URL the app serves on. If Vercel only has
// DATABASE_URL, falling back to it is usually right — but only if it is a
// SESSION connection. A transaction pooler (Supabase port 6543, or
// pgbouncer=true) does not hold session state, and running migrations across it
// produces failures that look like anything but the real cause. So the fallback
// is taken loudly, and refused when the URL is one migrations must not use.
if (shouldMigrate && !process.env.DIRECT_URL) {
  const pooled = process.env.DATABASE_URL;
  if (!pooled) {
    console.error(
      "[build] Neither DIRECT_URL nor DATABASE_URL is set, so migrations cannot run. " +
        "Set them in Vercel → Settings → Environment Variables (Production)."
    );
    process.exit(1);
  }

  let transactionPooler = false;
  try {
    const u = new URL(pooled);
    transactionPooler = u.port === "6543" || u.searchParams.get("pgbouncer") === "true";
  } catch {
    console.error("[build] DATABASE_URL is not a parseable connection string.");
    process.exit(1);
  }

  if (transactionPooler) {
    console.error(
      "[build] DIRECT_URL is unset and DATABASE_URL points at a TRANSACTION pooler " +
        "(port 6543 / pgbouncer=true), which does not preserve session state and is not " +
        "safe to migrate over. Set DIRECT_URL to the direct/session connection (port 5432) " +
        "in Vercel → Settings → Environment Variables (Production)."
    );
    process.exit(1);
  }

  console.warn(
    "[build] DIRECT_URL is unset; falling back to DATABASE_URL, which is a session " +
      "connection and safe to migrate over. Set DIRECT_URL explicitly to remove the guesswork."
  );
  process.env.DIRECT_URL = pooled;
}

// Announced only once the connection string has survived the checks above, so
// the log never says "will apply migrations to X" immediately before refusing to.
if (shouldMigrate) {
  console.log(`[build] will apply pending migrations to ${describeTarget()} after the build succeeds`);
}

if (plan) {
  console.log("[build] --plan: exiting without building or migrating.");
  process.exit(0);
}

const buildStatus = run("next", ["build"]);
if (buildStatus !== 0) {
  console.error("[build] next build failed; database left untouched.");
  process.exit(buildStatus);
}

if (!shouldMigrate) process.exit(0);

const migrateStatus = run("prisma", ["migrate", "deploy"]);
if (migrateStatus !== 0) {
  // Fail closed. A non-zero exit here aborts the deploy, so the release that is
  // currently serving keeps serving — which is the correct outcome when the
  // schema the new code expects could not be established.
  console.error("[build] migrations failed; deploy aborted, previous release still live.");
  process.exit(migrateStatus);
}

console.log("[build] migrations applied.");
