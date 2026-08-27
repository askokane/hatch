import { test, expect } from "@playwright/test";
import { DEMO_EMAIL, DEMO_PASSWORD } from "./fixtures";

// Scenario 17: a deploy lands while someone has a page open.
//
// Their tab is still running the previous build's JavaScript, so the next form
// they submit calls a Server Action id the new server has never heard of. Next
// answers that POST with a 404 carrying `x-nextjs-action-not-found: 1`, the
// router turns the header into an UnrecognizedActionError, and it reaches the
// app's error boundary. Before this was handled the reader got the generic
// "Something went wrong" — whose "Try again" button re-runs the same stale
// bundle and fails identically, which is the worst possible advice here.
//
// The failure is staged with a route intercept rather than by actually
// redeploying mid-test. What matters is that the browser receives exactly what
// a real skewed server sends, and the four lines below ARE that response —
// status, header, content-type and body are copied from Next's own
// handleUnrecognizedFetchAction. Rebuilding the app mid-run would exercise
// Next's server, which is not the code this repo owns; the boundary is.
const ACTION_NOT_FOUND = {
  status: 404,
  contentType: "text/plain",
  headers: { "x-nextjs-action-not-found": "1" },
  body: "Server action not found.",
};

test.describe("stale deployment", () => {
  test("a form submitted against a newer deployment says so, and offers a reload", async ({
    page,
  }) => {
    await page.goto("/login");

    // Only Server Action POSTs are intercepted — a Next action request is a POST
    // carrying the `next-action` header. Ordinary navigation and data fetching
    // on this page must stay untouched, or the test would be staging a broken
    // server rather than a skewed one.
    await page.route("**/*", async (route) => {
      const req = route.request();
      if (req.method() === "POST" && req.headers()["next-action"]) {
        await route.fulfill(ACTION_NOT_FOUND);
        return;
      }
      await route.fallback();
    });

    await page.getByLabel("Email").fill(DEMO_EMAIL);
    await page.getByLabel("Password").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: /log in/i }).click();

    // The specific explanation, not the catch-all.
    await expect(page.getByRole("heading", { name: "This page needs a refresh" })).toBeVisible();
    await expect(page.getByText(/updated while this page was open/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Something went wrong" })).toHaveCount(0);

    // Saying "nothing was saved" is a promise about the login attempt: the
    // action never reached the server, so the tab must still be logged out.
    await page.goto("/feed");
    await expect(page).toHaveURL(/\/login/);
  });

  test("the reload button fetches the page again rather than re-running stale code", async ({
    page,
  }) => {
    await page.goto("/login");

    // The intercept is armed for the first submit only. That models the real
    // sequence — the deploy already happened, so the reload pulls the CURRENT
    // build and the retry works — and it is what proves the button does a real
    // document fetch: if it only called reset(), the page would re-render from
    // memory, no new request would go out, and the login form would not return.
    let interceptArmed = true;
    await page.route("**/*", async (route) => {
      const req = route.request();
      if (interceptArmed && req.method() === "POST" && req.headers()["next-action"]) {
        interceptArmed = false;
        await route.fulfill(ACTION_NOT_FOUND);
        return;
      }
      await route.fallback();
    });

    await page.getByLabel("Email").fill(DEMO_EMAIL);
    await page.getByLabel("Password").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: /log in/i }).click();
    await expect(page.getByRole("heading", { name: "This page needs a refresh" })).toBeVisible();

    await page.getByRole("button", { name: "Reload page" }).click();

    // Back to a working login form, and it works: the recovery the copy
    // promises is the recovery the reader actually gets.
    await expect(page.getByLabel("Email")).toBeVisible();
    await page.getByLabel("Email").fill(DEMO_EMAIL);
    await page.getByLabel("Password").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: /log in/i }).click();
    await page.waitForURL(/\/(discover|onboarding)/);
  });

  // The counterpart to the two above: the new branch has to be narrow. An
  // action that fails for any OTHER reason is not a version skew, the reader
  // cannot fix it by reloading, and telling them to would be a wrong answer
  // delivered confidently. Same interception point, same form, only the
  // response differs — so what this isolates is the boundary's discrimination
  // and nothing else.
  test("an ordinary action failure still gets the generic error, not the reload advice", async ({
    page,
  }) => {
    await page.goto("/login");

    await page.route("**/*", async (route) => {
      const req = route.request();
      if (req.method() === "POST" && req.headers()["next-action"]) {
        await route.fulfill({ status: 500, contentType: "text/plain", body: "boom" });
        return;
      }
      await route.fallback();
    });

    await page.getByLabel("Email").fill(DEMO_EMAIL);
    await page.getByLabel("Password").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: /log in/i }).click();

    await expect(page.getByRole("heading", { name: "Something went wrong" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "This page needs a refresh" })).toHaveCount(0);
  });
});
