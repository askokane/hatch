import { test, expect, type Page } from "@playwright/test";
import { login } from "./fixtures";
import { findTeamProject, testDb, CHAT_COMPOSER_NAME } from "./db";

// Project group chats: one room per project, whose members are the project's team.
//
// The three things worth proving are the three places this differs from the
// two-person threads the app already had:
//
//   1. Membership is the team roster. Nobody joins, nobody is invited, and a
//      non-member cannot read the room or reach its endpoint.
//   2. A block hides one person from one viewer instead of closing the room.
//      This is the assertion that needs three people in the chat: with two, "the
//      blocker sees nothing from them" and "the room is dead" are the same
//      observation.
//   3. Presence is plural — the typing indicator and the read receipt both have
//      to survive there being more than one other person.

function chatComposer(page: Page) {
  return page.getByRole("textbox", { name: CHAT_COMPOSER_NAME });
}

async function send(page: Page, text: string) {
  await chatComposer(page).fill(text);
  await page.getByRole("button", { name: /^send$/i }).click();
  await expect(page.getByText(text, { exact: true })).toBeVisible();
}

test.describe("project group chat", () => {
  test("the team can talk, and outsiders cannot reach the room", async ({ browser }) => {
    test.setTimeout(180_000);

    const team = await findTeamProject();
    expect(team).toBeTruthy();
    const { slug, owner, second, outsider } = team!;

    const ownerCtx = await browser.newContext();
    const memberCtx = await browser.newContext();
    const outsiderCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();
    const memberPage = await memberCtx.newPage();
    const outsiderPage = await outsiderCtx.newPage();

    await login(ownerPage, owner.email);
    await login(memberPage, second.email);
    await login(outsiderPage, outsider.email);

    // --- The entry point is on the project, and only members see it ---
    await ownerPage.goto(`/p/${slug}`);
    await expect(ownerPage.getByRole("link", { name: /team chat/i })).toBeVisible();

    await outsiderPage.goto(`/p/${slug}`);
    await expect(outsiderPage.getByRole("link", { name: /team chat/i })).toHaveCount(0);

    // --- Opening it creates the room; a second member walks into the same one ---
    await ownerPage.goto(`/p/${slug}/chat`);
    await expect(ownerPage.getByText(/team chat ·/i)).toBeVisible();

    const stamp = Date.now();
    const fromOwner = `standup at four ${stamp}`;
    await send(ownerPage, fromOwner);

    await memberPage.goto(`/p/${slug}/chat`);
    await expect(memberPage.getByText(fromOwner, { exact: true })).toBeVisible();

    // The transcript attributes every line — a group has no single counterpart
    // pinned at the top to infer the speaker from.
    await expect(memberPage.getByText(owner.name).first()).toBeVisible();

    // --- A message from the second member reaches the first by polling alone ---
    const fromMember = `works for me ${stamp}`;
    await send(memberPage, fromMember);
    await expect(ownerPage.getByText(fromMember, { exact: true })).toBeVisible({ timeout: 20_000 });

    // --- The owner's receipt is plural: someone else has now read it ---
    await expect(ownerPage.getByText(/seen by \d+ of \d+/i).first()).toBeVisible({
      timeout: 20_000,
    });

    // --- The room shows up on /messages for a member ---
    await memberPage.goto("/messages");
    await expect(memberPage.getByText(/team chat ·/i).first()).toBeVisible();

    // --- An outsider is turned away from the page AND from the endpoint ---
    await outsiderPage.goto(`/p/${slug}/chat`);
    await expect(outsiderPage).toHaveURL(new RegExp(`/p/${slug}$`));

    const chat = await testDb.projectChat.findUnique({ where: { projectId: team!.projectId } });
    expect(chat).toBeTruthy();

    const forbidden = await outsiderPage.request.get(
      `/api/project-chats/${chat!.id}/messages`
    );
    expect(forbidden.status()).toBe(403);

    const rejectedWrite = await outsiderPage.request.post(
      `/api/project-chats/${chat!.id}/messages`,
      { data: { body: "let me in" } }
    );
    expect(rejectedWrite.status()).toBe(403);

    await ownerCtx.close();
    await memberCtx.close();
    await outsiderCtx.close();
  });

  test("a block hides one teammate from one viewer without closing the room", async ({
    browser,
  }) => {
    test.setTimeout(180_000);

    const team = await findTeamProject();
    expect(team).toBeTruthy();
    const { slug, owner, second, third } = team!;

    // Start clean in case an earlier run left state behind.
    await testDb.block.deleteMany({
      where: {
        OR: [
          { blockerProfileId: owner.profileId, blockedProfileId: second.profileId },
          { blockerProfileId: second.profileId, blockedProfileId: owner.profileId },
        ],
      },
    });

    const ownerCtx = await browser.newContext();
    const blockedCtx = await browser.newContext();
    const bystanderCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();
    const blockedPage = await blockedCtx.newPage();
    const bystanderPage = await bystanderCtx.newPage();

    await login(ownerPage, owner.email);
    await login(blockedPage, second.email);
    await login(bystanderPage, third.email);

    // Make sure the room exists before anyone blocks anyone.
    await ownerPage.goto(`/p/${slug}/chat`);
    await expect(chatComposer(ownerPage)).toBeVisible();

    // --- The owner blocks a teammate ---
    await ownerPage.goto(`/u/${second.handle}`);
    await ownerPage.getByRole("button", { name: /^block$/i }).click();
    await ownerPage.getByRole("button", { name: /^confirm$/i }).click();
    await expect(
      ownerPage.getByText(new RegExp(`blocked ${second.name}`, "i")).first()
    ).toBeVisible();

    // --- The blocked teammate is told nothing, and can still talk to the team ---
    const stamp = Date.now();
    const hidden = `deploy is green ${stamp}`;
    await blockedPage.goto(`/p/${slug}/chat`);
    // The composer is OPEN. This is the whole point of the rule: a block between
    // two people must not take a shared room away from either of them.
    await expect(chatComposer(blockedPage)).toBeVisible();
    await expect(blockedPage.getByText(/read-only/i)).toHaveCount(0);
    await expect(blockedPage.getByText(/blocked/i)).toHaveCount(0);
    await send(blockedPage, hidden);

    // --- The bystander sees it, so the room is genuinely still working ---
    await bystanderPage.goto(`/p/${slug}/chat`);
    await expect(bystanderPage.getByText(hidden, { exact: true })).toBeVisible({
      timeout: 20_000,
    });

    // --- The blocker does not, on the transcript or in the listing ---
    await ownerPage.goto(`/p/${slug}/chat`);
    await expect(ownerPage.getByText(hidden, { exact: true })).toHaveCount(0);

    await ownerPage.goto("/messages");
    await expect(ownerPage.getByText(hidden, { exact: true })).toHaveCount(0);

    // ...and the endpoint itself withholds it, not just the rendering.
    const chat = await testDb.projectChat.findUnique({ where: { projectId: team!.projectId } });
    const poll = await ownerPage.request.get(`/api/project-chats/${chat!.id}/messages`);
    expect(poll.ok()).toBeTruthy();
    expect(JSON.stringify(await poll.json())).not.toContain(hidden);

    // Leave no state behind for the next run.
    await testDb.block.deleteMany({
      where: { blockerProfileId: owner.profileId, blockedProfileId: second.profileId },
    });

    await ownerCtx.close();
    await blockedCtx.close();
    await bystanderCtx.close();
  });

  test("removing someone from the project removes them from its chat", async ({ browser }) => {
    test.setTimeout(180_000);

    const team = await findTeamProject();
    expect(team).toBeTruthy();
    const { projectId, slug, owner, third } = team!;

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await login(page, third.email);

    // In while they are on the team.
    await page.goto(`/p/${slug}/chat`);
    await expect(chatComposer(page)).toBeVisible();

    const chat = await testDb.projectChat.findUnique({ where: { projectId } });
    expect(chat).toBeTruthy();

    // Removing the membership is the ONLY write. There is no chat member row to
    // clean up as well — that is the reason the chat has no member table — so if
    // access survived this, the two lists would have drifted.
    const removed = await testDb.membership.delete({
      where: { projectId_profileId: { projectId, profileId: third.profileId } },
    });

    try {
      await page.goto(`/p/${slug}/chat`);
      await expect(page).toHaveURL(new RegExp(`/p/${slug}$`));

      const forbidden = await page.request.get(`/api/project-chats/${chat!.id}/messages`);
      expect(forbidden.status()).toBe(403);
    } finally {
      // Put the team back the way the seed left it.
      await testDb.membership.create({
        data: {
          projectId,
          profileId: third.profileId,
          role: removed.role,
          isOwner: removed.isOwner,
          joinedAt: removed.joinedAt,
        },
      });
      await ctx.close();
    }
  });
});
