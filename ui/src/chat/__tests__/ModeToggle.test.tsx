import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ModeToggle } from "../../components/ModeToggle";

describe("ModeToggle", () => {
  it("renders Chat and Cowork buttons", () => {
    render(<ModeToggle mode="chat" onModeChange={vi.fn()} chatOnline coworkOnline settingsOnline />);
    expect(screen.getByText("Chat")).toBeInTheDocument();
    expect(screen.getByText("Cowork")).toBeInTheDocument();
  });

  it("marks the active mode button", () => {
    render(<ModeToggle mode="chat" onModeChange={vi.fn()} chatOnline coworkOnline settingsOnline />);
    const chatBtn = screen.getByText("Chat").closest("button");
    expect(chatBtn).toHaveAttribute("aria-pressed", "true");
  });

  it("calls onModeChange when Cowork is clicked", () => {
    const onModeChange = vi.fn();
    render(<ModeToggle mode="chat" onModeChange={onModeChange} chatOnline coworkOnline settingsOnline />);
    fireEvent.click(screen.getByText("Cowork"));
    expect(onModeChange).toHaveBeenCalledWith("cowork");
  });

  it("shows offline indicator when chatOnline=false", () => {
    render(<ModeToggle mode="chat" onModeChange={vi.fn()} chatOnline={false} coworkOnline settingsOnline />);
    expect(screen.getByTestId("chat-offline")).toBeInTheDocument();
  });

  it("shows unread badge on Chat tab when hasUnreadChat=true", () => {
    render(
      <ModeToggle mode="cowork" onModeChange={vi.fn()} chatOnline coworkOnline settingsOnline hasUnreadChat />
    );
    expect(screen.getByTestId("chat-unread-badge")).toBeInTheDocument();
  });

  it("hides unread badge when in Chat mode", () => {
    render(
      <ModeToggle mode="chat" onModeChange={vi.fn()} chatOnline coworkOnline settingsOnline hasUnreadChat />
    );
    expect(screen.queryByTestId("chat-unread-badge")).not.toBeInTheDocument();
  });

  it("renders three tabs: Chat, Cowork, Settings", () => {
    const fn = vi.fn();
    render(
      <ModeToggle mode="chat" onModeChange={fn}
        chatOnline coworkOnline settingsOnline />
    );
    expect(screen.getByRole("button", { name: /chat/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cowork/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /settings/i })).toBeInTheDocument();
  });

  it("calls onModeChange('settings') when Settings clicked", () => {
    const fn = vi.fn();
    render(
      <ModeToggle mode="chat" onModeChange={fn}
        chatOnline coworkOnline settingsOnline />
    );
    fireEvent.click(screen.getByRole("button", { name: /settings/i }));
    expect(fn).toHaveBeenCalledWith("settings");
  });

  it("shows offline dot on Settings tab when settingsOnline=false", () => {
    render(
      <ModeToggle mode="chat" onModeChange={vi.fn()}
        chatOnline coworkOnline settingsOnline={false} />
    );
    expect(screen.getByTestId("settings-offline")).toBeInTheDocument();
  });
});
