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
  await page.getByLabel(/name/i).fill(name);
});

When(
  "I set emoji to {string} and color to {string}",
  async ({ page }, emoji: string, color: string) => {
    const emojiInput = page.getByLabel(/emoji/i);
    await emojiInput.fill(emoji);
    const colorInput = page.getByLabel(/color/i);
    await colorInput.fill(color);
  }
);

When("I submit the agent form", async ({ page }) => {
  await page.getByRole("button", { name: /submit|create|save/i }).click();
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
