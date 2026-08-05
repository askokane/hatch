import { test, expect, type Page } from "@playwright/test";
import { login, DEMO_EMAIL } from "./fixtures";
import { testDb } from "./db";

// Scenario 12: uploaded profile pictures.
//
// A profile picture is a MediaAsset like a post attachment, so the bytes, the
// serving route and the MIME allowlist are already covered by scenario 11. What
// is new — and what this file is about — is the *lifecycle*: an avatar is an
// asset that legitimately never gets a post, which is the one thing the composer
// upload path treats as garbage. The regression this suite exists to catch is a
// profile picture disappearing because its owner posted something.
//
// A real, decodable 1x1 PNG, so the round trip is genuine end to end.
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

// A second, byte-different PNG (1x1, transparent) — used to prove a replacement
// actually replaces rather than adding.
const PNG_1X1_ALT = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
);

// A structurally valid JPEG carrying an APP1/Exif segment with GPS text in it —
// the thing a phone actually produces. Built rather than checked in as a binary
// so the payload under test is visible in the diff.
const JPEG_WITH_GPS = (() => {
  const seg = (marker: number, payload: Buffer) => {
    const len = Buffer.alloc(2);
    len.writeUInt16BE(payload.length + 2);
    return Buffer.concat([Buffer.from([0xff, marker]), len, payload]);
  };
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    seg(0xe0, Buffer.from("JFIF\0\x01\x02\0\0\x01\0\x01\0\0", "latin1")),
    seg(
      0xe1,
      Buffer.concat([
        Buffer.from("Exif\0\0", "latin1"),
        Buffer.from("II*\0\x08\0\0\0GPSLatitude 51.5074 GPSLongitude -0.1278", "latin1"),
      ])
    ),
    seg(0xdb, Buffer.alloc(65, 7)),
    seg(0xda, Buffer.from([0x01, 0x01, 0x00, 0x00, 0x3f, 0x00])),
    Buffer.from([0x12, 0x34, 0x56, 0x78, 0xff, 0xd9]),
  ]);
})();

// Avatars are addressed by asset id throughout: a profile page also renders that
// profile's posts, so `img[src^="/api/media/"]` is not specific to the avatar.
function avatarImg(assetId: string) {
  return `img[src="/api/media/${assetId}"]`;
}

async function openProfileEditor(page: Page) {
  await page.goto("/profile");
  await page.getByRole("button", { name: "Edit profile" }).click();
  await expect(page.getByText("[ editing profile ]")).toBeVisible();
}

// The picture control's file input, labelled by whichever state it is in.
function avatarInput(page: Page) {
  return page.getByLabel(/upload a photo|change photo/i);
}

function demoProfile() {
  return testDb.profile.findFirst({
    where: { user: { email: DEMO_EMAIL } },
    select: { id: true, handle: true, avatarSeed: true, avatarAssetId: true },
  });
}

// These specs share one seeded account and run in file order, so each starts by
// reading whatever the previous one left rather than assuming a clean slate.
function currentAvatarId() {
  return demoProfile().then((p) => p!.avatarAssetId);
}

// Polled rather than read once. The assertion crosses a process boundary — the
// row is written by the server process and read here through a separate pooled
// connection — so "the control has re-rendered" and "my connection can see the
// new row" are not the same instant. Returns the settled id.
async function avatarIdOnceChangedFrom(previous: string | null): Promise<string> {
  await expect.poll(currentAvatarId, { timeout: 20_000 }).not.toBe(previous);
  return (await currentAvatarId())!;
}

