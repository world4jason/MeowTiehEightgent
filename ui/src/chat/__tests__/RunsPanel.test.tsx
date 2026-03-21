import { render, screen, fireEvent } from "@testing-library/react";
import { RunsPanel } from "../RunsPanel";

const agents = [{ name: "Claude", emoji: "🤖", color: "#7c3aed", model: "claude", enabled: true }];
const runs = [{ agentName: "Claude", tokens: 1234 }];

it("renders hidden when open=false", () => {
  const { container } = render(
    <RunsPanel open={false} membersOpen={false} agents={agents} runs={runs} />
  );
  expect(container.firstChild).toHaveStyle({ width: "0px" });
});

it("shows token count when open=true", () => {
  render(<RunsPanel open membersOpen={false} agents={agents} runs={runs} />);
  expect(screen.getByText(/1,234 tokens/)).toBeInTheDocument();
});

it("shows 'No runs yet' when runs is empty", () => {
  render(<RunsPanel open membersOpen={false} agents={agents} runs={[]} />);
  expect(screen.getByText("No runs yet")).toBeInTheDocument();
});

it("renders close button when onClose provided and calls it", () => {
  const onClose = vi.fn();
  render(<RunsPanel open membersOpen={false} agents={agents} runs={runs} onClose={onClose} />);
  fireEvent.click(screen.getByRole("button", { name: /close runs panel/i }));
  expect(onClose).toHaveBeenCalled();
});

it("does not render close button when onClose not provided", () => {
  render(<RunsPanel open membersOpen={false} agents={agents} runs={runs} />);
  expect(screen.queryByRole("button", { name: /close/i })).not.toBeInTheDocument();
});
