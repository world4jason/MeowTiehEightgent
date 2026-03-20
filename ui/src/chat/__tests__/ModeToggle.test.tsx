import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ModeToggle } from "../../components/ModeToggle";

describe("ModeToggle", () => {
  it("renders Chat and Cowork buttons", () => {
    render(<ModeToggle mode="chat" onModeChange={vi.fn()} chatOnline coworkOnline />);
    expect(screen.getByText("Chat")).toBeInTheDocument();
    expect(screen.getByText("Cowork")).toBeInTheDocument();
  });

  it("marks the active mode button", () => {
    render(<ModeToggle mode="chat" onModeChange={vi.fn()} chatOnline coworkOnline />);
    const chatBtn = screen.getByText("Chat").closest("button");
    expect(chatBtn).toHaveAttribute("aria-pressed", "true");
  });

  it("calls onModeChange when Cowork is clicked", () => {
    const onModeChange = vi.fn();
    render(<ModeToggle mode="chat" onModeChange={onModeChange} chatOnline coworkOnline />);
    fireEvent.click(screen.getByText("Cowork"));
    expect(onModeChange).toHaveBeenCalledWith("cowork");
  });

  it("shows offline indicator when chatOnline=false", () => {
    render(<ModeToggle mode="chat" onModeChange={vi.fn()} chatOnline={false} coworkOnline />);
    expect(screen.getByTestId("chat-offline")).toBeInTheDocument();
  });

  it("shows unread badge on Chat tab when hasUnreadChat=true", () => {
    render(
      <ModeToggle mode="cowork" onModeChange={vi.fn()} chatOnline coworkOnline hasUnreadChat />
    );
    expect(screen.getByTestId("chat-unread-badge")).toBeInTheDocument();
  });

  it("hides unread badge when in Chat mode", () => {
    render(
      <ModeToggle mode="chat" onModeChange={vi.fn()} chatOnline coworkOnline hasUnreadChat />
    );
    expect(screen.queryByTestId("chat-unread-badge")).not.toBeInTheDocument();
  });
});
