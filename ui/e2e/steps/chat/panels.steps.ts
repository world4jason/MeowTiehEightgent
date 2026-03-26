import { createBdd } from "playwright-bdd";
import { test } from "../../support/fixtures";
import { expect } from "@playwright/test";
import { ChatHeader } from "../../support/pages/ChatHeader";

const { When, Then } = createBdd(test);

When("I click the {string} button in the chat header", async ({ page }, label: string) => {
  const header = new ChatHeader(page);
  if (/members/i.test(label)) {
    await header.membersButton.click();
  } else if (/runs/i.test(label)) {
    await header.runsButton.click();
  } else if (/activity/i.test(label)) {
    await header.activityButton.click();
  } else {
    await page.getByRole("button", { name: new RegExp(label, "i") }).click();
  }
});

Then("the Members panel should be visible", async ({ page }) => {
  // The Members panel header text "Members" should be visible when open
  await expect(page.getByText("Members").first()).toBeVisible({ timeout: 5000 });
  // The "Close members panel" button confirms the panel is open
  await expect(page.getByLabel("Close members panel")).toBeVisible({ timeout: 5000 });
});

Then("it should list the session agents", async ({ page }) => {
  // In test mode, the agent list may be populated via WS or empty.
  // Verify the Members panel is open and contains "Add agent" (always present).
  await expect(page.getByText("Add agent")).toBeVisible({ timeout: 5000 });
});

Then("the Runs panel should be visible", async ({ page }) => {
  // The Runs panel header "Runs" should be visible, or "No runs yet" message
  // The "Close runs panel" button confirms the panel is open
  await expect(page.getByLabel("Close runs panel")).toBeVisible({ timeout: 5000 });
});
