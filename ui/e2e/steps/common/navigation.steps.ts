import { createBdd } from "playwright-bdd";
import { test } from "../../support/fixtures";
import { ModeToggle } from "../../support/pages/ModeToggle";
import { ChatPage } from "../../support/pages/ChatPage";

const { Given, When, Then } = createBdd(test);

Given("I am on the Chat page", async ({ page }) => {
  const chatPage = new ChatPage(page);
  await chatPage.goto();
  await chatPage.waitForReady();
});

Given("I am on the Cowork page", async ({ page }) => {
  await page.goto("/");
  const toggle = new ModeToggle(page);
  await toggle.switchTo("cowork");
});

Given("I am on the Settings page", async ({ page }) => {
  await page.goto("/");
  const toggle = new ModeToggle(page);
  await toggle.switchTo("settings");
});

When("I switch to {word} mode", async ({ page }, mode: string) => {
  const toggle = new ModeToggle(page);
  await toggle.switchTo(mode as "chat" | "cowork" | "settings");
});

When("I press {string}", async ({ page }, key: string) => {
  const keyMap: Record<string, string> = {
    "⌘1": "ControlOrMeta+1",
    "⌘2": "ControlOrMeta+2",
    "⌘3": "ControlOrMeta+3",
  };
  await page.keyboard.press(keyMap[key] || key);
});

When("I open the app", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
});