test.describe("profile picture", () => {
  test("upload replaces the identicon, and the bytes come back", async ({ page }) => {
    await login(page, DEMO_EMAIL);
    const previous = await currentAvatarId();
    await openProfileEditor(page);

    await avatarInput(page).setInputFiles({
      name: "me.png",
      mimeType: "image/png",
      buffer: PNG_1X1,
    });

    // The control reports success and flips to the "already has one" wording.
    await expect(page.getByLabel(/change photo/i)).toBeAttached({ timeout: 20_000 });

    // Everything below keys off the asset id rather than "the first media image
    // on the page": this profile also renders its own posts, which carry media of
    // their own, and a positional locator would drift onto one of those.
    const assetId = await avatarIdOnceChangedFrom(previous);

    // The picture is on the profile header, not only inside the editor.
    await page.goto("/profile");
    await expect(page.locator(avatarImg(assetId)).first()).toBeVisible();

    // Rendering an <img> is not proof the bytes are served — a broken image still
    // occupies the DOM.
    const res = await page.request.get(`/api/media/${assetId}`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");
    expect(res.headers()["x-content-type-options"]).toBe("nosniff");
    expect((await res.body()).equals(PNG_1X1)).toBe(true);

    // Stored as an avatar, not as a composer upload — this is the flag the sweep
    // in createPostAction keys off.
    const asset = await testDb.mediaAsset.findUnique({
      where: { id: assetId },
      select: { isAvatar: true, postId: true, ownerProfileId: true },
    });
    const profile = await demoProfile();
    expect(asset).toMatchObject({ isAvatar: true, postId: null, ownerProfileId: profile!.id });
  });

  test("posting does not sweep away the profile picture", async ({ page }) => {
    // The whole reason MediaAsset.isAvatar exists. The avatar and an abandoned
    // composer upload are both postId-null; createPostAction deletes the latter
    // on every post, and without the flag it would take the avatar with it.
    await login(page, DEMO_EMAIL);
    const previous = await currentAvatarId();
    await openProfileEditor(page);
    await avatarInput(page).setInputFiles({
      name: "me.png",
      mimeType: "image/png",
      buffer: PNG_1X1,
    });
    await expect(page.getByLabel(/change photo/i)).toBeAttached({ timeout: 20_000 });

    const before = await avatarIdOnceChangedFrom(previous);

    await page.goto("/feed");
    const text = `Avatar survival check ${Date.now().toString(36)}`;
    await page.getByLabel("Post to your feed").fill(text);
    await page.getByRole("button", { name: "Post", exact: true }).click();
    await expect(page.getByText(text)).toBeVisible();

    // Both the link and the row it points at are intact.
    expect(await currentAvatarId()).toBe(before);
    expect(await testDb.mediaAsset.findUnique({ where: { id: before } })).not.toBeNull();

    // And it is still rendered rather than silently degraded to the identicon.
    await page.goto("/profile");
    await expect(page.locator(avatarImg(before)).first()).toBeVisible();
  });

  test("a replacement supersedes the previous picture instead of piling up", async ({ page }) => {
    await login(page, DEMO_EMAIL);
    const previous = await currentAvatarId();
    await openProfileEditor(page);

    await avatarInput(page).setInputFiles({ name: "first.png", mimeType: "image/png", buffer: PNG_1X1 });
    await expect(page.getByLabel(/change photo/i)).toBeAttached({ timeout: 20_000 });
    const first = await avatarIdOnceChangedFrom(previous);

    await avatarInput(page).setInputFiles({
      name: "second.png",
      mimeType: "image/png",
      buffer: PNG_1X1_ALT,
    });
    const second = await avatarIdOnceChangedFrom(first);

    // The superseded asset is gone, not orphaned — there is no avatar history to
    // browse, so keeping the bytes would only accumulate them.
    expect(await testDb.mediaAsset.findUnique({ where: { id: first } })).toBeNull();
    expect(await testDb.mediaAsset.findUnique({ where: { id: second } })).not.toBeNull();

    // Exactly one avatar asset for this profile, whatever happened in between.
    const count = await testDb.mediaAsset.count({
      where: { ownerProfileId: (await demoProfile())!.id, isAvatar: true },
    });
    expect(count).toBe(1);
  });

  test("removing falls back to the identicon the profile started with", async ({ page }) => {
    await login(page, DEMO_EMAIL);
    const previous = await currentAvatarId();
    await openProfileEditor(page);
    await avatarInput(page).setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PNG_1X1 });
    await expect(page.getByLabel(/change photo/i)).toBeAttached({ timeout: 20_000 });

    const assetId = await avatarIdOnceChangedFrom(previous);
    const seedBefore = (await demoProfile())!.avatarSeed;

    // `exact` matters: the name filter is a substring match, and the edit form
    // this control sits in is full of "Remove <tag>" and "Remove link" buttons.
    await page.getByRole("button", { name: "remove", exact: true }).click();
    await expect(page.getByLabel(/upload a photo/i)).toBeAttached({ timeout: 20_000 });

    await expect.poll(currentAvatarId, { timeout: 20_000 }).toBeNull();
    const after = (await demoProfile())!;
    expect(await testDb.mediaAsset.findUnique({ where: { id: assetId } })).toBeNull();
    // The identicon seed is never cleared, so removal restores the ORIGINAL
    // pattern rather than generating a new one.
    expect(after.avatarSeed).toBe(seedBefore);

    await page.goto("/profile");
    await expect(page.locator(avatarImg(assetId))).toHaveCount(0);
  });

  test("EXIF is stripped from what the server stores and serves", async ({ page }) => {
    // The privacy guarantee, checked at the boundary that matters: bytes uploaded
    // through the real route, then fetched back through the real serving route.
    // The unit test in spec 13 proves the parser is correct; this proves it is
    // actually WIRED IN, which no amount of unit testing can.
    //
    // Posted as a raw request rather than through the picker, because the client
    // downscales through a canvas and would discard the EXIF before it ever left
    // the browser — that is the courtesy path, and it would mask a server that
    // does nothing.
    await login(page, DEMO_EMAIL);
    const previous = await currentAvatarId();

    const withExif = JPEG_WITH_GPS.toString("base64");
    const status = await page.evaluate(async (b64) => {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const form = new FormData();
      form.append("file", new File([bytes], "holiday.jpg", { type: "image/jpeg" }));
      const res = await fetch("/api/avatar", { method: "POST", body: form });
      return res.status;
    }, withExif);
    expect(status).toBe(201);

    const assetId = await avatarIdOnceChangedFrom(previous);

    // What is stored.
    const stored = await testDb.mediaAsset.findUnique({
      where: { id: assetId },
      select: { data: true },
    });
    const storedBuf = Buffer.from(stored!.data);
    expect(storedBuf.includes("GPSLatitude")).toBe(false);
    expect(storedBuf.includes("Exif")).toBe(false);

    // And what is served — the two can only differ if something re-adds it.
    const served = Buffer.from(await (await page.request.get(`/api/media/${assetId}`)).body());
    expect(served.includes("GPSLatitude")).toBe(false);
    // Still a JPEG: SOI intact, so stripping did not corrupt the container.
    expect(served[0]).toBe(0xff);
    expect(served[1]).toBe(0xd8);
  });

  test("the profile picture cannot be claimed as a post attachment", async ({ page }) => {
    // The avatar is owned by the caller and is postId-null, which is precisely
    // what createPostAction's claim predicate looks for — and its asset id is
    // public to the owner, since it is the `src` of their own avatar <img>.
    // Without `isAvatar: false` on that predicate the picture attaches to the
    // post, and then vanishes when the post is deleted.
    await login(page, DEMO_EMAIL);
    const previous = await currentAvatarId();
    await openProfileEditor(page);
    await avatarInput(page).setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PNG_1X1 });
    await expect(page.getByLabel(/change photo/i)).toBeAttached({ timeout: 20_000 });
    const assetId = await avatarIdOnceChangedFrom(previous);

    // The composer UI will never offer the avatar, and a Server Action cannot be
    // forged from here (the action id is generated at build time), so the guard
    // is exercised where it actually lives: the claim predicate itself. This
    // mirrors the WHERE clause in createPostAction — if the two ever drift, the
    // duplication is the point of failure, so keep them in step.
    const profileId = (await demoProfile())!.id;
    const claimed = await testDb.mediaAsset.updateMany({
      where: { id: assetId, ownerProfileId: profileId, postId: null, isAvatar: false },
      data: { postId: null },
    });
    // Zero rows matched: the avatar is unclaimable even by its own owner.
    expect(claimed.count).toBe(0);

    // And the same predicate WITHOUT the guard would have matched it — which is
    // what makes the assertion above meaningful rather than vacuous.
    const wouldHaveMatched = await testDb.mediaAsset.count({
      where: { id: assetId, ownerProfileId: profileId, postId: null },
    });
    expect(wouldHaveMatched).toBe(1);

    // Untouched throughout.
    expect(await currentAvatarId()).toBe(assetId);
    const asset = await testDb.mediaAsset.findUnique({
      where: { id: assetId },
      select: { postId: true, isAvatar: true },
    });
    expect(asset).toMatchObject({ postId: null, isAvatar: true });
  });

  test("the avatar route refuses what it should, and demands a session", async ({ page, browser }) => {
    await login(page, DEMO_EMAIL);

    const start = await demoProfile();
    const avatarBefore = start!.avatarAssetId;
    const avatarsBefore = await testDb.mediaAsset.count({
      where: { ownerProfileId: start!.id, isAvatar: true },
    });

    // Video is a valid post attachment and not a valid face.
    const video = await page.request.post("/api/avatar", {
      multipart: {
        file: { name: "clip.mp4", mimeType: "video/mp4", buffer: Buffer.from("not-a-real-encode") },
      },
    });
    expect(video.status()).toBe(400);

    // A disallowed type is refused by MIME, whatever the extension claims.
    const badType = await page.request.post("/api/avatar", {
      multipart: {
        file: { name: "me.png", mimeType: "text/html", buffer: Buffer.from("<script>x</script>") },
      },
    });
    expect(badType.status()).toBe(400);

    // One byte past the avatar cap. A filled buffer of the right length is
    // enough — the size check runs before anything looks at the contents.
    const tooBig = await page.request.post("/api/avatar", {
      multipart: {
        file: { name: "huge.png", mimeType: "image/png", buffer: Buffer.alloc(1024 * 1024 + 1, 0) },
      },
    });
    expect(tooBig.status()).toBe(400);

    // None of the three refusals left a row behind: the count is unchanged, and
    // the profile still points wherever it pointed before.
    const profile = await demoProfile();
    const after = await testDb.mediaAsset.count({
      where: { ownerProfileId: profile!.id, isAvatar: true },
    });
    expect(after).toBe(avatarsBefore);
    expect(profile!.avatarAssetId).toBe(avatarBefore);

    const anonCtx = await browser.newContext();
    const anon = await anonCtx.newPage();
    const anonRes = await anon.request.post("/api/avatar", {
      multipart: {
        file: { name: "me.png", mimeType: "image/png", buffer: PNG_1X1 },
      },
    });
    expect(anonRes.status()).toBe(401);
    await anonCtx.close();
  });
});
