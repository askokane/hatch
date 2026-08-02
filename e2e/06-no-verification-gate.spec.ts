import { test, expect } from "@playwright/test";
import { signupAndOnboard, DEMO_EMAIL } from "./fixtures";
import { testDb } from "./db";

// Bug 1: the on-platform verification step is gone. A brand-new account is fully
// usable immediately — no banner, no gate on the features that used to require it.
test("a new account is usable immediately, with no verification step", async ({ page }) => {
  test.setTimeout(120_000);
  const unique = Date.now().toString(36);
  const email = `noverify${unique}@e2e.edu`;

  await signupAndOnboard(page, {
    email,
    name: `No Verify ${unique}`,
    handle: `noverify_${unique}`,
  });

  // No nag banner anywhere in the shell.
  await expect(page.getByText(/isn.t verified|verify your email/i)).toHaveCount(0);

  // The old verification routes are gone rather than merely unlinked.
  const pending = await page.request.get("/verify/pending");
  expect(pending.status()).toBe(404);

  // Settings no longer reports an unverified state.
  await page.goto("/settings");
  await expect(page.getByText(/not verified/i)).toHaveCount(0);

  // The account is marked verified at creation, so nothing downstream can gate
  // on the column and quietly reintroduce the wall.
  const user = await testDb.user.findUnique({ where: { email } });
  expect(user?.emailVerifiedAt).not.toBeNull();

  // The feature that used to be gated — sending an intro request — works on a
  // never-verified-by-hand account.
  const role = await testDb.openRole.findFirst({
    where: {
      status: "OPEN",
      project: {
        visibility: "PUBLIC",
        memberships: { some: { isOwner: true, profile: { user: { email: { not: DEMO_EMAIL } } } } },
      },
    },
    include: { project: { select: { slug: true } } },
  });
  expect(role).toBeTruthy();

  await page.goto(`/p/${role!.project.slug}`);
  await page.getByRole("button", { name: /request intro/i }).first().click();
  await page
    .getByLabel(/your note/i)
    .fill("Straight from a fresh account with no verification step — this role lines up with my work.");
  await page.getByRole("button", { name: /send request/i }).click();
  await expect(page.getByText(/intro request sent/i)).toBeVisible();

  // Project creation was gated on verification too — it must be open now.
  await page.goto("/projects/new");
  await expect(page.getByText(/verify your email/i)).toHaveCount(0);
});
