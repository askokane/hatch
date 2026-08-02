import { test, expect } from "@playwright/test";
import { login } from "./fixtures";
import { findConnectedRolePair } from "./db";

// Bug 5: a pair who have already connected must not be offered "Request intro"
// anywhere. The state is resolved once (lib/relationship.ts) and every surface
// reads it, so this walks all three surfaces for the same pair.
test("a connected pair reads as connected on every surface", async ({ page }) => {
  test.setTimeout(120_000);

  const pair = await findConnectedRolePair();
  expect(pair).toBeTruthy();
  const { threadId, projectSlug, owner, requester } = pair!;

  // Viewing as the requester, looking at the owner they already talk to.
  await login(page, requester.email);

  // (1) The project page — the surface from the bug report. It used to offer a
  //     bare "Request intro" because it only ever asked "am I a member?".
  await page.goto(`/p/${projectSlug}`);
  await expect(page.getByRole("button", { name: /request intro/i })).toHaveCount(0);
  const projectMessageLink = page.getByRole("link", { name: new RegExp(`message ${owner.name}`, "i") });
  await expect(projectMessageLink.first()).toBeVisible();
  await expect(projectMessageLink.first()).toHaveAttribute("href", `/messages/${threadId}`);

  // (2) The owner's profile.
  await page.goto(`/u/${owner.handle}`);
  await expect(page.getByRole("button", { name: /request intro/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^message$/i })).toHaveAttribute(
    "href",
    `/messages/${threadId}`
  );
  await expect(page.getByText(/^connected$/i)).toBeVisible();

  // (3) The discovery people feed.
  await page.goto("/discover?tab=people");
  const card = page.locator("article").filter({ hasText: owner.name }).first();
  if (await card.count()) {
    await expect(card.getByText(/connected/i)).toBeVisible();
  }

  // And the inverse direction agrees — the owner sees the requester as connected too.
  await page.goto("/messages");
  await expect(page.getByText(owner.name).first()).toBeVisible();
});

// A pending outbound request must read as pending, not as "never asked".
test("a pending outbound request is reflected on the project and profile", async ({ page, browser }) => {
  test.setTimeout(180_000);

  const pair = await findConnectedRolePair();
  expect(pair).toBeTruthy();
  const { owner } = pair!;

  // A fresh account so the pair genuinely starts from nothing.
  const unique = Date.now().toString(36);
  const email = `pending${unique}@e2e.edu`;
  const { signupAndOnboard } = await import("./fixtures");
  await signupAndOnboard(page, {
    email,
    name: `Pending Tester ${unique}`,
    handle: `pending_${unique}`,
  });

  // Find a project this owner owns that has an open role.
  const { testDb } = await import("./db");
  const role = await testDb.openRole.findFirst({
    where: {
      status: "OPEN",
      project: { visibility: "PUBLIC", memberships: { some: { isOwner: true, profileId: owner.profileId } } },
    },
    include: { project: { select: { slug: true } } },
  });
  expect(role).toBeTruthy();
  const slug = role!.project.slug;

  // Before requesting: the intro affordance is offered.
  await page.goto(`/p/${slug}`);
  await expect(page.getByRole("button", { name: /request intro/i }).first()).toBeVisible();

  await page.getByRole("button", { name: /request intro/i }).first().click();
  await page
    .getByLabel(/your note/i)
    .fill("Checking that a sent request is remembered by every surface, not just the requests page.");
  await page.getByRole("button", { name: /send request/i }).click();
  await expect(page.getByText(/intro request sent/i)).toBeVisible();

  // After requesting: the same page now reports it, instead of inviting a second one.
  await page.reload();
  await expect(page.getByRole("button", { name: /request intro/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /request sent/i }).first()).toBeVisible();

  // The owner's profile agrees.
  await page.goto(`/u/${owner.handle}`);
  await expect(page.getByRole("button", { name: /request intro/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /request sent/i }).first()).toBeVisible();

  // And the recipient sees it as awaiting their reply.
  const ownerCtx = await browser.newContext();
  const ownerPage = await ownerCtx.newPage();
  await login(ownerPage, owner.email);
  await ownerPage.goto(`/u/pending_${unique}`);
  await expect(ownerPage.getByRole("link", { name: /respond to request/i })).toBeVisible();
  await ownerCtx.close();
});
