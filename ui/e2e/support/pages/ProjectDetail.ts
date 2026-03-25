import type { Page } from "@playwright/test";

export class ProjectDetail {
  constructor(private page: Page) {}

  async openSettings() {
    await this.page.getByRole("tab", { name: /settings/i }).click();
  }
}
