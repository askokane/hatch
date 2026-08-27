import { test, expect, type Page } from "@playwright/test";
import { login } from "./fixtures";
import { testDb, findConnectedRolePair } from "./db";

// Scenario 15: mentioning someone in a post.
//
// The product rule is the thing under test: you may "@" someone you are
// CONNECTED to — an accepted intro request — and nobody else. That rule is
// enforced on the server at write time, so proving it means checking both what
// the reader sees (a link, or plain text) and what was actually stored (a
// PostMention row, or nothing). The UI half alone would pass just as happily if
// the server had stored a mention it should have refused and the renderer simply
// declined to draw it.
//
// Both halves are exercised in one post, deliberately: one body naming a
// connection AND a stranger is the case where a "resolve them all" bug looks
// exactly like a working feature until you read the second name.

function composerBody(page: Page) {
  return page.getByLabel("Post to your feed");
}

function postButton(page: Page) {
  return page.getByRole("button", { name: "Post", exact: true });
}

// Stamped unique so a match cannot be a seeded row or a leftover from a rerun.
function unique(prefix: string) {
  return `${prefix} ${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Someone the author shares no thread with — i.e. explicitly not a connection. */
async function findStranger(authorProfileId: string, excludeProfileIds: string[]) {
  const myThreads = await testDb.threadMember.findMany({
    where: { profileId: authorProfileId },
    select: { threadId: true },
  });
  const connected = await testDb.threadMember.findMany({
    where: { threadId: { in: myThreads.map((t) => t.threadId) } },
    select: { profileId: true },
  });
  return testDb.profile.findFirst({
    where: {
      id: { notIn: [...new Set([...connected.map((c) => c.profileId), ...excludeProfileIds])] },
    },
    select: { id: true, handle: true, name: true },
  });
}

test("mention a connection in a post; a stranger stays plain text", async ({ browser }) => {
  test.setTimeout(180_000);

  const pair = await findConnectedRolePair();
  expect(pair).toBeTruthy();
  const { owner, requester } = pair!;

  const stranger = await findStranger(owner.profileId, [owner.profileId, requester.profileId]);
  expect(stranger).toBeTruthy();

  const authorCtx = await browser.newContext();
  const author = await authorCtx.newPage();
  await login(author, owner.email);
  await author.goto("/feed");

  const text = unique("Pairing on the ranking rewrite with");
  const field = composerBody(author);
  await field.click();
  await field.fill(`${text} `);

  // --- The suggestion list offers the connection ---
  //
  // Typed a character at a time rather than filled: the list is driven by the
  // caret token and a debounce, which a single value-set would step straight
  // over. This is the interaction a person actually has.
  await field.pressSequentially(`@${requester.handle.slice(0, 3)}`, { delay: 60 });

  const suggestions = author.getByRole("listbox", { name: /people you can mention/i });
  await expect(suggestions).toBeVisible();
  const option = suggestions.getByRole("option", { name: new RegExp(`@${requester.handle}\\b`) });
  await expect(option).toBeVisible();

  // --- ...and not the stranger, at any prefix ---
  // The list is only a convenience, but a convenience that offered someone the
  // server would then refuse would be worse than no list at all.
  await expect(
    suggestions.getByRole("option", { name: new RegExp(`@${stranger!.handle}\\b`) })
  ).toHaveCount(0);

  // Picking inserts the whole handle plus the space that terminates it.
  await option.click();
  await expect(field).toHaveValue(new RegExp(`@${requester.handle} $`));

  // --- A second name in the same post, typed at somebody not connected ---
  await field.pressSequentially(`and @${stranger!.handle} on the API`, { delay: 20 });
  // Nothing to offer for a stranger, so the list closes rather than lingering.
  await expect(suggestions).toHaveCount(0);

  await postButton(author).click();

  const card = author.locator("article").filter({ hasText: text });
  await expect(card).toBeVisible();

  // --- What the author sees: one link, one piece of text ---
  const mentionLink = card.getByRole("link", { name: `@${requester.handle}` });
  await expect(mentionLink).toBeVisible();
  await expect(mentionLink).toHaveAttribute("href", `/u/${requester.handle}`);
  await expect(card.getByText(`@${stranger!.handle}`)).toBeVisible();
  await expect(card.getByRole("link", { name: `@${stranger!.handle}` })).toHaveCount(0);

  // --- What was actually stored ---
  // The reader-facing check above cannot tell "the server refused to mention the
  // stranger" from "the server stored it and the renderer skipped it". This can.
  const post = await testDb.post.findFirst({
    where: { authorProfileId: owner.profileId, body: { contains: text } },
    select: { id: true, mentions: { select: { profileId: true, handle: true } } },
  });
  expect(post).toBeTruthy();
  expect(post!.mentions).toHaveLength(1);
  expect(post!.mentions[0]!.profileId).toBe(requester.profileId);
  expect(post!.mentions[0]!.handle).toBe(requester.handle);

  // --- And what the mentioned person sees, in their own session ---
  // A mention that only renders for its author is not a mention. This is also
  // the check that the link goes somewhere real.
  const readerCtx = await browser.newContext();
  const reader = await readerCtx.newPage();
  await login(reader, requester.email);
  await reader.goto("/feed");

  const readerCard = reader.locator("article").filter({ hasText: text });
  await expect(readerCard).toBeVisible();
  const readerLink = readerCard.getByRole("link", { name: `@${requester.handle}` });
  await expect(readerLink).toHaveAttribute("href", `/u/${requester.handle}`);

  // The link lands somewhere real. It resolves to /profile rather than
  // /u/<handle> here only because this reader IS the person mentioned, and
  // /u/[handle] redirects you to your own page — the mention is not doing
  // anything special.
  await readerLink.click();
  await reader.waitForURL(new RegExp("/profile$"));
  await expect(reader.getByText(`@${requester.handle}`).first()).toBeVisible();

  await readerCtx.close();
  await authorCtx.close();
});

test("deleting a post takes its mentions with it", async ({ page }) => {
  test.setTimeout(120_000);

  const pair = await findConnectedRolePair();
  expect(pair).toBeTruthy();
  const { owner, requester } = pair!;

  await login(page, owner.email);
  await page.goto("/feed");

  const text = unique("Shipping notes for");
  await composerBody(page).fill(`${text} @${requester.handle} — thanks!`);
  await postButton(page).click();

  const card = page.locator("article").filter({ hasText: text });
  await expect(card.getByRole("link", { name: `@${requester.handle}` })).toBeVisible();

  const post = await testDb.post.findFirst({
    where: { authorProfileId: owner.profileId, body: { contains: text } },
    select: { id: true },
  });
  expect(post).toBeTruthy();
  expect(
    await testDb.postMention.count({ where: { postId: post!.id } })
  ).toBe(1);

  // The mention row hangs off the post by a cascading FK rather than being
  // cleaned up in application code, which is the kind of thing that is correct
  // in the schema and wrong in the deployed database if a migration was written
  // by hand. This checks the database, not the Prisma schema file.
  await card.getByRole("button", { name: /delete this post/i }).click();
  await card.getByRole("button", { name: /^yes$/i }).click();
  await expect(page.locator("article").filter({ hasText: text })).toHaveCount(0);

  expect(await testDb.postMention.count({ where: { postId: post!.id } })).toBe(0);
});
