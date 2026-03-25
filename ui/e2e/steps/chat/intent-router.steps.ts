import { createBdd } from "playwright-bdd";
import { test } from "../../support/fixtures";
import { expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";

const { Given, When, Then } = createBdd(test);

Given("the agent response contains a SUGGEST_ISSUE marker", async ({ page }) => {
  // Intercept the chat streaming endpoint and inject a mock response with SUGGEST_ISSUE
  const mockPath = path.resolve(__dirname, "../../fixtures/mock-responses/suggest-issue.json");
  const mockBody = fs.existsSync(mockPath) ? fs.readFileSync(mockPath, "utf-8") : "";

  await page.route("**/chat/api/sessions/*/messages", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: mockBody || JSON.stringify({ role: "assistant", content: "SUGGEST_ISSUE: Implement feature X" }),
      });
    } else {
      await route.continue();
    }
  });

  // Send a message to trigger the mocked response
  const chatInput = page.getByRole("textbox");
  await chatInput.fill("Can you help me track this work?");
  await chatInput.press("Enter");
});

Given("an Issue Card is visible", async ({ page }) => {
  // Verify an Issue Card is already present in the message list
  await expect(
    page.locator("[data-testid='issue-card']").first()
  ).toBeVisible({ timeout: 10000 });
});

When("I click {string} on the Issue Card", async ({ page }, label: string) => {
  const issueCard = page.locator("[data-testid='issue-card']").first();
  await issueCard.getByRole("button", { name: new RegExp(label, "i") }).click();
});

Then("an Issue Card should appear in the message list", async ({ page }) => {
  await expect(
    page.locator("[data-testid='issue-card']").first()
  ).toBeVisible({ timeout: 10000 });
});

Then("the issue should be created in Cowork", async ({ page }) => {
  // After clicking "Create Issue", expect a success toast or the card status to update
  await expect(
    page.locator("[data-testid='issue-created-toast'], [data-testid='issue-card'][data-status='created']").or(
      page.getByText(/issue created/i)
    )
  ).toBeVisible({ timeout: 10000 });
});
