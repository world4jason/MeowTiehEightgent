import { createBdd } from "playwright-bdd";
import { test } from "../../support/fixtures";
import { expect } from "@playwright/test";
import { CoworkLayout } from "../../support/pages/CoworkLayout";
import { ProjectDetail } from "../../support/pages/ProjectDetail";

const { Given, When, Then } = createBdd(test);

When("I navigate to the Projects page", async ({ page }) => {
  const cowork = new CoworkLayout(page);
  await cowork.navigateTo("Projects");
});

When("I fill in the project name {string}", async ({ page }, name: string) => {
  await page.getByLabel(/name/i).fill(name);
});

When("I submit the project form", async ({ page }) => {
  await page.getByRole("button", { name: /submit|create|save/i }).click();
  await page.waitForLoadState("networkidle");
});

Then("the project {string} should appear in the project list", async ({ page }, name: string) => {
  await expect(page.getByRole("list").getByText(name)).toBeVisible();
});

Given("there is a project {string} with {int} issues", async ({ factory }, name: string, count: number) => {
  const project = await factory.createProject({ name });
  for (let i = 0; i < count; i++) {
    await factory.createIssue({ title: `${name} issue ${i + 1}` });
  }
});

When("I open the project {string}", async ({ page }, name: string) => {
  await page.getByRole("link", { name }).click();
  await page.waitForLoadState("networkidle");
});

Then("I should see {int} issues listed under the project", async ({ page }, count: number) => {
  const items = page.getByTestId("issue-item");
  await expect(items).toHaveCount(count);
});

Given("there is a project {string}", async ({ factory }, name: string) => {
  await factory.createProject({ name });
});

When("I open the project settings", async ({ page }) => {
  const detail = new ProjectDetail(page);
  await detail.openSettings();
});

When("I set the budget to {string}", async ({ page }, budget: string) => {
  await page.getByLabel(/budget/i).fill(budget);
  await page.getByRole("button", { name: /save/i }).click();
  await page.waitForLoadState("networkidle");
});

Then("the project budget should display {string}", async ({ page }, budget: string) => {
  await expect(page.getByTestId("project-budget")).toContainText(budget);
});
