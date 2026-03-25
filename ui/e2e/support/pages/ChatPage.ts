import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export class ChatPage {
  constructor(private page: Page) {}

  async goto() { await this.page.goto("/"); }
  async waitForReady() { await this.page.waitForLoadState("networkidle"); }

  get newChatButton() { return this.page.getByRole("button", { name: /new chat/i }); }
  get sessionSearch() { return this.page.getByPlaceholder(/search sessions/i); }
  sessionItem(title: string) { return this.page.locator("[data-testid='session-item']", { hasText: title }); }
  get allSessionItems() { return this.page.locator("[data-testid='session-item']"); }
  get chatInput() { return this.page.getByRole("textbox"); }
  get welcomeScreen() { return this.page.getByText(/start a conversation/i); }

  async sendMessage(text: string) {
    await this.chatInput.fill(text);
    await this.chatInput.press("Enter");
  }

  messageContaining(text: string) {
    return this.page.locator(".message-content", { hasText: text });
  }
}
