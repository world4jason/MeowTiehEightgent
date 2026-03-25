import type { Page } from "@playwright/test";

export class IssueDetail {
  constructor(private page: Page) {}

  async changeStatus(status: string) {
    await this.page.getByRole("combobox", { name: /status/i }).click();
    await this.page.getByRole("option", { name: new RegExp(status, "i") }).click();
  }
}
