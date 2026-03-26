import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export class ChatPage {
  constructor(private page: Page) {}

  async goto() { await this.page.goto("/"); }
  async waitForReady() { await this.page.waitForLoadState("networkidle"); }

  get newChatButton() { return this.page.getByRole("button", { name: /new chat/i }); }
  get sessionSearch() { return this.page.getByLabel("Search sessions"); }
  /** Session items are buttons with aria-label matching the session name */
  sessionItem(title: string) { return this.page.getByRole("button", { name: title, exact: false }); }
  /** All clickable session buttons in the sidebar */
  get allSessionItems() { return this.page.locator(".bg-sidebar button.truncate, .bg-sidebar button[aria-label]").filter({ hasNotText: /new chat|settings|download|delete|move/i }); }
  /** Chat message input — uses aria-label to distinguish from search input */
  get chatInput() { return this.page.getByLabel("Message input"); }
  get welcomeScreen() { return this.page.getByText(/pick agents and start chatting/i); }

  async sendMessage(text: string) {
    await this.chatInput.fill(text);
    await this.chatInput.press("Shift+Enter");
  }

  messageContaining(text: string) {
    return this.page.getByText(text);
  }
}
