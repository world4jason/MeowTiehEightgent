import { render, screen, fireEvent } from "@testing-library/react";
import { MembersPanel } from "../MembersPanel";

const agents = [
  { name: "Claude", emoji: "🤖", color: "#7c3aed", model: "claude", enabled: true, mode: "chat" as const },
];
const available = [
  { name: "Gemini", emoji: "💎", color: "#2563eb", model: "gemini", enabled: true },
];

it("renders agent rows", () => {
  render(<MembersPanel open agents={agents} availableAgents={available}
    onModeChange={vi.fn()} onAddAgent={vi.fn()} onRemoveAgent={vi.fn()} onClose={vi.fn()} />);
  expect(screen.getByText("Claude")).toBeInTheDocument();
});

it("shows chat/think toggle per agent", () => {
  render(<MembersPanel open agents={agents} availableAgents={available}
    onModeChange={vi.fn()} onAddAgent={vi.fn()} onRemoveAgent={vi.fn()} onClose={vi.fn()} />);
  expect(screen.getByRole("button", { name: /chat mode/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /think mode/i })).toBeInTheDocument();
});

it("calls onModeChange when mode toggle clicked", () => {
  const onModeChange = vi.fn();
  render(<MembersPanel open agents={agents} availableAgents={available}
    onModeChange={onModeChange} onAddAgent={vi.fn()} onRemoveAgent={vi.fn()} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /think mode/i }));
  expect(onModeChange).toHaveBeenCalledWith("Claude", "think");
});

it("renders hidden when open=false", () => {
  const { container } = render(
    <MembersPanel open={false} agents={agents} availableAgents={available}
      onModeChange={vi.fn()} onAddAgent={vi.fn()} onRemoveAgent={vi.fn()} onClose={vi.fn()} />
  );
  expect(container.firstChild).toHaveStyle({ width: "0px" });
});

it("does NOT call onModeChange when think clicked for agent with supportsThinking=false", () => {
  const onModeChange = vi.fn();
  const thinkDisabledAgents = [
    { name: "Claude", emoji: "🤖", color: "#7c3aed", model: "claude", enabled: true, mode: "chat" as const, supportsThinking: false },
  ];
  render(<MembersPanel open agents={thinkDisabledAgents} availableAgents={available}
    onModeChange={onModeChange} onAddAgent={vi.fn()} onRemoveAgent={vi.fn()} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /think mode/i }));
  expect(onModeChange).not.toHaveBeenCalled();
});

it("shows 'No agents available' when all agents are already active", () => {
  render(<MembersPanel open agents={agents} availableAgents={agents}
    onModeChange={vi.fn()} onAddAgent={vi.fn()} onRemoveAgent={vi.fn()} onClose={vi.fn()} />);
  fireEvent.click(screen.getByText(/add agent/i));
  expect(screen.getByText("No agents available")).toBeInTheDocument();
});

it("shows formatted token count next to agent name when tokenUsage provided", () => {
  const tokenUsage = { Claude: { input: 500, output: 300 } };
  render(<MembersPanel open agents={agents} availableAgents={available}
    onModeChange={vi.fn()} onAddAgent={vi.fn()} onRemoveAgent={vi.fn()} onClose={vi.fn()}
    tokenUsage={tokenUsage} />);
  // 500 + 300 = 800 tokens, < 1000, so shown as "800"
  expect(screen.getByText("800")).toBeInTheDocument();
});

it("shows k-notation for token count >= 1000", () => {
  const tokenUsage = { Claude: { input: 800, output: 600 } };
  render(<MembersPanel open agents={agents} availableAgents={available}
    onModeChange={vi.fn()} onAddAgent={vi.fn()} onRemoveAgent={vi.fn()} onClose={vi.fn()}
    tokenUsage={tokenUsage} />);
  // 800 + 600 = 1400, shown as "1.4k"
  expect(screen.getByText("1.4k")).toBeInTheDocument();
});

it("does not show token badge when tokenUsage is not provided", () => {
  render(<MembersPanel open agents={agents} availableAgents={available}
    onModeChange={vi.fn()} onAddAgent={vi.fn()} onRemoveAgent={vi.fn()} onClose={vi.fn()} />);
  // No token badge should be present
  expect(screen.queryByTitle(/tokens/i)).not.toBeInTheDocument();
});
