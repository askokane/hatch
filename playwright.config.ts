import { defineConfig, devices } from "@playwright/test";

// The e2e suite runs against its own SQLite file (e2e-test.db), seeded fresh by
// the `pretest:e2e` script. Spec 03 restarts the server itself (see fixtures),
// so we do NOT let Playwright manage a webServer — we start/stop it in-test to
// prove file-based persistence survives a real process restart.
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    actionTimeout: 15_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
