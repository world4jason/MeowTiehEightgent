import { createBdd } from "playwright-bdd";
import { test } from "../../support/fixtures";
import { expect } from "@playwright/test";
import { ChatPage } from "../../support/pages/ChatPage";

const { Given, When, Then } = createBdd(test);

Given("there is an active chat session with agent {string}", async ({ page }) => {
  // Use "+ New Chat" button to create and activate a session via UI
  await page.getByRole("button", { name: /new chat/i }).click();
  // Wait for the chat input to appear (new session is active)
  await page.getByLabel("Message input").waitFor({ state: "visible", timeout: 15000 });
});

Given("the WebSocket is disconnected", async ({ page }) => {
  // Simulate offline to force WS disconnect
  await page.context().setOffline(true);
  await page.waitForTimeout(500);
});

When("I type {string} in the chat input", async ({ page }, text: string) => {
  const chatPage = new ChatPage(page);
  await chatPage.chatInput.fill(text);
});

When("I press Enter", async ({ page }) => {
  // Default send mode is Shift+Enter (enterToSend=false)
  await page.keyboard.press("Shift+Enter");
});

Then("my message {string} should appear in the message list", async ({ page }, text: string) => {
  const chatPage = new ChatPage(page);
  await expect(chatPage.messageContaining(text)).toBeVisible();
});

Then("the agent should be streaming a response", async ({ page }) => {
  // Look for a streaming indicator or partial agent message
  await expect(
    page.locator("[data-testid='agent-message'], .agent-message, [data-testid='streaming-indicator']").first()
  ).toBeVisible({ timeout: 10000 });
});

Then("the chat input should be disabled", async ({ page }) => {
  const chatPage = new ChatPage(page);
  // When WS is disconnected, the textarea should have disabled attribute
  await expect(chatPage.chatInput).toBeDisabled({ timeout: 10000 });
});

Then("both messages should appear in the message list", async ({ page }) => {
  const chatPage = new ChatPage(page);
  await expect(chatPage.messageContaining("First question")).toBeVisible();
  await expect(chatPage.messageContaining("Second question")).toBeVisible();
});
