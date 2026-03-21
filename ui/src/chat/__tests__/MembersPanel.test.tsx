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
