import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionSidebar } from "../SessionSidebar";

const workspaces = [
  { id: "w1", name: "Project A" },
  { id: "w2", name: "Project B" },
];
const sessions = [
  { id: "s1", name: "Session 1", workspaceId: "w1", updatedAt: Date.now() },
  { id: "s2", name: "Session 2", workspaceId: "w2", updatedAt: Date.now() },
  { id: "s3", name: "Standalone", updatedAt: Date.now() },
];

const defaultProps = {
  workspaces,
  sessions,
  activeSessionId: null,
  onSelectSession: vi.fn(),
  onNewSession: vi.fn(),
  onNewSessionInWorkspace: vi.fn(),
  onRenameSession: vi.fn(),
  onDeleteSession: vi.fn(),
  onMoveSession: vi.fn(),
  onOpenSettings: vi.fn(),
};

it("renders workspace folders and standalone sessions", () => {
  render(<SessionSidebar {...defaultProps} />);
  expect(screen.getByText("Project A")).toBeInTheDocument();
  expect(screen.getByText("Project B")).toBeInTheDocument();
  expect(screen.getByText("Standalone")).toBeInTheDocument();
});

it("workspace folder is collapsed by default, sessions hidden", () => {
  render(<SessionSidebar {...defaultProps} />);
  expect(screen.queryByText("Session 1")).not.toBeInTheDocument();
});

it("clicking folder header expands sessions", async () => {
  render(<SessionSidebar {...defaultProps} />);
  fireEvent.click(screen.getByText("Project A"));
  expect(screen.getByText("Session 1")).toBeInTheDocument();
});

it("sidebar dock has settings button", () => {
  const onOpenSettings = vi.fn();
  render(<SessionSidebar {...defaultProps} onOpenSettings={onOpenSettings} />);
  fireEvent.click(screen.getByRole("button", { name: /settings/i }));
  expect(onOpenSettings).toHaveBeenCalled();
});

it("search filters sessions (standalone)", async () => {
  render(<SessionSidebar {...defaultProps} />);
  await userEvent.type(screen.getByPlaceholderText(/search/i), "Stand");
  expect(screen.getByText("Standalone")).toBeInTheDocument();
});
