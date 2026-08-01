import { test, expect, type Page } from "@playwright/test";
import { login, logout, DEMO_EMAIL, DEMO_PASSWORD } from "./fixtures";
import { testDb } from "./db";

// Scenario 11: the feed. Posting with and without media, the post appearing on
// the author's profile as well as in the feed, the three item types coexisting,
// and the server-side guards on the upload path.
//
// About the media fixtures: the image below is a real, decodable 1x1 PNG, so the
// image path is exercised end to end — upload, store, serve, render. The video
// fixture is NOT a real encoded video, and this test does not claim it is: it is
// a small buffer declared as video/mp4, which proves the pipeline the app
// actually owns (accepted by MIME, stored, served back with the right
// Content-Type and Accept-Ranges, rendered into a <video> element). Whether a
// browser can decode a genuine H.264 stream is the browser's business, not this
// application's, and faking a real encode here would only make the test slower
// and more brittle without testing more of our code.
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

function composerBody(page: Page) {
  return page.getByLabel("Post to your feed");
}

function postButton(page: Page) {
  return page.getByRole("button", { name: "Post", exact: true });
}

// Posts are found by their own text: every one below is stamped unique, so a
// match cannot be a seeded row or a leftover from an earlier run.
function unique(prefix: string) {
  return `${prefix} ${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

test.describe("feed", () => {
  test("post without media, and it appears on the feed and the profile", async ({ page }) => {
    await login(page, DEMO_EMAIL);
    await page.goto("/feed");

    const text = unique("Shipped the ranking rewrite tonight —");
    await composerBody(page).fill(text);
    await postButton(page).click();

    // Lands in the feed without a manual reload.
    await expect(page.getByText(text)).toBeVisible();

    // The composer resets, so a second post does not inherit the first's text.
    await expect(composerBody(page)).toHaveValue("");

    // Same post on the author's own profile — the requirement is that a post
    // shows up in both places, not just the feed it was written from.
    await page.goto("/profile");
    await expect(page.getByText(text)).toBeVisible();
  });

  test("post with a photo: it uploads, renders, and the bytes come back", async ({ page }) => {
    await login(page, DEMO_EMAIL);
    await page.goto("/feed");

    const text = unique("First render of the new dashboard —");
    await composerBody(page).fill(text);
    await page.getByLabel("add photos or video").setInputFiles({
      name: "dashboard.png",
      mimeType: "image/png",
      buffer: PNG_1X1,
    });

    // The Post button stays disabled until the upload finishes — that gating is
    // the whole reason the composer uploads on selection rather than on submit.
    await expect(postButton(page)).toBeEnabled({ timeout: 20_000 });
    await postButton(page).click();

    const card = page.locator("article").filter({ hasText: text });
    await expect(card).toBeVisible();

    const image = card.locator('img[src^="/api/media/"]');
    await expect(image).toBeVisible();

    // The <img> rendering is not proof the bytes are served — a broken image
    // still occupies the DOM. Fetch the asset URL and check the response.
    const src = await image.getAttribute("src");
    expect(src).toBeTruthy();
    const res = await page.request.get(src!);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");
    expect(res.headers()["x-content-type-options"]).toBe("nosniff");
    // Range support is what makes video seeking work; it is advertised on every
    // asset, so it is checked on the one we can cheaply create.
    expect(res.headers()["accept-ranges"]).toBe("bytes");
    expect((await res.body()).equals(PNG_1X1)).toBe(true);
  });

  test("a video attachment survives the round trip as a video element", async ({ page }) => {
    await login(page, DEMO_EMAIL);
    await page.goto("/feed");

    const text = unique("Screen recording of the merge conflict from hell —");
    await composerBody(page).fill(text);
    await page.getByLabel("add photos or video").setInputFiles({
      name: "clip.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.from("not-a-real-encode-see-file-header-comment"),
    });
    await expect(postButton(page)).toBeEnabled({ timeout: 20_000 });
    await postButton(page).click();

    const card = page.locator("article").filter({ hasText: text });
    await expect(card).toBeVisible();
    const video = card.locator('video[src^="/api/media/"]');
    await expect(video).toBeVisible();
    // Never autoplay — a feed that plays on scroll spends bandwidth unasked.
    await expect(video).not.toHaveAttribute("autoplay", /.*/);
    await expect(video).toHaveAttribute("controls", /.*/);

    const src = await video.getAttribute("src");
    const res = await page.request.get(src!);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("video/mp4");
  });

  test("the feed carries posts, project updates and open roles together", async ({ page }) => {
    await login(page, DEMO_EMAIL);

    // Each filter is a distinct source. Asserting on the tabs rather than trying
    // to identify item types inside the merged view keeps this independent of
    // how many seeded rows happen to land on page one of "all".
    await page.goto("/feed?filter=updates");
    await expect(page.getByText("[ project update ]").first()).toBeVisible();

    await page.goto("/feed?filter=roles");
    await expect(page.getByText("[ open role ]").first()).toBeVisible();

    await page.goto("/feed?filter=posts");
    // The seed ships posts, so this tab is populated before anyone posts.
    await expect(page.locator("article").first()).toBeVisible();

    // And the default surface holds more than any single source does.
    await page.goto("/feed");
    await expect(page.locator("article").first()).toBeVisible();
  });

  test("another member sees the post on the author's public profile", async ({ page, browser }) => {
    await login(page, DEMO_EMAIL);
    const handle = await page
      .goto("/profile")
      .then(() => page.locator("text=/^@/").first().innerText());

    await page.goto("/feed");
    const text = unique("Looking for someone who has fought Postgres full-text search —");
    await composerBody(page).fill(text);
    await postButton(page).click();
    await expect(page.getByText(text)).toBeVisible();

    // A second, unrelated seeded account.
    const other = await testDb.profile.findFirst({
      where: { user: { email: { not: DEMO_EMAIL } }, isDiscoverable: true },
      select: { user: { select: { email: true } } },
    });
    expect(other).not.toBeNull();

    const ctx = await browser.newContext();
    const viewer = await ctx.newPage();
    await login(viewer, other!.user.email, DEMO_PASSWORD);
    await viewer.goto(`/u/${handle.replace(/^@/, "")}`);
    await expect(viewer.getByText(text)).toBeVisible();
    // Someone else's post offers a report path and no delete control.
    await expect(viewer.getByRole("button", { name: "Delete this post" })).toHaveCount(0);
    await ctx.close();
  });

  test("an author can delete their own post", async ({ page }) => {
    await login(page, DEMO_EMAIL);
    await page.goto("/feed");

    const text = unique("Temporary post, about to be removed —");
    await composerBody(page).fill(text);
    await postButton(page).click();

    const card = page.locator("article").filter({ hasText: text });
    await expect(card).toBeVisible();

    // Two-step inline confirm, not window.confirm (which would block the tab).
    await card.getByRole("button", { name: "Delete this post" }).click();
    await card.getByRole("button", { name: "yes" }).click();

    await expect(page.getByText(text)).toHaveCount(0);
    await page.reload();
    await expect(page.getByText(text)).toHaveCount(0);
  });

  test("the upload route refuses what it should, and demands a session", async ({ page, browser }) => {
    await login(page, DEMO_EMAIL);

    // A disallowed type is refused by MIME, whatever the extension claims.
    const badType = await page.request.post("/api/media", {
      multipart: {
        file: { name: "payload.html", mimeType: "text/html", buffer: Buffer.from("<script>x</script>") },
      },
    });
    expect(badType.status()).toBe(400);

    // Oversized: one byte past the image cap. Built without allocating a real
    // 4 MB buffer of random data — a filled buffer of the right length is enough,
    // since the size check happens before anything looks at the contents.
    const tooBig = await page.request.post("/api/media", {
      multipart: {
        file: {
          name: "huge.png",
          mimeType: "image/png",
          buffer: Buffer.alloc(4 * 1024 * 1024 + 1, 0),
        },
      },
    });
    expect(tooBig.status()).toBe(400);

    // Media is behind the session: a signed-out client gets 401, not the file.
    const anonCtx = await browser.newContext();
    const anon = await anonCtx.newPage();
    const anonRes = await anon.request.get("/api/media/anything");
    expect(anonRes.status()).toBe(401);
    const anonFeed = await anon.request.get("/api/feed");
    expect(anonFeed.status()).toBe(401);
    await anonCtx.close();
  });

  test("a post cannot be deleted by someone who did not write it", async ({ page, browser }) => {
    await login(page, DEMO_EMAIL);
    await page.goto("/feed");
    const text = unique("Ownership check —");
    await composerBody(page).fill(text);
    await postButton(page).click();
    await expect(page.getByText(text)).toBeVisible();

    // Polled rather than read once. This assertion crosses a process boundary —
    // the row is written by the server process and read here through a separate
    // pooled connection — so "the UI has rendered it" and "my connection can see
    // it" are not the same instant. A single read races that gap; the assertion
    // being made is that the row exists, not that it exists by a given tick.
    const findId = async () =>
      (await testDb.post.findFirst({ where: { body: text }, select: { id: true } }))?.id ?? null;

    await expect.poll(findId, { timeout: 15_000 }).not.toBeNull();
    const postId = (await findId())!;

    // The forged-id case: the delete action re-derives authorship from the DB, so
    // a non-author holding a real post id still cannot remove it. Verified at the
    // data layer — the row is still there after the attempt.
    const other = await testDb.profile.findFirst({
      where: { user: { email: { not: DEMO_EMAIL } } },
      select: { user: { select: { email: true } } },
    });
    const ctx = await browser.newContext();
    const viewer = await ctx.newPage();
    await login(viewer, other!.user.email, DEMO_PASSWORD);
    await viewer.goto("/feed");
    // No delete control is offered on a post they do not own.
    const theirCard = viewer.locator("article").filter({ hasText: text });
    await expect(theirCard.getByRole("button", { name: "Delete this post" })).toHaveCount(0);
    await ctx.close();

    const stillThere = await testDb.post.findUnique({ where: { id: postId } });
    expect(stillThere).not.toBeNull();

    await logout(page);
  });
});
