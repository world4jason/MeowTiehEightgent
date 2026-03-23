import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatInputArea } from "../ChatInputArea";

const skills = [{ slug: "brainstorming", name: "Brainstorming", description: "Ideation skill" }];
const agents = [{ name: "Claude", emoji: "🤖", color: "#7c3aed", model: "claude", enabled: true }];

it("calls onSend with text on Enter", async () => {
  const onSend = vi.fn();
  render(<ChatInputArea skills={skills} agents={agents} onSend={onSend} disabled={false} />);
  await userEvent.type(screen.getByRole("textbox"), "hello{Enter}");
  expect(onSend).toHaveBeenCalledWith(expect.objectContaining({ text: "hello" }));
});

it("does not send on Shift+Enter (newline)", async () => {
  const onSend = vi.fn();
  render(<ChatInputArea skills={skills} agents={agents} onSend={onSend} disabled={false} />);
  await userEvent.type(screen.getByRole("textbox"), "hello{Shift>}{Enter}{/Shift}");
  expect(onSend).not.toHaveBeenCalled();
});

it("shows skill picker when typing /", async () => {
  render(<ChatInputArea skills={skills} agents={agents} onSend={vi.fn()} disabled={false} />);
  await userEvent.type(screen.getByRole("textbox"), "/");
  expect(screen.getByText("Brainstorming")).toBeInTheDocument();
});

it("shows agent picker when typing @", async () => {
  render(<ChatInputArea skills={skills} agents={agents} onSend={vi.fn()} disabled={false} />);
  await userEvent.type(screen.getByRole("textbox"), "@");
  expect(screen.getByText("Claude")).toBeInTheDocument();
});

it("shows Auto mode indicator when autoMode=true", () => {
  render(<ChatInputArea skills={skills} agents={agents} onSend={vi.fn()} disabled={false} autoMode={true} onToggleMode={vi.fn()} rounds={2} />);
  expect(screen.getByRole("button", { name: /auto/i })).toBeInTheDocument();
});

it("shows Manual mode indicator when autoMode=false", () => {
  render(<ChatInputArea skills={skills} agents={agents} onSend={vi.fn()} disabled={false} autoMode={false} onToggleMode={vi.fn()} rounds={2} />);
  expect(screen.getByRole("button", { name: /manual/i })).toBeInTheDocument();
});

it("calls onToggleMode when mode button is clicked", () => {
  const onToggleMode = vi.fn();
  render(<ChatInputArea skills={skills} agents={agents} onSend={vi.fn()} disabled={false} autoMode={true} onToggleMode={onToggleMode} rounds={2} />);
  fireEvent.click(screen.getByRole("button", { name: /auto/i }));
  expect(onToggleMode).toHaveBeenCalled();
});

it("does not show Next button when paused=false", () => {
  render(<ChatInputArea skills={skills} agents={agents} onSend={vi.fn()} disabled={false} paused={false} onNext={vi.fn()} />);
  expect(screen.queryByRole("button", { name: /next/i })).not.toBeInTheDocument();
});

it("shows Next button when paused=true", () => {
  render(<ChatInputArea skills={skills} agents={agents} onSend={vi.fn()} disabled={false} paused={true} onNext={vi.fn()} />);
  expect(screen.getByRole("button", { name: /next/i })).toBeInTheDocument();
});

it("calls onNext when Next button is clicked", () => {
  const onNext = vi.fn();
  render(<ChatInputArea skills={skills} agents={agents} onSend={vi.fn()} disabled={false} paused={true} onNext={onNext} />);
  fireEvent.click(screen.getByRole("button", { name: /next/i }));
  expect(onNext).toHaveBeenCalled();
});
