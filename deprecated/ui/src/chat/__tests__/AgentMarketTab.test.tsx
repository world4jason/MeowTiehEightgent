import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AgentMarketTab } from "../settings/AgentMarketTab";

// Mock all hooks used by AgentMarketTab so no real HTTP calls are made
vi.mock("../settings/useSettingsApi", () => ({
  useMarketplaceAgents: () => ({
    data: [
      { id: "test-agent", emoji: "🤖", color: "#888", description: "A test agent", installed: false },
    ],
    isLoading: false,
  }),
  useMarketplaceAgentDetail: () => ({ data: null, isLoading: false }),
  useInstallMarketplaceAgent: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useCreateAgent: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useModels: () => ({ data: [{ id: "claude", label: "Claude", emoji: "" }] }),
  useCreateMarketplaceAgent: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useUpdateMarketplaceAgent: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useDeleteMarketplaceAgent: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );
}

describe("AgentMarketTab", () => {
  it("renders the grid view with header buttons", () => {
    renderWithProviders(<AgentMarketTab onInstalled={vi.fn()} />);
    expect(screen.getByText("代理人市場")).toBeInTheDocument();
  });

  it("renders '上架模板' button in header", () => {
    renderWithProviders(<AgentMarketTab onInstalled={vi.fn()} />);
    expect(screen.getByText("上架模板")).toBeInTheDocument();
  });

  it("renders '手動新增' button in header", () => {
    renderWithProviders(<AgentMarketTab onInstalled={vi.fn()} />);
    expect(screen.getByText("手動新增")).toBeInTheDocument();
  });

  it("renders marketplace agent cards in grid", () => {
    renderWithProviders(<AgentMarketTab onInstalled={vi.fn()} />);
    expect(screen.getByText("test-agent")).toBeInTheDocument();
    expect(screen.getByText("A test agent")).toBeInTheDocument();
  });

  it("clicking '上架模板' switches to create-template form", () => {
    renderWithProviders(<AgentMarketTab onInstalled={vi.fn()} />);
    fireEvent.click(screen.getByText("上架模板"));
    expect(screen.getByText("上架模板到市場")).toBeInTheDocument();
  });

  it("create-template form has ID input and MD textareas", () => {
    renderWithProviders(<AgentMarketTab onInstalled={vi.fn()} />);
    fireEvent.click(screen.getByText("上架模板"));
    expect(screen.getByPlaceholderText("例如: my-template")).toBeInTheDocument();
    expect(screen.getByText("AGENT.MD")).toBeInTheDocument();
    expect(screen.getByText("IDENTITY.MD")).toBeInTheDocument();
    expect(screen.getByText("SOUL.MD")).toBeInTheDocument();
  });

  it("create-template form cancel returns to grid", () => {
    renderWithProviders(<AgentMarketTab onInstalled={vi.fn()} />);
    fireEvent.click(screen.getByText("上架模板"));
    fireEvent.click(screen.getByText("取消"));
    expect(screen.getByText("代理人市場")).toBeInTheDocument();
  });

  it("clicking '手動新增' switches to create agent form", () => {
    renderWithProviders(<AgentMarketTab onInstalled={vi.fn()} />);
    fireEvent.click(screen.getByText("手動新增"));
    expect(screen.getByText("手動新增代理人")).toBeInTheDocument();
  });

  it("clicking an agent card switches to detail view", () => {
    renderWithProviders(<AgentMarketTab onInstalled={vi.fn()} />);
    fireEvent.click(screen.getByText("test-agent"));
    // Detail view shows back button
    expect(screen.getByText("← 返回代理人市場")).toBeInTheDocument();
  });

  it("detail view shows '編輯' button", () => {
    renderWithProviders(<AgentMarketTab onInstalled={vi.fn()} />);
    fireEvent.click(screen.getByText("test-agent"));
    expect(screen.getByText("編輯")).toBeInTheDocument();
  });

  it("clicking '編輯' in detail view switches to edit form", () => {
    renderWithProviders(<AgentMarketTab onInstalled={vi.fn()} />);
    fireEvent.click(screen.getByText("test-agent"));
    fireEvent.click(screen.getByText("編輯"));
    expect(screen.getByText(/編輯模板：test-agent/)).toBeInTheDocument();
  });

  it("edit form has '儲存' and '刪除' buttons", () => {
    renderWithProviders(<AgentMarketTab onInstalled={vi.fn()} />);
    fireEvent.click(screen.getByText("test-agent"));
    fireEvent.click(screen.getByText("編輯"));
    expect(screen.getByText("儲存")).toBeInTheDocument();
    expect(screen.getByText("刪除")).toBeInTheDocument();
  });
});
