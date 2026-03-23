// ui/src/chat/__tests__/WelcomeScreen.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { WelcomeScreen } from "../WelcomeScreen";
import { WorkspaceInfo } from "../types";

const agents = [{ name: "Claude", emoji: "🤖", color: "#7c3aed", model: "claude", enabled: true }];
const scenarios = [{ id: "s1", name: "Brainstorm", description: "Idea generation", agents: ["Claude"], systemPrompt: "Let's brainstorm" }];
const workspaces: WorkspaceInfo[] = [{ id: "w1", name: "My Workspace", sessionCount: 2 }];

const defaultProps = {
  agents,
  scenarios,
  workspaces,
  onStartSession: vi.fn(),
  onSelectAgents: vi.fn(),
};

it("renders scenario cards", () => {
  render(<WelcomeScreen {...defaultProps} />);
  expect(screen.getByText("Brainstorm")).toBeInTheDocument();
});

it("renders agent chips", () => {
  render(<WelcomeScreen {...defaultProps} />);
  expect(screen.getByLabelText(/toggle claude/i)).toBeInTheDocument();
});

it("calls onStartSession with scenario data when card clicked", () => {
  const onStartSession = vi.fn();
  render(<WelcomeScreen {...defaultProps} onStartSession={onStartSession} />);
  fireEvent.click(screen.getByText("Brainstorm"));
  expect(onStartSession).toHaveBeenCalledWith(expect.objectContaining({ systemPrompt: "Let's brainstorm" }));
});

it("shows Auto button when autoMode=true", () => {
  render(
    <WelcomeScreen {...defaultProps}
      autoMode={true} onAutoModeChange={vi.fn()} rounds={2} onRoundsChange={vi.fn()} />
  );
  expect(screen.getByRole("button", { name: /^auto$/i })).toBeInTheDocument();
});

it("shows Manual button and calls onAutoModeChange when Manual clicked", () => {
  const onAutoModeChange = vi.fn();
  render(
    <WelcomeScreen {...defaultProps}
      autoMode={true} onAutoModeChange={onAutoModeChange} rounds={2} onRoundsChange={vi.fn()} />
  );
  fireEvent.click(screen.getByRole("button", { name: /^manual$/i }));
  expect(onAutoModeChange).toHaveBeenCalledWith(false);
});

it("shows rounds input when autoMode=false", () => {
  render(
    <WelcomeScreen {...defaultProps}
      autoMode={false} onAutoModeChange={vi.fn()} rounds={3} onRoundsChange={vi.fn()} />
  );
  const input = screen.getByRole("spinbutton");
  expect(input).toBeInTheDocument();
  expect(input).toHaveValue(3);
});

it("renders context mode tabs", () => {
  render(<WelcomeScreen {...defaultProps} />);
  expect(screen.getByText("Workspace")).toBeInTheDocument();
  expect(screen.getByText("Scenario")).toBeInTheDocument();
  expect(screen.getByText("Blank")).toBeInTheDocument();
});

it("renders topic input", () => {
  render(<WelcomeScreen {...defaultProps} />);
  expect(screen.getByPlaceholderText("輸入討論主題...")).toBeInTheDocument();
});

it("renders start button", () => {
  render(<WelcomeScreen {...defaultProps} />);
  expect(screen.getByText(/開始對話/)).toBeInTheDocument();
});

it("renders silence checkbox", () => {
  render(<WelcomeScreen {...defaultProps} />);
  expect(screen.getByText("機率性沈默")).toBeInTheDocument();
});
