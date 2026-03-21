import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionItem } from "../SessionItem";

const session = { id: "s1", name: "My Session", updatedAt: Date.now() };
const workspaces = [{ id: "w1", name: "Project A" }];

it("shows session name", () => {
  render(<SessionItem session={session} active={false}
    workspaces={workspaces} onSelect={vi.fn()} onRename={vi.fn()}
    onDelete={vi.fn()} onMove={vi.fn()} />);
  expect(screen.getByText("My Session")).toBeInTheDocument();
});

it("shows action buttons on hover", () => {
  render(<SessionItem session={session} active={false}
    workspaces={workspaces} onSelect={vi.fn()} onRename={vi.fn()}
    onDelete={vi.fn()} onMove={vi.fn()} />);
  expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
});

it("switches to inline rename input on double-click", async () => {
  render(<SessionItem session={session} active={false}
    workspaces={workspaces} onSelect={vi.fn()} onRename={vi.fn()}
    onDelete={vi.fn()} onMove={vi.fn()} />);
  await userEvent.dblClick(screen.getByText("My Session"));
  expect(screen.getByRole("textbox")).toHaveValue("My Session");
});

it("calls onRename on Enter with new name", async () => {
  const onRename = vi.fn();
  render(<SessionItem session={session} active={false}
    workspaces={workspaces} onSelect={vi.fn()} onRename={onRename}
    onDelete={vi.fn()} onMove={vi.fn()} />);
  await userEvent.dblClick(screen.getByText("My Session"));
  const input = screen.getByRole("textbox");
  await userEvent.clear(input);
  await userEvent.type(input, "Renamed{Enter}");
  expect(onRename).toHaveBeenCalledWith("s1", "Renamed");
});

it("calls onDelete when delete button clicked", async () => {
  const onDelete = vi.fn();
  render(<SessionItem session={session} active={false}
    workspaces={workspaces} onSelect={vi.fn()} onRename={vi.fn()}
    onDelete={onDelete} onMove={vi.fn()} />);
  const item = screen.getByRole("button", { name: /my session/i });
  await userEvent.hover(item);
  fireEvent.click(screen.getByRole("button", { name: /delete/i }));
  expect(onDelete).toHaveBeenCalledWith("s1");
});

it("does NOT call onRename when Enter pressed with same name", async () => {
  const onRename = vi.fn();
  render(<SessionItem session={session} active={false}
    workspaces={workspaces} onSelect={vi.fn()} onRename={onRename}
    onDelete={vi.fn()} onMove={vi.fn()} />);
  await userEvent.dblClick(screen.getByText("My Session"));
  // Don't change the value, just press Enter
  await userEvent.keyboard("{Enter}");
  expect(onRename).not.toHaveBeenCalled();
});

it("does NOT call onRename when rename to empty string", async () => {
  const onRename = vi.fn();
  render(<SessionItem session={session} active={false}
    workspaces={workspaces} onSelect={vi.fn()} onRename={onRename}
    onDelete={vi.fn()} onMove={vi.fn()} />);
  await userEvent.dblClick(screen.getByText("My Session"));
  await userEvent.clear(screen.getByRole("textbox"));
  await userEvent.keyboard("{Enter}");
  expect(onRename).not.toHaveBeenCalled();
});

it("cancels rename on Escape without calling onRename", async () => {
  const onRename = vi.fn();
  render(<SessionItem session={session} active={false}
    workspaces={workspaces} onSelect={vi.fn()} onRename={onRename}
    onDelete={vi.fn()} onMove={vi.fn()} />);
  await userEvent.dblClick(screen.getByText("My Session"));
  await userEvent.clear(screen.getByRole("textbox"));
  await userEvent.type(screen.getByRole("textbox"), "New Name");
  await userEvent.keyboard("{Escape}");
  expect(onRename).not.toHaveBeenCalled();
  expect(screen.getByText("My Session")).toBeInTheDocument();
});

it("calls onRename only once per Enter press (no double-fire)", async () => {
  const onRename = vi.fn();
  render(<SessionItem session={session} active={false}
    workspaces={workspaces} onSelect={vi.fn()} onRename={onRename}
    onDelete={vi.fn()} onMove={vi.fn()} />);
  await userEvent.dblClick(screen.getByText("My Session"));
  const input = screen.getByRole("textbox");
  await userEvent.clear(input);
  await userEvent.type(input, "Renamed{Enter}");
  expect(onRename).toHaveBeenCalledTimes(1);
});
