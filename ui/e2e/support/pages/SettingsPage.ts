import type { Page } from "@playwright/test";

export class SettingsPage {
  constructor(private page: Page) {}

  async selectTab(tabName: string) {
    await this.page.getByRole("tab", { name: new RegExp(tabName, "i") }).click();
  }

  async waitForTabContent() {
    await this.page.waitForLoadState("networkidle");
  }
}
