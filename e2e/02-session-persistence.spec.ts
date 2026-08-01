import { test, expect } from "@playwright/test";
import { login, logout, DEMO_EMAIL } from "./fixtures";

// Scenario 2: login persists across reload; logout clears the session.
test("session persists across reload and logout clears it", async ({ page }) => {
  await login(page, DEMO_EMAIL);
  await expect(page).toHaveURL(/\/discover/);

  // Reload — still authenticated. The signed-in tell is the nav's account menu
  // (your avatar), which replaced the standalone profile / log out links; the
  // profile link itself now lives inside it.
  await page.reload();
  const accountMenu = page.getByRole("button", { name: /^account menu/i });
  await expect(accountMenu).toBeVisible();
  await expect(page.getByRole("link", { name: /^log in$/i })).toHaveCount(0);

  await accountMenu.click();
  // Exact: "view public profile" sits right below it and would match a substring.
  await expect(page.getByRole("menuitem", { name: "profile", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

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
