import { startServer, stopServer } from "./server-control";

// Ensures any stale server is down, then starts a fresh one against e2e-test.db.
// The build + seed happen in the `test:e2e` npm script before Playwright runs.
export default async function globalSetup() {
  await stopServer().catch(() => {});
  await startServer();
}
