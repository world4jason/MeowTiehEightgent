import type { Page } from "@playwright/test";

export class AgentControlBar {
  constructor(private page: Page) {}
  get pauseButton() { return this.page.getByRole("button", { name: /pause/i }); }
  get resumeButton() { return this.page.getByRole("button", { name: /resume/i }); }
}
