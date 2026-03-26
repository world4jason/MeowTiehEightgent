import { createBdd } from "playwright-bdd";
import { test } from "../../support/fixtures";
import { expect } from "@playwright/test";
import { SettingsPage } from "../../support/pages/SettingsPage";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Given, When, Then } = createBdd(test);

When(
  "I create a workspace {string}",
  async ({ page }, name: string) => {
    await page.getByRole("button", { name: /create|add workspace/i }).click();
    await page.getByLabel(/name/i).fill(name);
  }
);

When(
  "I set the system prompt to {string}",
  async ({ page }, prompt: string) => {
    await page.getByLabel(/system prompt/i).fill(prompt);
    await page.getByRole("button", { name: /submit|create|save/i }).click();
    await page.waitForLoadState("networkidle");
  }
);

Then(
  "{string} should appear in the workspace list",
  async ({ page }, name: string) => {
    await expect(page.getByText(new RegExp(name, "i"))).toBeVisible();
  }
);

Given(
  "there is a workspace {string}",
  async ({ page, factory }, name: string) => {
    await factory.createWorkspace({ name });
    await page.reload();
    await page.waitForLoadState("networkidle");
  }
);

When(
  "I assign {string} as default agent",
  async ({ page }, agentName: string) => {
    await page.getByRole("combobox", { name: /default agent/i }).click();
    await page
      .getByRole("option", { name: new RegExp(agentName, "i") })
      .click();
    await page.getByRole("button", { name: /submit|save/i }).click();
    await page.waitForLoadState("networkidle");
  }
);

Then(
  "{string} should be listed as default agent",
  async ({ page }, agentName: string) => {
    await expect(
      page.getByRole("combobox", { name: /default agent/i })
    ).toContainText(new RegExp(agentName, "i"));
  }
);

When("I upload the file {string}", async ({ page }, fileName: string) => {
  const fileInput = page.locator('input[type="file"]');
  // Use a test fixture file path; the file is expected to exist in e2e fixtures
  const filePath = path.join(
    __dirname,
    "../../fixtures",
    fileName
  );
  await fileInput.setInputFiles(filePath);
  await page.waitForLoadState("networkidle");
});

Then(
  "{string} should appear in the workspace files",
  async ({ page }, fileName: string) => {
    await expect(page.getByText(new RegExp(fileName, "i"))).toBeVisible();
  }
);
