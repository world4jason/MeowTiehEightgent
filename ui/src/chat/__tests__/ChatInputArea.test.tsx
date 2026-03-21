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
