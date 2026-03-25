import { createBdd } from "playwright-bdd";
import { test } from "../../support/fixtures";
import { expect } from "@playwright/test";
import { ModeToggle } from "../../support/pages/ModeToggle";
import { CoworkLayout } from "../../support/pages/CoworkLayout";

const { Given, When, Then } = createBdd(test);

Given("I am logged in and on the Cowork Goals page", async ({ page }) => {
  await page.goto("/");
  const toggle = new ModeToggle(page);
  await toggle.switchTo("cowork");
  const cowork = new CoworkLayout(page);
  await cowork.navigateTo("Goals");
});

When("I create a new goal {string}", async ({ page }, title: string) => {
  await page.getByRole("button", { name: /new goal|create goal/i }).click();
  await page.getByLabel(/title/i).fill(title);
  await page.getByRole("button", { name: /submit|create|save/i }).click();
  await page.waitForLoadState("networkidle");
});

Then("the goal should appear in the goals list", async ({ page, factory }) => {
  await expect(page.getByTestId("goal-list")).toBeVisible();
});

Given("there is a goal {string}", async ({ factory }, title: string) => {
  await factory.createGoal({ title });
});

When("I open the goal", async ({ page }) => {
  await page.getByTestId("goal-item").first().click();
  await page.waitForLoadState("networkidle");
});

Then("the goal detail page should be visible", async ({ page }) => {
  await expect(page.getByTestId("goal-detail")).toBeVisible();
});
