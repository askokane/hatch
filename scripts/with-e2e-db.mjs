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

  // FORCE THE SESSION POOLER. This is a data-safety requirement, not a tuning
  // choice, and it must not be "simplified" back to inheriting whatever
  // DATABASE_URL happens to be.
  //
  // The suite isolates itself by schema, and the seed WIPES the schema it lands
  // in. That isolation is carried by the connection's search_path — and a
  // transaction pooler (port 6543, pgbouncer=true) does not preserve it. Under
  // concurrency it hands transactions to server connections whose search_path
  // has been reset, which was measured directly:
  //
  //   12 concurrent `SELECT current_schema()` through :6543
  //     -> schemas seen = ["hatch_e2e", "public"]
  //
  // "public" there is the real database. Pointed at the transaction pooler, this
  // suite would delete live user data on a run. The application itself is free
  // to use :6543 — it only ever uses the default schema, so it has nothing to
  // leak — but anything that relies on `schema=` must stay on the session port.
  u.port = "5432";
  u.searchParams.delete("pgbouncer");

  // Session mode caps the whole project at 15 client connections, and the suite
  // runs several at once: the Next server, the Playwright process, and — around
  // scenario 03's restart — briefly a second server. Prisma would otherwise open
  // (cores * 2 + 1) per client and trip "max clients reached", failing every
  // spec after it.
  //
  // 4 is a deliberate middle: 1 serialises every query behind a single
  // connection and made page loads slow enough to blow the test timeouts, while
  // the worst case here (three clients alive at once) still stays under 15.
  u.searchParams.set("connection_limit", "4");

  // Wait for a connection rather than failing for one. With the database a few
  // hundred milliseconds away, a handful of queries can hold all four
  // connections for longer than Prisma's 10s default, which surfaced as
  // "Timed out fetching a new connection from the connection pool" and failed
  // spec 10 — a queueing problem wearing the costume of a product bug. Raising
  // the wait is the safe half of the fix: opening more connections instead would
  // push the suite's three concurrent clients past the 15-connection ceiling.
  u.searchParams.set("pool_timeout", "30");
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
