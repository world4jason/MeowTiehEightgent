import { createBdd } from "playwright-bdd";
import { test } from "../../support/fixtures";
import { expect } from "@playwright/test";
import { ChatPage } from "../../support/pages/ChatPage";
import { ModeToggle } from "../../support/pages/ModeToggle";
import { CoworkLayout } from "../../support/pages/CoworkLayout";
import { IssueDetail } from "../../support/pages/IssueDetail";

const { Given, When, Then } = createBdd(test);

Given("I am on the Chat page with an active session", async ({ page }) => {
  const chatPage = new ChatPage(page);
  await chatPage.goto();
  await chatPage.waitForReady();
  // Create and activate a session via UI
  await page.getByRole("button", { name: /new chat/i }).click();
  await page.getByLabel("Message input").waitFor({ state: "visible", timeout: 15000 });
});

When("the agent creates an issue via intent router", async ({ page }) => {
  // Trigger a message that causes the mock agent to suggest an issue
  // The mock agent with "suggest-issue" tag returns [SUGGEST_ISSUE] marker
  const chatPage = new ChatPage(page);
  await chatPage.sendMessage("We should track this bug");
  // Wait for the agent response containing the issue suggestion
  await page.waitForTimeout(2000); // Wait for mock response
});

// "I navigate to the Issues page" is defined in cowork/issues.steps.ts

Then("the newly created issue should be visible", async ({ page }) => {
  // The issue created via intent router should appear in the Cowork issues list
  await expect(page.getByText(/Fix login bug/i)).toBeVisible({ timeout: 5000 });
});

Given("there is an issue created from Chat", async ({ page, factory }) => {
  // Seed an issue that simulates one created from Chat
  await factory.createIssue({ title: "Chat-created issue" });
});

When("I mark the issue as {string}", async ({ page }, status: string) => {
  // Open the issue and change its status
  await page.getByText("Chat-created issue").click();
  const issueDetail = new IssueDetail(page);
  await issueDetail.changeStatus(status);
});

Then("a system message about the completed issue should appear", async ({ page }) => {
  // After switching to Chat, a system message about the completed issue should be visible
  await expect(page.getByText(/issue.*done|completed/i)).toBeVisible({ timeout: 5000 });
});
