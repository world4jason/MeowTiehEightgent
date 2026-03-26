import type { Page } from "@playwright/test";

// Map English tab names (used in feature files) to Chinese labels or tab IDs
const TAB_MAP: Record<string, string> = {
  models: "模型",
  adapters: "Adapters",
  agents: "代理人",
  marketplace: "代理人市場",
  market: "代理人市場",
  skills: "技能",
  scenarios: "情境模板",
  workspaces: "工作區",
  soul: "靈魂",
  about: "關於",
};

export class SettingsPage {
  constructor(private page: Page) {}

  async selectTab(tabName: string) {
    // Settings tabs are rendered as <button> elements in a nav sidebar.
    // Try mapped Chinese label first, then fall back to matching by text.
    const mapped = TAB_MAP[tabName.toLowerCase()];
    if (mapped) {
      await this.page.getByRole("button", { name: mapped, exact: true }).click();
    } else {
      await this.page.getByRole("button", { name: new RegExp(tabName, "i") }).click();
    }
  }

  async waitForTabContent() {
    await this.page.waitForLoadState("networkidle");
  }
}
