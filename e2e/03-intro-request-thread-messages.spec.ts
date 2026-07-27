import { test, expect } from "@playwright/test";
import { signup, verifyEmail, completeOnboarding, login, DEMO_EMAIL } from "./fixtures";
import { testDb } from "./db";
import { restartServer } from "./server-control";

// Scenario 3: intro request against an open role -> accept -> thread created ->
// message both directions -> content survives a real server restart.
test("intro request, accept, two-way messaging, survives restart", async ({ browser }) => {
  test.setTimeout(180_000);

  // Pick a seeded OPEN role whose owner isn't the demo account.
  const role = await testDb.openRole.findFirst({
    where: {
      status: "OPEN",
      project: {
        visibility: "PUBLIC",
        memberships: { some: { isOwner: true, profile: { user: { email: { not: DEMO_EMAIL } } } } },
      },
    },
    include: {
      project: {
        include: {
          memberships: {
            where: { isOwner: true },
            include: { profile: { include: { user: true } } },
          },
        },
      },
    },
  });
  expect(role).toBeTruthy();
  const owner = role!.project.memberships[0]!.profile;
  const ownerEmail = owner.user.email;
  const slug = role!.project.slug;

  const unique = Date.now();
  const senderEmail = `restarttester${unique}@e2e.edu`;
  const senderHandle = `restart-tester-${unique}`;

  // --- Sender context: fresh account, verified + onboarded ---
  const senderCtx = await browser.newContext();
  const sender = await senderCtx.newPage();
  await signup(sender, senderEmail);
  await verifyEmail(sender, senderEmail);
  await sender.goto("/onboarding");
  await completeOnboarding(sender, {
    name: `Restart Tester ${unique}`,
    handle: senderHandle,
    school: "State University",
    skills: ["React", "TypeScript", "Node"],
    learning: ["Rust"],
  });

  // Sender opens the project and requests an intro on the open role.
  await sender.goto(`/p/${slug}`);
  await sender.getByRole("button", { name: /request intro/i }).first().click();
  const note =
    "I saw this open role and it lines up closely with what I have been building this semester — would love to compare notes.";
  await sender.getByLabel(/your note/i).fill(note);
  await sender.getByRole("button", { name: /send request/i }).click();
  await expect(sender.getByText(/intro request sent/i)).toBeVisible();

  // --- Recipient context: the role owner accepts ---
  const recipientCtx = await browser.newContext();
  const recipient = await recipientCtx.newPage();
  await login(recipient, ownerEmail);
  await recipient.goto("/requests?tab=received");
  const card = recipient
    .locator("article")
    .filter({ hasText: `Restart Tester ${unique}` })
    .first();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: /^accept$/i }).click();
  await recipient.waitForURL(/\/messages\/.+/);
  const threadUrl = recipient.url();

  // Recipient sends the first message.
  await recipient.getByLabel("Message").fill("Hey — thanks for reaching out, happy to chat.");
  await recipient.getByRole("button", { name: /^send$/i }).click();
  await expect(recipient.getByText("Hey — thanks for reaching out, happy to chat.")).toBeVisible();

  // --- Sender opens the same thread from the sent tab and replies ---
  await sender.goto("/requests?tab=sent");
  await sender.getByRole("link", { name: /open thread/i }).first().click();
  await sender.waitForURL(/\/messages\/.+/);
  // Sender should see the recipient's message via initial load / polling.
  await expect(sender.getByText("Hey — thanks for reaching out, happy to chat.")).toBeVisible({
    timeout: 10_000,
  });
  await sender.getByLabel("Message").fill("Awesome — here is what I have so far.");
  await sender.getByRole("button", { name: /^send$/i }).click();
  await expect(sender.getByText("Awesome — here is what I have so far.")).toBeVisible();

  // Recipient sees the reply via polling (no manual reload).
  await expect(recipient.getByText("Awesome — here is what I have so far.")).toBeVisible({
    timeout: 10_000,
  });

  // --- Restart the server, then confirm both messages persisted ---
  await restartServer();

  await sender.goto(threadUrl);
  await expect(sender.getByText("Hey — thanks for reaching out, happy to chat.")).toBeVisible();
  await expect(sender.getByText("Awesome — here is what I have so far.")).toBeVisible();

  await recipient.goto(threadUrl);
  await expect(recipient.getByText("Hey — thanks for reaching out, happy to chat.")).toBeVisible();
  await expect(recipient.getByText("Awesome — here is what I have so far.")).toBeVisible();

  await senderCtx.close();
  await recipientCtx.close();
});
