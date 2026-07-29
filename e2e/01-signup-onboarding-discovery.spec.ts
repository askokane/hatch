import { test, expect } from "@playwright/test";
import { signup, completeOnboarding, login, DEMO_EMAIL } from "./fixtures";

// Scenario 1: signup -> onboarding -> profile visible in discovery. There is no
// verification step; a new account is usable the moment it exists.
test("signup, onboard, and appear in discovery", async ({ page, browser }) => {
  const unique = Date.now().toString(36);
  const email = `newbuilder${unique}@e2e.edu`;
  const handle = `newbuilder-${unique}`;
  const name = `New Builder ${unique}`;

  await signup(page, email);

  await page.goto("/onboarding");
  await completeOnboarding(page, {
    name,
    handle,
    school: "State University",
    skills: ["React", "TypeScript", "Node"],
    learning: ["Rust"],
  });

  // Own profile persisted and is reachable (own handle redirects to /profile).
  await page.goto(`/u/${handle}`);
  await page.waitForURL(/\/profile/);
  await expect(page.getByText(`@${handle}`)).toBeVisible();

  // Discovery visibility is verified from ANOTHER user's viewpoint — a viewer does
  // not appear in their own People results, so we check as a seeded user.
  const viewerCtx = await browser.newContext();
  const viewer = await viewerCtx.newPage();
  await login(viewer, DEMO_EMAIL);
  await viewer.goto(`/discover?tab=people&school=${encodeURIComponent("State University")}`);
  await expect(viewer.getByText(name).first()).toBeVisible();
  await viewerCtx.close();
});
