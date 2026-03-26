import { createBdd } from "playwright-bdd";
import { test } from "../../support/fixtures";
import { expect } from "@playwright/test";
import { SettingsPage } from "../../support/pages/SettingsPage";

const { Given, When, Then } = createBdd(test);

Given(
  "there is an agent {string}",
  async ({ page, factory }, name: string) => {
    await factory.createAgent({ name });
    // Reload so the newly seeded agent is visible
    await page.reload();
    await page.waitForLoadState("networkidle");
  }
);

When("I fill in agent name {string}", async ({ page }, name: string) => {
  // If the "choose" step is shown, click "從零開始" first to get to the form
  const scratchButton = page.getByText("從零開始").first();
  if (await scratchButton.isVisible().catch(() => false)) {
    await scratchButton.click();
  }
  // The name input has placeholder "例：my-agent"
  await page.getByPlaceholder("例：my-agent").fill(name);
});

When(
  "I set emoji to {string} and color to {string}",
  async ({ page }, emoji: string, color: string) => {
    // Emoji input has placeholder "🤖"
    const emojiInput = page.getByPlaceholder("🤖");
    await emojiInput.fill(emoji);
    // Color field might be an input with type="color" or text input
    // In the AgentsTab, color is set via a color picker or text input
    const colorInput = page.locator("input[type='color']").or(page.getByPlaceholder("#"));
    if (await colorInput.first().isVisible().catch(() => false)) {
      await colorInput.first().fill(color);
    }
  }
);

When("I submit the agent form", async ({ page }) => {
  // Create button text is "建立", save button is "儲存"
  await page.getByRole("button", { name: /建立|儲存|submit|create|save/i }).first().click();
  await page.waitForLoadState("networkidle");
});

Then(
  "{string} should appear in the agent list with emoji {string}",
  async ({ page }, name: string, emoji: string) => {
    const agentRow = page.getByText(new RegExp(name, "i"));
    await expect(agentRow).toBeVisible();
    await expect(page.getByText(emoji)).toBeVisible();
  }
);

When("I edit the agent {string}", async ({ page }, name: string) => {
  const row = page.getByText(new RegExp(name, "i")).locator("..");
  await row.getByRole("button", { name: /edit/i }).click();
  await page.waitForLoadState("networkidle");
});

When("I assign the skill {string}", async ({ page }, skill: string) => {
  await page.getByRole("combobox", { name: /skill/i }).click();
  await page.getByRole("option", { name: new RegExp(skill, "i") }).click();
  await page.getByRole("button", { name: /submit|save/i }).click();
  await page.waitForLoadState("networkidle");
});

Then(
  "the agent should have skill {string} listed",
  async ({ page }, skill: string) => {
    await expect(page.getByText(new RegExp(skill, "i"))).toBeVisible();
  }
);

When(
  "I edit the agent and select model {string}",
  async ({ page }, model: string) => {
    await page.getByRole("combobox", { name: /model/i }).click();
    await page.getByRole("option", { name: new RegExp(model, "i") }).click();
    await page.getByRole("button", { name: /submit|save/i }).click();
    await page.waitForLoadState("networkidle");
  }
);

Then(
  "the agent should be configured with model {string}",
  async ({ page }, model: string) => {
    await expect(
      page.getByRole("combobox", { name: /model/i })
    ).toContainText(new RegExp(model, "i"));
  }
);
