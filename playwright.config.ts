import { defineConfig, devices } from "@playwright/test";

// The e2e suite runs against an isolated Postgres schema, seeded fresh by the
// `pretest:e2e` script — never the production one (see scripts/with-e2e-db.mjs,
// and the guard in e2e/server-control.ts). Spec 03 restarts the server itself,
// so we do NOT let Playwright manage a webServer — we start/stop it in-test to
// prove persistence survives a real process restart.
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  // The suite runs against a hosted Postgres, so every round-trip carries real
  // network latency; the multi-step signup/onboarding flows add up well past a
  // local-database budget.
  timeout: 180_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    actionTimeout: 15_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
