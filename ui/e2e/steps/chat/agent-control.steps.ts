import { createBdd } from "playwright-bdd";
import { test } from "../../support/fixtures";
import { expect } from "@playwright/test";
import { AgentControlBar } from "../../support/pages/AgentControlBar";

const { Given, When, Then } = createBdd(test);

Given("the agent is streaming a response", async ({ page }) => {
  // Trigger a message to start streaming
  const chatInput = page.getByLabel("Message input");
  await chatInput.fill("Please write a long response");
  await chatInput.press("Shift+Enter");
  // Wait for streaming to begin
  await expect(
    page.locator("[data-testid='streaming-indicator'], .streaming, [data-testid='agent-message']").first()
  ).toBeVisible({ timeout: 10000 });
});

Given("the agent is paused", async ({ page }) => {
  // Start streaming then pause
  const chatInput = page.getByLabel("Message input");
  await chatInput.fill("Please write a long response");
  await chatInput.press("Shift+Enter");
  const bar = new AgentControlBar(page);
  await expect(bar.pauseButton).toBeVisible({ timeout: 10000 });
  await bar.pauseButton.click();
  await expect(bar.resumeButton).toBeVisible({ timeout: 5000 });
});

When("I click the {string} button on the Agent Control Bar", async ({ page }, label: string) => {
  const bar = new AgentControlBar(page);
  if (/pause/i.test(label)) {
    await bar.pauseButton.click();
  } else if (/resume/i.test(label)) {
    await bar.resumeButton.click();
  } else {
    await page.getByRole("button", { name: new RegExp(label, "i") }).click();
  }
});

Then("the agent should stop responding", async ({ page }) => {
  // After pause, the streaming indicator should disappear
  await expect(
    page.locator("[data-testid='streaming-indicator'], .streaming").first()
  ).not.toBeVisible({ timeout: 5000 });
});

Then("the pause button should change to {string}", async ({ page }, label: string) => {
  const bar = new AgentControlBar(page);
  if (/resume/i.test(label)) {
    await expect(bar.resumeButton).toBeVisible();
  } else {
    await expect(page.getByRole("button", { name: new RegExp(label, "i") })).toBeVisible();
  }
});

Then("the agent should continue responding", async ({ page }) => {
  // After resume, streaming or agent activity should be visible again
  await expect(
    page.locator("[data-testid='streaming-indicator'], .streaming, [data-testid='agent-message']").first()
  ).toBeVisible({ timeout: 10000 });
});
