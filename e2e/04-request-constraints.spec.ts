import { test, expect, type Page } from "@playwright/test";
import { signup, completeOnboarding, DEMO_EMAIL } from "./fixtures";
import { testDb } from "./db";

// Gathers up to `n` OPEN roles, each owned by a DISTINCT profile that isn't the
// demo account — so a fresh sender can send one request per distinct recipient.
async function distinctOwnerRoles(n: number) {
  const roles = await testDb.openRole.findMany({
    where: {
      status: "OPEN",
      project: {
        visibility: "PUBLIC",
        memberships: { some: { isOwner: true, profile: { user: { email: { not: DEMO_EMAIL } } } } },
      },
    },
    include: {
      project: {
        include: { memberships: { where: { isOwner: true }, include: { profile: true } } },
      },
    },
  });
  const seen = new Set<string>();
  const picked: { slug: string; ownerId: string }[] = [];
  for (const r of roles) {
    const ownerId = r.project.memberships[0]?.profile.id;
    if (!ownerId || seen.has(ownerId)) continue;
    seen.add(ownerId);
    picked.push({ slug: r.project.slug, ownerId });
    if (picked.length === n) break;
  }
  return picked;
}

async function requestIntroOnProject(page: Page, slug: string, note: string) {
  await page.goto(`/p/${slug}`);
  await page.getByRole("button", { name: /request intro/i }).first().click();
  await page.getByLabel(/your note/i).fill(note);
  await page.getByRole("button", { name: /send request/i }).click();
}

test("intro-request constraints are enforced", async ({ page }) => {
  test.setTimeout(120_000);
  const unique = Date.now().toString(36);
  const email = `constraints${unique}@e2e.edu`;

  await signup(page, email);
  await page.goto("/onboarding");
  await completeOnboarding(page, {
    name: `Constraint Tester ${unique}`,
    handle: `ctester_${unique}`,
    school: "State University",
    skills: ["React", "TypeScript", "Node"],
    learning: ["Rust"],
  });

  const roles = await distinctOwnerRoles(6);
  expect(roles.length).toBeGreaterThanOrEqual(6);

  const goodNote =
    "This role matches what I have been building and I would really value a short conversation about it.";

  // (c) 39-char note is rejected.
  const shortNote = "x".repeat(39);
  await requestIntroOnProject(page, roles[0]!.slug, shortNote);
  await expect(page.getByText(/40[–-]500 characters|at least 40/i).first()).toBeVisible();
  // Close the dialog.
  await page.getByRole("button", { name: /cancel/i }).click();

  // Send 5 valid outbound requests to 5 distinct owners.
  for (let i = 0; i < 5; i++) {
    await requestIntroOnProject(page, roles[i]!.slug, `${goodNote} (#${i})`);
    await expect(page.getByText(/intro request sent/i)).toBeVisible();
  }

  // (a) a 2nd pending request to the SAME person is now unreachable: the page
  //     remembers the outstanding request instead of offering another one. The
  //     server constraint still exists — it simply can no longer be tripped from
  //     here, so this asserts the prevention and the resulting state.
  await page.goto(`/p/${roles[0]!.slug}`);
  await expect(page.getByRole("button", { name: /request intro/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /request sent/i }).first()).toBeVisible();

  const me = await testDb.user.findUnique({ where: { email }, include: { profile: true } });
  const pendingToSameOwner = await testDb.introRequest.count({
    where: { fromProfileId: me!.profile!.id, toProfileId: roles[0]!.ownerId, status: "PENDING" },
  });
  expect(pendingToSameOwner).toBe(1);

  // (b) the 6th distinct outbound request is rejected (cap of 5 pending). This
  //     one IS still reachable, because the 6th owner is someone new.
  await requestIntroOnProject(page, roles[5]!.slug, `${goodNote} (#6)`);
  await expect(page.getByText(/at most 5 pending outbound/i)).toBeVisible();
});
