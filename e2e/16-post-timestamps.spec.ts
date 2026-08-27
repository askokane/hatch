import { test, expect } from "@playwright/test";
import { signupAndOnboard } from "./fixtures";
import { testDb } from "./db";

// Scenario 16: how a post's age is worded.
//
// The tiers are Instagram's — a compact relative age while that is the useful
// fact, an absolute date once it stops being one. lib/relative-time is pure and
// takes an injectable clock, so the boundary arithmetic is settled there; what
// this scenario proves is the part a unit test cannot reach: that a post whose
// createdAt really is two months old renders "2mo ago" in a real browser,
// against the reader's own clock, through the server render and hydration.
//
// The ages below sit in the MIDDLE of each tier, never on an edge. A post
// stamped exactly seven days old would be a coin flip between "6d ago" and
// "1w ago" depending on how long the page took to load; a post stamped nine
// days old is "1w ago" no matter how slow the run is.
const S = 1000;
const M = 60 * S;
const H = 60 * M;
const D = 24 * H;

const CASES: { label: string; ago: number; expected: string }[] = [
  { label: "seconds", ago: 20 * S, expected: "just now" },
  { label: "minutes", ago: 25 * M, expected: "25m ago" },
  { label: "hours", ago: 7 * H, expected: "7h ago" },
  { label: "days", ago: 3 * D + 6 * H, expected: "3d ago" },
  { label: "one week", ago: 9 * D, expected: "1w ago" },
  { label: "four weeks", ago: 30 * D, expected: "4w ago" },
  { label: "months", ago: 70 * D, expected: "2mo ago" },
  { label: "ten months", ago: 320 * D, expected: "10mo ago" },
];

// Past a year the relative wording is dropped for the date itself. The expected
// string is derived the same way the component derives it rather than hardcoded,
// because the answer depends on when the suite runs.
const ANCIENT_AGO = 400 * D;
function expectedAncient(now: number) {
  return new Date(now - ANCIENT_AGO).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

test.describe("post timestamps", () => {
  test("a post's age is worded by tier, and falls back to a date past a year", async ({ page }) => {
    // A fresh account, so the profile's post list is exactly the rows this test
    // writes — no seeded post can push the oldest one off the first page.
    const stamp = Date.now().toString(36);
    const email = `clock-${stamp}@stateu.edu`;
    const handle = `clock${stamp}`;
    await signupAndOnboard(page, { email, name: "Clock Tester", handle });

    const profile = await testDb.profile.findFirst({
      where: { user: { email } },
      select: { id: true },
    });
    expect(profile, "the signup flow should have created a profile").not.toBeNull();

    // One clock for every row, so the ages are exactly the offsets above and do
    // not drift apart while the inserts run.
    const now = Date.now();
    const bodies = new Map<string, string>();
    for (const c of CASES) {
      bodies.set(c.label, `Timestamp probe ${c.label} ${stamp}`);
    }
    const ancientBody = `Timestamp probe ancient ${stamp}`;

    await testDb.post.createMany({
      data: [
        ...CASES.map((c) => ({
          authorProfileId: profile!.id,
          body: bodies.get(c.label)!,
          createdAt: new Date(now - c.ago),
        })),
        {
          authorProfileId: profile!.id,
          body: ancientBody,
          createdAt: new Date(now - ANCIENT_AGO),
        },
      ],
    });

    await page.goto("/profile");

    for (const c of CASES) {
      const body = bodies.get(c.label)!;
      const stampEl = page.locator("article", { hasText: body }).locator("time");
      await expect(stampEl, `a post ${c.label} old should read "${c.expected}"`).toHaveText(
        c.expected
      );
    }

    const ancientEl = page.locator("article", { hasText: ancientBody }).locator("time");
    await expect(ancientEl).toHaveText(expectedAncient(now));

    // Whatever the wording, the machine-readable value stays the exact instant —
    // the relative label is a presentation layer over it, not a replacement.
    await expect(ancientEl).toHaveAttribute(
      "datetime",
      new Date(now - ANCIENT_AGO).toISOString()
    );
  });
});

test.afterAll(async () => {
  await testDb.$disconnect();
});
