// Runs a command against an ISOLATED test schema, never the production one.
//
// The e2e suite seeds (i.e. wipes) the database it points at. Since .env holds
// the real deployment credentials, running the suite bare would destroy live
// data. This wrapper reads .env, rewrites DATABASE_URL / DIRECT_URL to target a
// dedicated Postgres schema (E2E_SCHEMA, default "hatch_e2e"), and execs the
// given command with that environment.
//
//   node scripts/with-e2e-db.mjs prisma migrate deploy
//   node scripts/with-e2e-db.mjs playwright test
//
// Everything downstream inherits it: the Next server the harness spawns, the
// seed script, and e2e/db.ts. Next.js does not override variables that are
// already present in process.env, so .env cannot leak the production URL back in.

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const SCHEMA = process.env.E2E_SCHEMA ?? "hatch_e2e";

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    out[trimmed.slice(0, eq)] = trimmed.slice(eq + 1).replace(/^["']|["']$/g, "");
  }
  return out;
}

function withSchema(url) {
  const u = new URL(url);
  u.searchParams.set("schema", SCHEMA);
  // Prisma otherwise opens a pool of (cores * 2 + 1) connections PER client, and
  // the suite runs several at once: the Next server, the Playwright process, and
  // — around scenario 03's restart — briefly a second server. That comfortably
  // exceeds a hosted pool and surfaces as "max clients reached", failing every
  // spec after it.
  //
  // 4 is a deliberate middle: 1 serialises every query behind a single
  // connection and made page loads slow enough to blow the test timeouts, while
  // the worst case here (three clients alive at once) still stays under a
  // 15-connection pool.
  u.searchParams.set("connection_limit", "4");
  return u.toString();
}

const fileEnv = parseEnvFile(".env");
const base = { ...fileEnv, ...process.env };

if (!base.DATABASE_URL) {
  console.error("with-e2e-db: DATABASE_URL is not set (checked .env and the environment).");
  process.exit(1);
}

const env = {
  ...base,
  DATABASE_URL: withSchema(base.DATABASE_URL),
  DIRECT_URL: withSchema(base.DIRECT_URL ?? base.DATABASE_URL),
};

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error("with-e2e-db: no command given.");
  process.exit(1);
}

console.log(`[with-e2e-db] schema=${SCHEMA} → ${cmd} ${args.join(" ")}`);

const child = spawn(cmd, args, { env, stdio: "inherit", shell: true });
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
