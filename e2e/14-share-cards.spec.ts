import { test, expect } from "@playwright/test";
import { login } from "./fixtures";
import { testDb, findConnectedRolePair } from "./db";

// Scenario 14: sharing a project and a profile into an existing thread.
//
// The thing under test is that a share stops being a URL. It has to survive the
// whole round trip — composed on the server from the target's own row, stored on
// the message, serialized by the poll, and rendered as a card the OTHER person
// can see and follow — so both directions are checked with two real browser
// contexts rather than by reading the database back.
test("share a project and a profile into a thread as cards", async ({ browser }) => {
  test.setTimeout(180_000);

  const pair = await findConnectedRolePair();
  expect(pair).toBeTruthy();
  const { owner, requester, threadId, projectSlug } = pair!;

  const project = await testDb.project.findUnique({
    where: { slug: projectSlug },
    select: { name: true },
  });
  expect(project).toBeTruthy();

  // A third party to share — nobody in this thread, so the card cannot be
  // confused with either participant's own identity in the transcript.
  const bystander = await testDb.profile.findFirst({
    where: { id: { notIn: [owner.profileId, requester.profileId] }, isDiscoverable: true },
    select: { handle: true, name: true },
  });
  expect(bystander).toBeTruthy();

  const senderCtx = await browser.newContext();
  const sender = await senderCtx.newPage();
  await login(sender, owner.email);

  // --- Share a PROJECT from its own page ---
  await sender.goto(`/p/${projectSlug}`);
  await sender.getByRole("button", { name: /^share$/i }).click();

  const sheet = sender.getByRole("dialog", { name: new RegExp(`share ${project!.name}`, "i") });
  await expect(sheet).toBeVisible();

  const row = sheet.locator("li").filter({ hasText: `@${requester.handle}` });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: /^send$/i }).click();
  // The row states its own outcome; the sheet stays open so more can be sent.
  await expect(row.getByText(/sent/i)).toBeVisible({ timeout: 30_000 });
  // Scoped to the dialog: the project page has its own "Close role" controls.
  await sheet.getByRole("button", { name: "Close", exact: true }).click();

  // --- Share a PROFILE from someone else's profile page ---
  await sender.goto(`/u/${bystander!.handle}`);
  await sender.getByRole("button", { name: /^share$/i }).click();
  const profileSheet = sender.getByRole("dialog", {
    name: new RegExp(`share ${bystander!.name}`, "i"),
  });
  const profileRow = profileSheet.locator("li").filter({ hasText: `@${requester.handle}` });
  await profileRow.getByRole("button", { name: /^send$/i }).click();
  await expect(profileRow.getByText(/sent/i)).toBeVisible({ timeout: 30_000 });
  await profileSheet.getByRole("button", { name: "Close", exact: true }).click();

  // --- The thread list describes a share rather than showing a blank line ---
  // A share message has an empty body, so this is the surface that would silently
  // look like the conversation went quiet if the preview were body-only.
  await sender.goto("/messages");
  await expect(sender.getByText(`You shared @${bystander!.handle}`)).toBeVisible();

  // --- The sender's own transcript shows both cards ---
  await sender.goto(`/messages/${threadId}`);
  const projectCard = sender.getByRole("link", { name: new RegExp(project!.name, "i") });
  await expect(projectCard.first()).toBeVisible();
  await expect(sender.getByText(/view project/i).first()).toBeVisible();
  await expect(sender.getByText(/view profile/i).first()).toBeVisible();

  // --- The RECIPIENT sees the cards, and the card is the link ---
  const recipientCtx = await browser.newContext();
  const recipient = await recipientCtx.newPage();
  await login(recipient, requester.email);
  await recipient.goto(`/messages/${threadId}`);

  await expect(recipient.getByText(bystander!.name).first()).toBeVisible({ timeout: 30_000 });
  await expect(recipient.getByText(/view profile/i).first()).toBeVisible();

  // The transcript must OPEN on its newest message. This is asserted on the
  // scroll offset rather than on visibility, because a card further up the
  // transcript is still "visible" to Playwright — it is in the DOM and not
  // clipped to zero — while a reader would have to go looking for it. The
  // regression this guards against did exactly that: the view opened on the
  // OLDEST message, so a card someone had just sent was below the fold.
  const atBottom = await recipient.evaluate(() => {
    const list = document.querySelector('[aria-live="polite"]');
    if (!list) return false;
    return list.scrollTop + list.clientHeight >= list.scrollHeight - 4;
  });
  expect(atBottom).toBe(true);

  // Following the profile card lands on the profile it names. This is the whole
  // affordance the feature exists for, so it is asserted rather than assumed.
  await recipient
    .getByRole("link", { name: new RegExp(bystander!.name, "i") })
    .first()
    .click();
  await recipient.waitForURL(new RegExp(`/u/${bystander!.handle}`));

  await senderCtx.close();
  await recipientCtx.close();
});
