import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());
const schema = `hatch_e2e_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
if (!/^hatch_e2e_[0-9]+_[a-f0-9]{8}$/.test(schema)) throw new Error("Generated schema failed validation.");
if (!process.env.DIRECT_URL) throw new Error("DIRECT_URL is required for isolated tests.");
const direct = new URL(process.env.DIRECT_URL);
if (direct.port === "6543" || direct.searchParams.get("pgbouncer") === "true") throw new Error("DIRECT_URL must not use a transaction pooler.");

function scopedUrl() {
  const url = new URL(direct);
  url.searchParams.set("schema", schema);
  url.searchParams.set("connection_limit", "4");
  url.searchParams.set("pool_timeout", "30");
  return url.toString();
}
const isolatedUrl = scopedUrl();
const logPath = "e2e/.last-e2e-run.log";
writeFileSync(logPath, "");
const seedPassword = crypto.randomBytes(32).toString("base64url");
const env = { ...process.env, DATABASE_URL: isolatedUrl, DIRECT_URL: isolatedUrl, E2E_SCHEMA: schema, E2E_SEED_PASSWORD: seedPassword, ALLOW_DESTRUCTIVE_SEED: "e2e", NEXT_TELEMETRY_DISABLED: "1" };
const admin = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });

function run(modulePath, args, nodeArgs = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...nodeArgs, modulePath, ...args], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    for (const stream of [child.stdout, child.stderr]) stream?.on("data", (chunk) => appendFileSync(logPath, chunk));
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${modulePath} exited ${code}`)));
  });
}

let created = false;
try {
  if (existsSync("e2e/.server.pid")) throw new Error("An e2e server PID file already exists; clean up that run first.");
  const existing = await admin.$queryRaw`SELECT 1 FROM pg_namespace WHERE nspname=${schema}`;
  if (existing.length) throw new Error("Generated test schema already exists.");
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`); created = true;
  console.log(`[e2e] created isolated schema ${schema}`);
  await run("node_modules/prisma/build/index.js", ["migrate", "deploy"]);
  await run("prisma/seed.ts", [], ["--require", "./scripts/tsx-windows-shim.cjs", "--import", "tsx"]);
  await run("node_modules/next/dist/bin/next", ["build"]);
  await run("node_modules/@playwright/test/cli.js", ["test", ...process.argv.slice(2)]);
} finally {
  if (created) {
    await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    console.log(`[e2e] removed isolated schema ${schema}`);
  }
  await admin.$disconnect();
}
