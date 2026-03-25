import type { Page } from "@playwright/test";

export class CoworkLayout {
  constructor(private page: Page) {}

  async navigateTo(section: string) {
    await this.page.getByRole("link", { name: new RegExp(section, "i") }).click();
    await this.page.waitForLoadState("networkidle");
  }
}
