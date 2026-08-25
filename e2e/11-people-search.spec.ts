import { test, expect } from "@playwright/test";
import { login, DEMO_EMAIL } from "./fixtures";

// Scenario 11: finding a person on /discover.
//
// The search box used to query bios and nothing else, behind a submit button.
// Typing a name — the first thing anyone does — returned "no people match".
// These tests hold the two properties that fixed it: search covers the fields a
// person is actually identified by, and it runs as you type.

test("search finds a person by name, as you type, without a submit", async ({ page }) => {
  await login(page, DEMO_EMAIL);
  await page.goto("/discover?tab=people");

  const box = page.getByRole("textbox", { name: /search people/i });
  await box.fill("Maya");

  // No button pressed, no Enter: the results follow the typing.
  await expect(page.locator("article").filter({ hasText: "Maya Chen" }).first()).toBeVisible();
  await expect(page).toHaveURL(/q=Maya/);

  // The query is visible as a removable filter, and removing it restores the
  // unfiltered list rather than leaving the box and the results disagreeing.
  const chip = page.getByRole("button", { name: /remove filter/i }).first();
  await chip.click();
  await expect(box).toHaveValue("");
  await expect(page).not.toHaveURL(/q=/);
});

// A name is one way in; a skill and a school are the others. All three used to
// miss unless the word also happened to appear in the person's bio.
test("search also matches handles, skills and schools", async ({ page }) => {
  await login(page, DEMO_EMAIL);

  await page.goto("/discover?tab=people&q=maya_chen");
  await expect(page.locator("article").filter({ hasText: "Maya Chen" }).first()).toBeVisible();

  await page.goto("/discover?tab=people&q=Lakeside");
  await expect(page.locator("article").filter({ hasText: "Sofia Marino" }).first()).toBeVisible();
});

// Refining a search must not fill the history stack: leaving the page has to
// take one Back, not one per keystroke-batch.
test("refining a search does not pile up history entries", async ({ page }) => {
  await login(page, DEMO_EMAIL);
  await page.goto("/discover?tab=people");

  const box = page.getByRole("textbox", { name: /search people/i });
  await box.fill("Maya");
  await expect(page).toHaveURL(/q=Maya/);
  await box.fill("Sofia");
  await expect(page).toHaveURL(/q=Sofia/);

  await page.goBack();
  await expect(page).not.toHaveURL(/q=/);
});

// The narrowing filters are folded away by default — most searches are a name or
// a skill. Folding them is only safe while a filter that IS applied stays
// legible, so the toggle carries a count and a filtered URL arrives open.
test("the filters fold away, and stay accounted for when they are set", async ({ page }) => {
  await login(page, DEMO_EMAIL);
  await page.goto("/discover?tab=people");

  const toggle = page.locator('button[aria-controls="people-filters"]');
  const panel = page.locator("#people-filters");

  await expect(panel).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  await toggle.click();
  await expect(panel).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");

  // A shared link that already carries a filter opens with it visible and counted.
  await page.goto("/discover?tab=people&intent=MENTOR");
  await expect(page.locator("#people-filters")).toBeVisible();
  await expect(page.locator('button[aria-controls="people-filters"]')).toContainText("[1]");
});
