import { test, expect } from "@playwright/test";
import { login, DEMO_EMAIL } from "./fixtures";
import { testDb } from "./db";

// Scenario 5: authorization. A logged-in attacker submitting another user's IDs
// must get a 403 or redirect, never data.
test("authorization: forced IDs are rejected, never leak data", async ({ page, browser }) => {
  // Demo's profile id.
  const demoUser = await testDb.user.findUnique({
    where: { email: DEMO_EMAIL },
    include: { profile: true },
  });
  const demoProfileId = demoUser!.profile!.id;

  // A thread the demo account is NOT a member of.
  const foreignThread = await testDb.thread.findFirst({
    where: { members: { none: { profileId: demoProfileId } } },
    include: { members: true },
  });
  expect(foreignThread).toBeTruthy();
  const foreignThreadId = foreignThread!.id;

  // A project the demo account is NOT a member of.
  const foreignProject = await testDb.project.findFirst({
    where: { memberships: { none: { profileId: demoProfileId } } },
    select: { slug: true },
  });
  expect(foreignProject).toBeTruthy();

  // Another user's handle (not demo).
  const otherProfile = await testDb.profile.findFirst({
    where: { id: { not: demoProfileId } },
    select: { handle: true },
  });

  await login(page, DEMO_EMAIL);

  // (1) Reading a foreign thread's messages via the API route -> 403, no data.
  const apiRead = await page.request.get(`/api/threads/${foreignThreadId}/messages`);
  expect(apiRead.status()).toBe(403);

  // (2) Posting to a foreign thread via the API route -> 403.
  const apiPost = await page.request.post(`/api/threads/${foreignThreadId}/messages`, {
    data: { body: "I should not be able to post here." },
  });
  expect(apiPost.status()).toBe(403);

  // (3) Navigating to a foreign thread page by ID -> redirected to /messages,
  //     never shows the thread composer.
  await page.goto(`/messages/${foreignThreadId}`);
  await expect(page).toHaveURL(/\/messages$/);

  // (4) A non-member visiting a foreign project sees NO update composer
  //     (the server-side postUpdate check also blocks it, but the UI gate proves
  //     membership is required).
  await page.goto(`/p/${foreignProject!.slug}`);
  await expect(page.getByText("Post an update")).toHaveCount(0);
  // And no "Edit project" control for a non-owner.
  await expect(page.getByRole("link", { name: /edit project/i })).toHaveCount(0);

  // (5) A cannot edit another user's profile — no edit control on their page.
  await page.goto(`/u/${otherProfile!.handle}`);
  await expect(page.getByRole("button", { name: /edit profile/i })).toHaveCount(0);

  // (6) Admin route is gated: demo (non-admin) is redirected away.
  await page.goto("/admin/reports");
  await expect(page).toHaveURL(/\/discover/);

  // (7) Unauthenticated access to admin route redirects to login.
  const anonCtx = await browser.newContext();
  const anon = await anonCtx.newPage();
  await anon.goto("/admin/reports");
  await expect(anon).toHaveURL(/\/login/);
  await anonCtx.close();
});
