import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatInputArea } from "../ChatInputArea";

const skills = [{ slug: "brainstorming", name: "Brainstorming", description: "Ideation skill" }];
const agents = [{ name: "Claude", emoji: "🤖", color: "#7c3aed", model: "claude", enabled: true }];

it("calls onSend with text on Shift+Enter (default manual mode)", async () => {
  const onSend = vi.fn();
  render(<ChatInputArea skills={skills} agents={agents} onSend={onSend} disabled={false} />);
  await userEvent.type(screen.getByRole("textbox"), "hello{Shift>}{Enter}{/Shift}");
  expect(onSend).toHaveBeenCalledWith(expect.objectContaining({ text: "hello" }));
});

it("does not send on Enter alone in default manual mode (adds newline)", async () => {
  const onSend = vi.fn();
  render(<ChatInputArea skills={skills} agents={agents} onSend={onSend} disabled={false} />);
  const textarea = screen.getByRole("textbox");
  await userEvent.type(textarea, "hello");
  fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
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

// P2-12: Enter-to-Send Toggle
it("renders enter-to-send toggle button", () => {
  render(<ChatInputArea skills={skills} agents={agents} onSend={vi.fn()} disabled={false} />);
  expect(screen.getByLabelText("Toggle Enter to send")).toBeInTheDocument();
});

it("sends on Enter when enter-to-send is active", async () => {
  const onSend = vi.fn();
  render(<ChatInputArea skills={skills} agents={agents} onSend={onSend} disabled={false} />);
  // Click toggle to enable enter-to-send
  fireEvent.click(screen.getByLabelText("Toggle Enter to send"));
  const textarea = screen.getByRole("textbox");
  await userEvent.type(textarea, "hello");
  fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
  expect(onSend).toHaveBeenCalledWith(expect.objectContaining({ text: "hello" }));
});

it("does not send on Enter when enter-to-send is inactive (default)", async () => {
  const onSend = vi.fn();
  render(<ChatInputArea skills={skills} agents={agents} onSend={onSend} disabled={false} />);
  const textarea = screen.getByRole("textbox");
  await userEvent.type(textarea, "hello");
  fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
  // In default mode (enterToSend=false), Enter adds newline, does NOT send
  expect(onSend).not.toHaveBeenCalled();
});

it("sends on Shift+Enter when enter-to-send is inactive (default)", async () => {
  const onSend = vi.fn();
  render(<ChatInputArea skills={skills} agents={agents} onSend={onSend} disabled={false} />);
  const textarea = screen.getByRole("textbox");
  await userEvent.type(textarea, "hello");
  fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
  expect(onSend).toHaveBeenCalledWith(expect.objectContaining({ text: "hello" }));
});

// P2-13: Message Queue Panel
it("shows queue badge when messages are queued", () => {
  render(<ChatInputArea skills={skills} agents={agents} onSend={vi.fn()} disabled={false} queueLength={3} />);
  expect(screen.getByText(/佇列中.*3/)).toBeInTheDocument();
});

it("does not show queue badge when queueLength is 0", () => {
  render(<ChatInputArea skills={skills} agents={agents} onSend={vi.fn()} disabled={false} queueLength={0} />);
  expect(screen.queryByText(/佇列中/)).not.toBeInTheDocument();
});

it("calls onQueueMessage when sending while isStreaming", async () => {
  const onQueueMessage = vi.fn();
  const onSend = vi.fn();
  render(<ChatInputArea skills={skills} agents={agents} onSend={onSend} disabled={false} isStreaming={true} onQueueMessage={onQueueMessage} />);
  const textarea = screen.getByRole("textbox");
  await userEvent.type(textarea, "queued message");
  fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
  expect(onQueueMessage).toHaveBeenCalledWith("queued message");
  expect(onSend).not.toHaveBeenCalled();
});

// P2-14: Text File Attachments
it("accepts text file formats in file input", () => {
  render(<ChatInputArea skills={skills} agents={agents} onSend={vi.fn()} disabled={false} supportsImage={true} />);
  const fileInput = document.querySelector('input[type="file"]');
  expect(fileInput?.getAttribute("accept")).toContain(".txt");
  expect(fileInput?.getAttribute("accept")).toContain(".md");
  expect(fileInput?.getAttribute("accept")).toContain(".json");
  expect(fileInput?.getAttribute("accept")).toContain(".csv");
});

// P2-15: Context-Aware Placeholder
it("shows default placeholder by default", () => {
  render(<ChatInputArea skills={skills} agents={agents} onSend={vi.fn()} disabled={false} />);
  expect(screen.getByPlaceholderText("輸入訊息...")).toBeInTheDocument();
});

it("shows streaming placeholder when isStreaming", () => {
  render(<ChatInputArea skills={skills} agents={agents} onSend={vi.fn()} disabled={false} isStreaming={true} />);
  expect(screen.getByPlaceholderText(/佇列/)).toBeInTheDocument();
});

it("shows paused placeholder when paused", () => {
  render(<ChatInputArea skills={skills} agents={agents} onSend={vi.fn()} disabled={false} paused={true} />);
  expect(screen.getByPlaceholderText(/Next/)).toBeInTheDocument();
});

it("shows manual placeholder when autoMode is false", () => {
  render(<ChatInputArea skills={skills} agents={agents} onSend={vi.fn()} disabled={false} autoMode={false} onToggleMode={vi.fn()} />);
  expect(screen.getByPlaceholderText(/插話/)).toBeInTheDocument();
});
