import { createBdd } from "playwright-bdd";
import { test } from "../../support/fixtures";
import { expect } from "@playwright/test";

const { Given, When, Then } = createBdd(test);

Given("there is an active chat session", async ({ page }) => {
  // Use the "+ New Chat" button to create and activate a session via the UI
  await page.getByRole("button", { name: /new chat/i }).click();
  // Wait for the chat input to appear (new session is active)
  await page.getByLabel("Message input").waitFor({ state: "visible", timeout: 15000 });
});

Given("the room goal is {string}", async ({ page }, goal: string) => {
  // Create and activate session via UI
  await page.getByRole("button", { name: /new chat/i }).click();
  await page.getByLabel("Message input").waitFor({ state: "visible", timeout: 15000 });
  // Set goal via UI
  const editButton = page.getByLabel("編輯目標");
  await editButton.click({ timeout: 10000 });
  const goalInput = page.getByPlaceholder("輸入討論目標...");
  await goalInput.fill(goal);
  await goalInput.press("Enter");
  await expect(page.getByText(goal)).toBeVisible({ timeout: 5000 });
});

When("I set the room goal to {string}", async ({ page }, goal: string) => {
  // RoomGoalBar: click the edit button (pencil icon), then fill the input
  const editButton = page.getByLabel("編輯目標");
  await editButton.click();
  // Now an input with placeholder "輸入討論目標..." appears
  const goalInput = page.getByPlaceholder("輸入討論目標...");
  await goalInput.fill(goal);
  await goalInput.press("Enter");
});

When("I reload the page", async ({ page }) => {
  await page.reload();
  await page.waitForLoadState("networkidle");
});

Then("the Room Goal Bar should display {string}", async ({ page }, goal: string) => {
  // The RoomGoalBar shows the goal as a clickable span
  await expect(page.getByText(goal)).toBeVisible({ timeout: 5000 });
});
