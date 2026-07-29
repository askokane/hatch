import { test, expect } from "@playwright/test";
import { login, composer } from "./fixtures";
import { findConnectedRolePair } from "./db";

// Bugs 3 + 4: a live typing indicator, and delivered/seen receipts.
//
// Both are cross-user signals, so both need two real browser contexts: one side
// acts, and the assertion is made on what the OTHER side renders.
test("typing shows on the other side, and receipts go delivered -> seen", async ({ browser }) => {
  test.setTimeout(180_000);

  const pair = await findConnectedRolePair();
  expect(pair).toBeTruthy();
  const { threadId, owner, requester } = pair!;

  const aCtx = await browser.newContext();
  const bCtx = await browser.newContext();
  const a = await aCtx.newPage();
  const b = await bCtx.newPage();

  await login(a, owner.email);
  await login(b, requester.email);

  // Only A opens the thread. B stays away so the message A sends can be observed
  // in the un-seen state first.
  await a.goto(`/messages/${threadId}`);

  // --- Typing indicator ---
  // A types; B must see it after opening the thread.
  await b.goto(`/messages/${threadId}`);
  await expect(b.getByText(/is typing/i)).toHaveCount(0);

  // Type continuously rather than once. A single keystroke claims one typing
  // window; if B's poll happens to land after that window lapses, the indicator
  // is missed and the test flakes for reasons that have nothing to do with the
  // feature. Real typing is a stream of keystrokes, so this models that.
  let keepTyping = true;
  const typingLoop = (async () => {
    let i = 0;
    while (keepTyping) {
      await composer(a).fill(`drafting${".".repeat(i++ % 5)}`);
      await new Promise((r) => setTimeout(r, 400));
    }
  })();

  await expect(b.getByText(new RegExp(`${owner.name} is typing`, "i")).first()).toBeVisible({
    timeout: 30_000,
  });

  keepTyping = false;
  await typingLoop;

  // Clearing the field releases the indicator — it does not linger.
  await composer(a).fill("");
  await composer(a).blur();
  await expect(b.getByText(/is typing/i)).toHaveCount(0, { timeout: 20_000 });

  // --- Receipts ---
  // B leaves so the next message from A cannot be marked read.
  await b.goto("/discover");

  const body = `receipt check ${Date.now()}`;
  await composer(a).fill(body);
  await a.getByRole("button", { name: /^send$/i }).click();
  await expect(a.getByText(body)).toBeVisible();

  // Nobody has read it yet.
  await expect(a.getByText(/✓ delivered/)).toBeVisible({ timeout: 15_000 });
  await expect(a.getByText(/✓✓ seen/)).toHaveCount(0);

  // B opens the thread; simply viewing it marks the thread read, and A's receipt
  // flips on the next poll with no action from A.
  await b.goto(`/messages/${threadId}`);
  await expect(b.getByText(body)).toBeVisible();
  await expect(a.getByText(/✓✓ seen/)).toBeVisible({ timeout: 20_000 });

  // Sending clears typing state: A's indicator must not reappear on B afterwards.
  await expect(b.getByText(/is typing/i)).toHaveCount(0);

  await aCtx.close();
  await bCtx.close();
});
