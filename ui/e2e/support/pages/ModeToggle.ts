import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export class ModeToggle {
  constructor(private page: Page) {}
  private get toggle() { return this.page.getByTestId("mode-toggle"); }

  async switchTo(mode: "chat" | "cowork" | "settings") {
    await this.toggle.getByRole("button", { name: new RegExp(mode, "i") }).click();
  }

  async expectActive(mode: "chat" | "cowork" | "settings") {
    await expect(
      this.toggle.getByRole("button", { name: new RegExp(mode, "i") })
    ).toHaveAttribute("aria-pressed", "true");
  }

  async switchViaKeyboard(mode: "chat" | "cowork" | "settings") {
    const key = { chat: "1", cowork: "2", settings: "3" }[mode];
    await this.page.keyboard.press(`ControlOrMeta+${key}`);
  }
}
