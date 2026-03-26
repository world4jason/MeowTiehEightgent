import type { Page } from "@playwright/test";

export class ChatHeader {
  constructor(private page: Page) {}
  get membersButton() { return this.page.getByLabel("Toggle members panel"); }
  get runsButton() { return this.page.getByLabel("Toggle runs panel"); }
  get activityButton() { return this.page.getByLabel("Toggle activity feed"); }
}
