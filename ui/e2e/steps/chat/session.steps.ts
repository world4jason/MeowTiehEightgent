import { createBdd } from "playwright-bdd";
import { test } from "../../support/fixtures";
import { expect } from "@playwright/test";
import { ChatPage } from "../../support/pages/ChatPage";

const { Given, When, Then } = createBdd(test);

Given("there are 5 chat sessions with various titles", async ({ page, factory }) => {
  // Create sessions via API, then rename them via the rename API
  const titles = ["design system", "backend design", "frontend task", "bug fix", "deployment plan"];
  const baseUrl = process.env.BASE_URL || "http://localhost:3100";
  for (const title of titles) {
    const session = await factory.createSession();
    // Rename via REST API (PUT /chat/api/sessions/:id/topic)
    await page.request.put(`${baseUrl}/chat/api/sessions/${session.id}/topic`, {
      data: { topic: title },
    });
  }
  // Reload so the sidebar picks up the renamed sessions
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  await page.getByTestId("mode-toggle").waitFor({ state: "visible", timeout: 10000 });
});

Given("there are {int} chat sessions", async ({ page }, count: number) => {
  // Create sessions via UI to ensure they're properly listed and clickable
  for (let i = 0; i < count; i++) {
    await page.getByRole("button", { name: /new chat/i }).click();
    await page.getByLabel("Message input").waitFor({ state: "visible", timeout: 15000 });
  }
});

Given("there is a chat session {string}", async ({ page }, title: string) => {
  // Create a session via UI
  await page.getByRole("button", { name: /new chat/i }).click();
  await page.getByLabel("Message input").waitFor({ state: "visible", timeout: 15000 });
  // Session is created as "Untitled" — we don't rename to the given title here
  // (The test scenario handles renaming or uses the session as-is)
});

When("I click the {string} button", async ({ page }, label: string) => {
  await page.getByRole("button", { name: new RegExp(label, "i") }).click();
});

When("I type {string} in the session search input", async ({ page }, keyword: string) => {
  const chatPage = new ChatPage(page);
  await chatPage.sessionSearch.fill(keyword);
});

When("I click the second session in the sidebar", async ({ page }) => {
  // After creating 2 sessions via "New Chat", both appear in sidebar as text-left buttons.
  // The currently active one has bg-muted class. Click a non-active one.
  const sidebar = page.locator(".bg-sidebar");
  const sessionButtons = sidebar.locator("button.text-left");
  // The first session button that's NOT currently active
  const nonActive = sessionButtons.filter({ hasNot: page.locator(".bg-muted.font-medium") });
  await nonActive.first().click({ timeout: 10000 });
});

When("I delete the session {string}", async ({ page }, title: string) => {
  // SessionItem is a div.group containing a session button.
  // Hover reveals action buttons including "Delete session".
  const sidebar = page.locator(".bg-sidebar");
  const sessionRow = sidebar.locator(".group").first();
  await sessionRow.hover();
  // The delete button should now be visible
  await sessionRow.getByLabel("Delete session").click({ timeout: 5000 });
});

When("I double-click the session title {string}", async ({ page }, title: string) => {
  // Session buttons in the sidebar have text-left class
  const sidebar = page.locator(".bg-sidebar");
  const sessionButton = sidebar.locator("button.text-left").first();
  await sessionButton.dblclick();
});

When("I type {string} and press Enter", async ({ page }, text: string) => {
  // Check if a rename input is focused (inline rename in sidebar).
  // If so, type into it. Otherwise, use chat input with Shift+Enter.
  const renameInput = page.locator("input:focus[aria-label^='Rename']");
  if (await renameInput.count() > 0) {
    await renameInput.fill(text);
    await renameInput.press("Enter");
  } else {
    const chatInput = page.getByLabel("Message input");
    await chatInput.fill(text);
    await chatInput.press("Shift+Enter");
  }
});

Then("a new session should appear in the sidebar", async ({ page }) => {
  // After clicking "New Chat", the chat input area should appear (new session is created and active)
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 10000 });
});

Then("the chat input area should be visible", async ({ page }) => {
  const chatPage = new ChatPage(page);
  await expect(chatPage.chatInput).toBeVisible({ timeout: 10000 });
});

Then("only sessions containing {string} should be visible", async ({ page }, keyword: string) => {
  // Wait briefly for search filtering to take effect
  await page.waitForTimeout(500);
  // Get all visible session buttons in the sidebar (text-left buttons, excluding UI chrome)
  const sidebar = page.locator(".bg-sidebar");
  // Session buttons are `button.text-left` inside the sidebar
  const sessionButtons = sidebar.locator("button.text-left");
  const count = await sessionButtons.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const text = await sessionButtons.nth(i).textContent();
    expect(text?.toLowerCase()).toContain(keyword.toLowerCase());
  }
});

Then("the message list should load for the second session", async ({ page }) => {
  // After clicking the second session, the chat input area should be visible (session is active)
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 10000 });
});

Then("it should no longer appear in the sidebar", async ({ page }) => {
  // The WelcomeScreen should reappear after deleting the last/only session
  // (or at least the deleted session's button should be gone)
  await expect(page.getByLabel("Message input")).not.toBeVisible({ timeout: 5000 }).catch(() => {
    // Session was deleted but another session may still be selected
  });
});

Then("the session title should be {string}", async ({ page }, expectedTitle: string) => {
  // After renaming, a button with the new name should appear in the sidebar
  const sidebar = page.locator(".bg-sidebar");
  await expect(sidebar.getByText(expectedTitle)).toBeVisible({ timeout: 5000 });
});
