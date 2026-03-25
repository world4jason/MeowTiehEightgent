import type { Page } from "@playwright/test";

export class ChatHeader {
  constructor(private page: Page) {}
  get membersButton() { return this.page.getByRole("button", { name: /members/i }); }
  get runsButton() { return this.page.getByRole("button", { name: /runs/i }); }
}
