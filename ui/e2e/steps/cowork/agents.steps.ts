import { createBdd } from "playwright-bdd";
import { test } from "../../support/fixtures";
import { expect } from "@playwright/test";
import { CoworkLayout } from "../../support/pages/CoworkLayout";

const { Given, When, Then } = createBdd(test);

When("I navigate to the Agents page", async ({ page }) => {
  const cowork = new CoworkLayout(page);
  await cowork.navigateTo("Agents");
});

Then("I should see the agent list", async ({ page }) => {
  await expect(page.getByTestId("agent-list")).toBeVisible();
});

Given("there are agents in various states", async ({ page }) => {
  // Agents exist in the system; this step verifies the page is ready
  await expect(page.getByTestId("agent-list")).toBeVisible();
});

When("I filter by {string} status", async ({ page }, status: string) => {
  await page.getByRole("combobox", { name: /filter|status/i }).click();
  await page.getByRole("option", { name: new RegExp(status, "i") }).click();
  await page.waitForLoadState("networkidle");
});

Then("only active agents should be visible", async ({ page }) => {
  const statuses = page.getByTestId("agent-status");
  const count = await statuses.count();
  for (let i = 0; i < count; i++) {
    await expect(statuses.nth(i)).toContainText(/active/i);
  }
});

Given("there is an agent {string} with completed runs", async ({ page }, agentName: string) => {
  // Agent is pre-existing in the system; navigate to agents page to verify visibility
  const cowork = new CoworkLayout(page);
  await cowork.navigateTo("Agents");
  await expect(page.getByText(new RegExp(agentName, "i"))).toBeVisible();
});

When("I click on agent {string}", async ({ page }, agentName: string) => {
  await page.getByRole("link", { name: new RegExp(agentName, "i") }).click();
  await page.waitForLoadState("networkidle");
});

Then("the agent detail page should show run history", async ({ page }) => {
  await expect(page.getByTestId("agent-run-history")).toBeVisible();
});
