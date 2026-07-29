import { test, expect } from "@playwright/test";
import { login, composer } from "./fixtures";
import { findConnectedRolePair, testDb } from "./db";

// Bug 6: a block is disclosed to the blocker and hidden from the blocked.
//
// The blocked party must be *prevented* from messaging while learning nothing —
// no banner, no "blocked" wording, no read-only-because-of-a-block explanation.
// The assertions therefore check both what the blocker sees and what the blocked
// user must NOT see.
test("blocking is visible to the blocker and invisible to the blocked", async ({ browser }) => {
  test.setTimeout(180_000);

  const pair = await findConnectedRolePair();
  expect(pair).toBeTruthy();
  const { threadId, owner, requester } = pair!;

  // Start clean in case an earlier run left state behind.
  await testDb.block.deleteMany({
    where: {
      OR: [
        { blockerProfileId: owner.profileId, blockedProfileId: requester.profileId },
        { blockerProfileId: requester.profileId, blockedProfileId: owner.profileId },
      ],
    },
  });

  const blockerCtx = await browser.newContext();
  const blockedCtx = await browser.newContext();
  const blocker = await blockerCtx.newPage();
  const blocked = await blockedCtx.newPage();

  await login(blocker, owner.email);
  await login(blocked, requester.email);

  // --- The blocker blocks from the other party's profile ---
  await blocker.goto(`/u/${requester.handle}`);
  await blocker.getByRole("button", { name: /^block$/i }).click();
  await blocker.getByRole("button", { name: /^confirm$/i }).click();
  await expect(blocker.getByText(new RegExp(`blocked ${requester.name}`, "i")).first()).toBeVisible();

  // The blocker is told plainly, on the profile and in the thread.
  await blocker.goto(`/u/${requester.handle}`);
  await expect(blocker.getByText(new RegExp(`you blocked ${requester.name}`, "i"))).toBeVisible();
  await expect(blocker.getByRole("button", { name: new RegExp(`unblock ${requester.name}`, "i") })).toBeVisible();

  await blocker.goto(`/messages/${threadId}`);
  await expect(blocker.getByText(/you blocked/i).first()).toBeVisible();

  // And it is manageable from settings — otherwise the block would be one-way,
  // since the blocked profile is gone from discovery.
  await blocker.goto("/settings");
  await expect(blocker.getByText(requester.name).first()).toBeVisible();
  await expect(blocker.getByRole("button", { name: new RegExp(`unblock ${requester.name}`, "i") })).toBeVisible();

  // --- The blocked user learns nothing ---
  await blocked.goto(`/messages/${threadId}`);
  await expect(blocked.getByText(/you can't send messages in this conversation/i)).toBeVisible();

  // None of the disclosing wording may appear anywhere on their view. Matching
  // the bare word "block" would be a false positive (tags like "blockchain"),
  // so this targets the phrasings that would actually give the block away.
  const pageText = (await blocked.locator("body").innerText()).toLowerCase();
  for (const tell of ["you blocked", "blocked you", "has blocked", "is blocked", "read-only"]) {
    expect(pageText, `blocked user must not see "${tell}"`).not.toContain(tell);
  }

  // The composer is genuinely gone, not merely styled as disabled.
  await expect(composer(blocked)).toHaveCount(0);

  // The server refuses a direct API post too, with the same non-disclosing wording.
  const forced = await blocked.request.post(`/api/threads/${threadId}/messages`, {
    data: { body: "Trying to get through anyway." },
  });
  expect(forced.status()).toBe(400);
  const forcedBody = await forced.json();
  expect(String(forcedBody.error).toLowerCase()).not.toContain("block");

  // The blocker's own attempt is refused too — but is told exactly why.
  const blockerForced = await blocker.request.post(`/api/threads/${threadId}/messages`, {
    data: { body: "And neither can I." },
  });
  expect(blockerForced.status()).toBe(400);
  expect(String((await blockerForced.json()).error).toLowerCase()).toContain("blocked");

  // --- Unblocking restores the thread ---
  await blocker.goto("/settings");
  await blocker.getByRole("button", { name: new RegExp(`unblock ${requester.name}`, "i") }).click();
  await expect(blocker.getByText(new RegExp(`unblocked ${requester.name}`, "i")).first()).toBeVisible();

  await blocked.goto(`/messages/${threadId}`);
  await expect(composer(blocked)).toBeVisible();

  await blockerCtx.close();
  await blockedCtx.close();
});
