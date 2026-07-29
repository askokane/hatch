import { type Page, expect } from "@playwright/test";

export const DEMO_PASSWORD = "HatchDemo!2026";
export const DEMO_EMAIL = "demo@stateu.edu";

// Log in as a seeded user via the real login form.
export async function login(page: Page, email: string, password = DEMO_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL(/\/(discover|onboarding)/);
  // Let the post-login navigation finish. Issuing the next goto while the
  // router is still resolving the redirect aborts it.
  await page.waitForLoadState("load");
}

// Sign up a brand-new account through the real UI. Returns the email used.
// There is no verification step — the account is usable immediately, and the
// signup redirect lands straight on onboarding.
export async function signup(page: Page, email: string, password = DEMO_PASSWORD) {
  await page.goto("/signup");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL(/\/onboarding/);
  return email;
}

// Sign up and complete onboarding in one step — the usual precondition for the
// scenarios below, which care about what happens *after* a user exists.
export async function signupAndOnboard(
  page: Page,
  opts: { email: string; name: string; handle: string; school?: string }
) {
  await signup(page, opts.email);
  await page.goto("/onboarding");
  await completeOnboarding(page, {
    name: opts.name,
    handle: opts.handle,
    school: opts.school ?? "State University",
    skills: ["React", "TypeScript", "Node"],
    learning: ["Rust"],
  });
}

// Complete onboarding through the wizard. Assumes we're on /onboarding.
export async function completeOnboarding(
  page: Page,
  opts: { name: string; handle: string; school: string; skills: string[]; learning: string[] }
) {
  // Step 1 — identity
  await page.getByLabel("Name").fill(opts.name);
  await page.getByLabel("Handle").fill(opts.handle);
  await page.getByLabel("School").fill(opts.school);
  await page.getByRole("button", { name: /continue/i }).click();

  // Step 2 — skills
  for (const s of opts.skills) {
    await addTag(page, "Skills you have", s);
  }
  for (const l of opts.learning) {
    await addTag(page, "Learning", l);
  }
  await page.getByRole("button", { name: /continue/i }).click();

  // Step 3 — intent
  await page.getByText("Teammate", { exact: true }).click();
  await page.getByRole("button", { name: /finish setup/i }).click();
  await page.waitForURL(/\/discover/);
}

// Types into the TagPicker whose label matches `labelStartsWith` and clicks the
// first matching option. The picker input is associated with its label via
// htmlFor/id, so getByLabel targets the exact combobox (skills vs learning).
export async function addTag(page: Page, labelStartsWith: string, query: string) {
  const input = page.getByLabel(new RegExp(labelStartsWith, "i")).first();
  await input.click();
  await input.fill(query);
  const option = page.getByRole("option").filter({ hasText: new RegExp(query, "i") }).first();
  await option.waitFor({ state: "visible" });
  await option.click();
}

// The thread composer. Targeted by role rather than by label: the nav unread
// badge is labelled "N unread messages", which a substring label match would
// also hit.
export function composer(page: Page) {
  return page.getByRole("textbox", { name: "Message" });
}

export async function logout(page: Page) {
  await page.getByRole("button", { name: /log out/i }).click();
  await page.waitForURL(/\/login/);
}
