// ui/src/chat/__tests__/WelcomeScreen.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { WelcomeScreen } from "../WelcomeScreen";
import { WorkspaceInfo } from "../types";

const agents = [{ name: "Claude", emoji: "🤖", color: "#7c3aed", model: "claude", enabled: true }];
const scenarios = [
  { id: "s1", name: "Brainstorm", description: "Idea generation", agents: ["Claude"], systemPrompt: "Let's brainstorm" },
];
const scenariosWithHint = [
  { id: "s1", name: "Brainstorm", description: "Idea generation", agents: ["Claude"], systemPrompt: "Let's brainstorm", topicHint: "我想探索..." },
];
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

// ─── Scenario + Topic coexistence ────────────────────────────

it("clicking scenario card selects it (does NOT start session)", () => {
  const onStartSession = vi.fn();
  render(<WelcomeScreen {...defaultProps} onStartSession={onStartSession} />);
  fireEvent.click(screen.getByText("Brainstorm"));
  // Should NOT have called onStartSession yet
  expect(onStartSession).not.toHaveBeenCalled();
});

it("clicking scenario card highlights it", () => {
  render(<WelcomeScreen {...defaultProps} />);
  const card = screen.getByText("Brainstorm").closest("button")!;
  fireEvent.click(card);
  // Card should have primary border (selected state)
  expect(card.className).toContain("border-primary");
});

it("clicking selected scenario card deselects it", () => {
  render(<WelcomeScreen {...defaultProps} />);
  const card = screen.getByText("Brainstorm").closest("button")!;
  fireEvent.click(card); // select
  fireEvent.click(card); // deselect
  expect(card.className).not.toContain("border-primary");
});

it("clicking '開始對話' sends scenario systemPrompt AND topic together", () => {
  const onStartSession = vi.fn();
  render(<WelcomeScreen {...defaultProps} onStartSession={onStartSession} />);
  // Select scenario
  fireEvent.click(screen.getByText("Brainstorm"));
  // Type topic
  const topicInput = screen.getByPlaceholderText("輸入討論主題...");
  fireEvent.change(topicInput, { target: { value: "AI 的未來" } });
  // Click start
  fireEvent.click(screen.getByText(/開始對話/));
  expect(onStartSession).toHaveBeenCalledWith(
    expect.objectContaining({
      systemPrompt: "Let's brainstorm",
      topic: "AI 的未來",
    })
  );
});

it("clicking '開始對話' without scenario sends only topic", () => {
  const onStartSession = vi.fn();
  render(<WelcomeScreen {...defaultProps} onStartSession={onStartSession} />);
  const topicInput = screen.getByPlaceholderText("輸入討論主題...");
  fireEvent.change(topicInput, { target: { value: "隨便聊" } });
  fireEvent.click(screen.getByText(/開始對話/));
  expect(onStartSession).toHaveBeenCalledWith(
    expect.objectContaining({
      topic: "隨便聊",
    })
  );
  expect(onStartSession.mock.calls[0][0].systemPrompt).toBeUndefined();
});

it("topic placeholder shows scenario topicHint when scenario selected", () => {
  render(<WelcomeScreen {...defaultProps} scenarios={scenariosWithHint} />);
  // Before selecting: default placeholder
  expect(screen.getByPlaceholderText("輸入討論主題...")).toBeInTheDocument();
  // Select scenario with hint
  fireEvent.click(screen.getByText("Brainstorm"));
  // Placeholder should now show the hint
  expect(screen.getByPlaceholderText("我想探索...")).toBeInTheDocument();
});

it("selecting scenario merges its suggested agents", () => {
  const onSelectAgents = vi.fn();
  render(<WelcomeScreen {...defaultProps} onSelectAgents={onSelectAgents} />);
  fireEvent.click(screen.getByText("Brainstorm"));
  // After selecting scenario, onSelectAgents should have been called with scenario's agents
  expect(onSelectAgents).toHaveBeenCalledWith(expect.arrayContaining(["Claude"]));
});

// ─── Existing tests (updated) ────────────────────────────────

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
