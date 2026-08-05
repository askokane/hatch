import { spawn } from "node:child_process";
import { writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import http from "node:http";

// Cross-process server controller for the e2e suite. Because Playwright runs
// global setup, each spec, and teardown in separate processes, the running
// server's PID is persisted to a file so any of them can stop/restart it.

const PORT = 3100;
const PID_FILE = join(process.cwd(), "e2e", ".server.pid");
const isWin = process.platform === "win32";

// The e2e server inherits DATABASE_URL/DIRECT_URL from this process, which
// `npm run test:e2e` has already pointed at the isolated test schema (see
// scripts/with-e2e-db.mjs). Next does not override variables already present in
// process.env, so .env cannot leak the production URL back in here.
function envForServer() {
  if (!process.env.DATABASE_URL?.includes("schema=")) {
    throw new Error(
      "Refusing to start the e2e server: DATABASE_URL has no explicit schema, so it " +
        "may be pointing at production. Run the suite via `npm run test:e2e`."
    );
  }
  return {
    ...process.env,
    NODE_ENV: "production" as const,
    DEV_EMAIL_ALLOWLIST: "@stateu.edu,@hatchdemo.edu,@e2e.edu",
    APP_URL: `http://localhost:${PORT}`,
    PORT: String(PORT),
  };
}

export function ping(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${PORT}/`, (res) => {
      res.resume();
      resolve((res.statusCode ?? 500) < 500);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitUntilReady(timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await ping()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Server did not become ready in time");
}

export async function startServer(): Promise<void> {
  // Never start on top of a server this run did not spawn.
  //
  // Without this the suite can report a completely false result: an orphan from a
  // previous run (one killed before global teardown, so its PID file was never
  // consumed) keeps holding the port, the freshly spawned `next start` silently
  // fails to bind, and waitUntilReady() is satisfied by the ORPHAN's reply. Every
  // spec then runs green or red against a stale build while appearing to test the
  // working tree.
  //
  // There are two ways to reach an occupied port, and they deserve different
  // answers. If a PID file is present, the occupant is an orphan THIS HARNESS
  // spawned and then lost — that is not ambiguous, and reclaiming it is strictly
  // better than making the next person run taskkill by hand. (An interrupted run
  // leaves the file behind precisely because teardown is what removes it.) With
  // no PID file the occupant is something else entirely, and guessing is how you
  // kill a developer's own dev server, so that still refuses.
  if (await ping()) {
    if (existsSync(PID_FILE)) {
      await stopServer();
      if (await ping()) {
        throw new Error(
          `Port ${PORT} is still held after stopping the orphaned server from a previous run. ` +
            `Kill the process holding it and try again.`
        );
      }
    } else {
      throw new Error(
        `Refusing to start the e2e server: something is already listening on port ${PORT}, ` +
          `and it was not started by this harness (no PID file). Testing against it would ` +
          `report results for code that is not in this working tree. Kill it and try again.`
      );
    }
  }

  const nextBin = join(process.cwd(), "node_modules", ".bin", isWin ? "next.cmd" : "next");
  const child = spawn(nextBin, ["start", "-p", String(PORT)], {
    env: envForServer(),
    cwd: process.cwd(),
    detached: !isWin,
    stdio: "ignore",
    shell: isWin,
  });
  child.unref();
  if (child.pid) writeFileSync(PID_FILE, String(child.pid), "utf8");
  await waitUntilReady();
}

export async function stopServer(): Promise<void> {
  if (!existsSync(PID_FILE)) return;
  const pid = Number(readFileSync(PID_FILE, "utf8").trim());
  if (!Number.isFinite(pid)) return;
  try {
    if (isWin) {
      // Kill the whole tree (next start may spawn workers).
      spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", shell: true });
    } else {
      process.kill(-pid, "SIGKILL");
    }
  } catch {
    // already gone
  }
  rmSync(PID_FILE, { force: true });
  // Wait for the port to actually free up.
  const start = Date.now();
  while (Date.now() - start < 15_000) {
    if (!(await ping())) return;
    await new Promise((r) => setTimeout(r, 400));
  }
}

export async function restartServer(): Promise<void> {
  await stopServer();
  await new Promise((r) => setTimeout(r, 1000));
  await startServer();
}
