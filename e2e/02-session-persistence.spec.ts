import { test, expect } from "@playwright/test";
import { login, logout, DEMO_EMAIL } from "./fixtures";

// Scenario 2: login persists across reload; logout clears the session.
test("session persists across reload and logout clears it", async ({ page }) => {
  await login(page, DEMO_EMAIL);
  await expect(page).toHaveURL(/\/discover/);

  // Reload — still authenticated (nav shows profile link, not log in).
  await page.reload();
  await expect(page.getByRole("link", { name: "profile" })).toBeVisible();

  // A protected page is reachable while logged in.
  await page.goto("/messages");
  await expect(page).toHaveURL(/\/messages/);

  // Logout clears the session.
  await logout(page);
  await expect(page).toHaveURL(/\/login/);

  // Protected page now redirects to login.
  await page.goto("/messages");
  await expect(page).toHaveURL(/\/login/);
});
