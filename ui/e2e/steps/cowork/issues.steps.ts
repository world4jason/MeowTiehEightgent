import { createBdd } from "playwright-bdd";
import { test } from "../../support/fixtures";
import { expect } from "@playwright/test";
import { CoworkLayout } from "../../support/pages/CoworkLayout";
import { IssueDetail } from "../../support/pages/IssueDetail";

const { Given, When, Then } = createBdd(test);

When("I navigate to the Issues page", async ({ page }) => {
  const cowork = new CoworkLayout(page);
  await cowork.navigateTo("Issues");
});

When("I click {string}", async ({ page }, label: string) => {
  await page.getByRole("button", { name: label }).click();
});

When("I fill in the issue title {string}", async ({ page }, title: string) => {
  await page.getByLabel(/title/i).fill(title);
});

When("I submit the issue form", async ({ page }) => {
  await page.getByRole("button", { name: /submit|create|save/i }).click();
  await page.waitForLoadState("networkidle");
});

Then("the issue {string} should appear in the issue list", async ({ page }, title: string) => {
  await expect(page.getByRole("list").getByText(title)).toBeVisible();
});

Given("there is an issue {string} with status {string}", async ({ factory }, title: string, status: string) => {
  await factory.createIssue({ title, status });
});

When("I open the issue {string}", async ({ page }, title: string) => {
  await page.getByRole("link", { name: title }).click();
  await page.waitForLoadState("networkidle");
});

When("I change the status to {string}", async ({ page }, status: string) => {
  const detail = new IssueDetail(page);
  await detail.changeStatus(status);
});

Then("the issue status should be {string}", async ({ page }, status: string) => {
  await expect(page.getByRole("combobox", { name: /status/i })).toContainText(new RegExp(status, "i"));
});

Given("there is an issue {string}", async ({ factory }, title: string) => {
  await factory.createIssue({ title });
});

When("I open the status dropdown", async ({ page }) => {
  await page.getByRole("combobox", { name: /status/i }).click();
});

Then("the available statuses should include {string} and {string}", async ({ page }, status1: string, status2: string) => {
  await expect(page.getByRole("option", { name: new RegExp(status1, "i") })).toBeVisible();
  await expect(page.getByRole("option", { name: new RegExp(status2, "i") })).toBeVisible();
});

Then("should not include {string}", async ({ page }, status: string) => {
  await expect(page.getByRole("option", { name: new RegExp(status, "i") })).not.toBeVisible();
});
