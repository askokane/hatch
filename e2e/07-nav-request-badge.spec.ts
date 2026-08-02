import { test, expect } from "@playwright/test";
import { signupAndOnboard } from "./fixtures";
import { testDb } from "./db";

// Bug 2: the requests nav item must carry a live count, capped at "9+".
//
// The pending rows are inserted directly: the outbound cap of 5 per sender means
// building 11 inbound requests through the UI would need a crowd of accounts,
// and this scenario is about the badge, not about the request flow (scenario 04
// covers that).
test("the requests nav badge counts pending requests and caps at 9+", async ({ page }) => {
  test.setTimeout(120_000);
  const unique = Date.now().toString(36);
  const email = `badge${unique}@e2e.edu`;

  await signupAndOnboard(page, {
    email,
    name: `Badge Tester ${unique}`,
    handle: `badge_${unique}`,
  });

  const me = await testDb.user.findUnique({ where: { email }, include: { profile: true } });
  const myProfileId = me!.profile!.id;

  const requestsLink = page.getByRole("link", { name: /^requests/ });

  // Nothing pending yet — no badge at all, rather than a "[0]".
  await page.goto("/discover");
  await expect(requestsLink).toBeVisible();
  await expect(requestsLink).not.toContainText("[");

  // A real intro request references a context belonging to the RECIPIENT, so
  // these rows point at one of my own intents — the same shape the app writes.
  const myIntent = await testDb.intent.findFirst({ where: { profileId: myProfileId } });
  expect(myIntent).toBeTruthy();

  const senders = await testDb.profile.findMany({
    where: { id: { not: myProfileId } },
    take: 11,
  });
  expect(senders.length).toBeGreaterThanOrEqual(11);

  async function sendPending(count: number) {
    for (const sender of senders.slice(0, count)) {
      await testDb.introRequest.create({
        data: {
          fromProfileId: sender.id,
          toProfileId: myProfileId,
          contextType: "INTENT",
          contextId: myIntent!.id,
          note: "Seeded pending request used to exercise the nav badge count.",
          status: "PENDING",
        },
      });
    }
  }

  // Exactly at the cap: still the literal number.
  await sendPending(9);
  await page.reload();
  await expect(requestsLink).toContainText("[9]", { timeout: 15_000 });

  // Past the cap: "9+", never "11".
  await testDb.introRequest.deleteMany({ where: { toProfileId: myProfileId } });
  await sendPending(11);
  await page.reload();
  await expect(requestsLink).toContainText("[9+]", { timeout: 15_000 });
  await expect(requestsLink).not.toContainText("[11]");

  // The exact figure is still available to assistive tech.
  await expect(page.getByLabel("11 pending intro requests")).toBeAttached();

  // The badge is live: it updates on the poll without a navigation.
  await testDb.introRequest.deleteMany({ where: { toProfileId: myProfileId } });
  await sendPending(2);
  await expect(requestsLink).toContainText("[2]", { timeout: 15_000 });
});
