// ui/src/chat/__tests__/WelcomeScreen.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { WelcomeScreen } from "../WelcomeScreen";

const agents = [{ name: "Claude", emoji: "🤖", color: "#7c3aed", model: "claude", enabled: true }];
const scenarios = [{ id: "s1", name: "Brainstorm", description: "Idea generation", agents: ["Claude"], systemPrompt: "Let's brainstorm" }];

it("renders scenario cards", () => {
  render(<WelcomeScreen agents={agents} scenarios={scenarios} onStartSession={vi.fn()} onSelectAgents={vi.fn()} />);
  expect(screen.getByText("Brainstorm")).toBeInTheDocument();
});

it("renders agent chips", () => {
  render(<WelcomeScreen agents={agents} scenarios={scenarios} onStartSession={vi.fn()} onSelectAgents={vi.fn()} />);
  expect(screen.getByLabelText(/toggle claude/i)).toBeInTheDocument();
});

it("calls onStartSession with scenario data when card clicked", () => {
  const onStartSession = vi.fn();
  render(<WelcomeScreen agents={agents} scenarios={scenarios} onStartSession={onStartSession} onSelectAgents={vi.fn()} />);
  fireEvent.click(screen.getByText("Brainstorm"));
  expect(onStartSession).toHaveBeenCalledWith(expect.objectContaining({ systemPrompt: "Let's brainstorm" }));
});

it("shows Auto button when autoMode=true", () => {
  render(
    <WelcomeScreen agents={agents} scenarios={scenarios} onStartSession={vi.fn()} onSelectAgents={vi.fn()}
      autoMode={true} onAutoModeChange={vi.fn()} rounds={2} onRoundsChange={vi.fn()} />
  );
  expect(screen.getByRole("button", { name: /^auto$/i })).toBeInTheDocument();
});

it("shows Manual button and calls onAutoModeChange when Manual clicked", () => {
  const onAutoModeChange = vi.fn();
  render(
    <WelcomeScreen agents={agents} scenarios={scenarios} onStartSession={vi.fn()} onSelectAgents={vi.fn()}
      autoMode={true} onAutoModeChange={onAutoModeChange} rounds={2} onRoundsChange={vi.fn()} />
  );
  fireEvent.click(screen.getByRole("button", { name: /^manual$/i }));
  expect(onAutoModeChange).toHaveBeenCalledWith(false);
});

it("shows rounds input when autoMode=false", () => {
  render(
    <WelcomeScreen agents={agents} scenarios={scenarios} onStartSession={vi.fn()} onSelectAgents={vi.fn()}
      autoMode={false} onAutoModeChange={vi.fn()} rounds={3} onRoundsChange={vi.fn()} />
  );
  const input = screen.getByRole("spinbutton");
  expect(input).toBeInTheDocument();
  expect(input).toHaveValue(3);
});
