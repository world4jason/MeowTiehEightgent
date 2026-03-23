import { useEffect, useRef, useState } from "react";
import { useWorkspaces, useWorkspaceDetail, useAgentsList } from "../hooks/useChatApi";
import {
  useCreateWorkspace,
  useUpdateWorkspace,
  useDeleteWorkspace,
  useUploadWorkspaceFile,
  useDeleteWorkspaceFile,
} from "./useSettingsApi";

// ─── Left column: workspace list ─────────────────────────────

interface WorkspaceListProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}

function WorkspaceList({ selectedId, onSelect, onNew }: WorkspaceListProps) {
  const { data: workspaces = [] } = useWorkspaces();

  return (
    <div className="w-[260px] min-w-[260px] overflow-y-auto border-r border-border p-4 flex flex-col gap-1">
      {workspaces.length === 0 && (
        <p className="text-xs text-muted-foreground px-2 py-4 text-center">
          尚未建立工作區
        </p>
      )}
      {workspaces.map((ws) => (
        <button
          key={ws.id}
          onClick={() => onSelect(ws.id)}
          className={`flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
            selectedId === ws.id
              ? "bg-accent text-accent-foreground"
              : "hover:bg-muted/50 text-foreground"
          }`}
        >
          <span>📁</span>
          <span className="truncate">{ws.name}</span>
        </button>
      ))}
      <button
        onClick={onNew}
        className="mt-2 flex items-center justify-center gap-1 w-full border border-dashed border-border rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
      >
        + 新增工作區
      </button>
    </div>
  );
}

// ─── New workspace form ───────────────────────────────────────

interface NewWorkspaceFormProps {
  onCreated: (id: string) => void;
  onCancel: () => void;
}

function NewWorkspaceForm({ onCreated, onCancel }: NewWorkspaceFormProps) {
  const [name, setName] = useState("");
  const createWorkspace = useCreateWorkspace();

  const handleSubmit = () => {
    if (!name.trim()) return;
    createWorkspace.mutate(
      { name: name.trim() },
      {
        onSuccess: (data) => {
          onCreated(data.id);
        },
      }
    );
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <h2 className="text-xl font-bold">新增工作區</h2>
        <div className="rounded-xl border border-border p-5 space-y-3">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            工作區名稱
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="輸入名稱..."
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            autoFocus
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || createWorkspace.isPending}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {createWorkspace.isPending ? "建立中..." : "建立"}
          </button>
          <button
            onClick={onCancel}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted/50 transition-colors"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Workspace detail panel ───────────────────────────────────

interface WorkspaceDetailPanelProps {
  workspaceId: string;
  onDeleted: () => void;
}

function WorkspaceDetailPanel({ workspaceId, onDeleted }: WorkspaceDetailPanelProps) {
  const { data: detail } = useWorkspaceDetail(workspaceId);
  const { data: agents = [] } = useAgentsList();

  const updateWorkspace = useUpdateWorkspace();
  const deleteWorkspace = useDeleteWorkspace();
  const uploadFile = useUploadWorkspaceFile();
  const deleteFile = useDeleteWorkspaceFile();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [instructions, setInstructions] = useState("");
  const [checkedAgents, setCheckedAgents] = useState<string[]>([]);
  const [showSaved, setShowSaved] = useState(false);

  // Sync local state when detail loads
  useEffect(() => {
    if (detail) {
      setInstructions(detail.instructions ?? "");
      setCheckedAgents(detail.defaultAgents ?? []);
    }
  }, [detail]);

  const handleSave = () => {
    updateWorkspace.mutate(
      {
        id: workspaceId,
        system_prompt: instructions,
        default_agents: checkedAgents,
      },
      {
        onSuccess: () => {
          setShowSaved(true);
          setTimeout(() => setShowSaved(false), 3000);
        },
      }
    );
  };

  const handleDelete = () => {
    if (window.confirm("確定刪除此工作區？對話不會被刪除。")) {
      deleteWorkspace.mutate(workspaceId, {
        onSuccess: () => onDeleted(),
      });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    uploadFile.mutate({ id: workspaceId, formData });
    // Reset input so the same file can be re-uploaded if needed
    e.target.value = "";
  };

  const handleDeleteFile = (filename: string) => {
    deleteFile.mutate({ id: workspaceId, filename });
  };

  const toggleAgent = (agentName: string) => {
    setCheckedAgents((prev) =>
      prev.includes(agentName)
        ? prev.filter((a) => a !== agentName)
        : [...prev, agentName]
    );
  };

  if (!detail) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        載入中...
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <span className="text-3xl">📁</span>
          <h2 className="text-xl font-bold">{detail.name}</h2>
        </div>

        {/* Instructions section */}
        <div className="rounded-xl border border-border p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Instructions
            </span>
            <span className="text-muted-foreground text-xs">✎</span>
          </div>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={6}
            placeholder="輸入系統提示詞..."
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none font-mono"
          />
        </div>

        {/* Files section */}
        <div className="rounded-xl border border-border p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Files
            </span>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadFile.isPending}
              className="flex items-center justify-center w-6 h-6 rounded-full bg-muted hover:bg-muted/80 text-sm font-bold disabled:opacity-50 transition-colors"
              title="上傳文件"
            >
              +
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileUpload}
          />
          {detail.files.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              尚無文件 — 點擊 + 上傳
            </p>
          ) : (
            <div className="space-y-1">
              {detail.files.map((filename) => (
                <div
                  key={filename}
                  className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-sm"
                >
                  <span className="truncate">{filename}</span>
                  <button
                    onClick={() => handleDeleteFile(filename)}
                    disabled={deleteFile.isPending}
                    className="ml-2 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50 text-xs"
                    title="刪除文件"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Default agents section */}
        <div className="rounded-xl border border-border p-5 space-y-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            預設 Agents
          </span>
          <p className="text-xs text-muted-foreground">
            開新對話時自動勾選這些 agents
          </p>
          <div className="space-y-2">
            {agents
              .filter((a) => a.enabled)
              .map((agent) => (
                <label
                  key={agent.name}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checkedAgents.includes(agent.name)}
                    onChange={() => toggleAgent(agent.name)}
                    className="rounded border-border"
                  />
                  <span>{agent.emoji}</span>
                  <span>{agent.name}</span>
                </label>
              ))}
            {agents.filter((a) => a.enabled).length === 0 && (
              <p className="text-xs text-muted-foreground">尚無可用 agent</p>
            )}
          </div>
        </div>

        {/* Save button */}
        <div>
          <button
            onClick={handleSave}
            disabled={updateWorkspace.isPending}
            className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {updateWorkspace.isPending ? "儲存中..." : "儲存"}
          </button>
          {showSaved && (
            <span className="ml-3 text-xs text-green-600 dark:text-green-400">已儲存</span>
          )}
        </div>

        {/* Danger zone */}
        <div className="rounded-xl border border-red-200 dark:border-red-900/50 p-4 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            刪除此工作區（對話不會刪除）
          </span>
          <button
            onClick={handleDelete}
            disabled={deleteWorkspace.isPending}
            className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {deleteWorkspace.isPending ? "刪除中..." : "刪除"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────

export function WorkspacesTab() {
  const { data: workspaces = [] } = useWorkspaces();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);

  // Auto-select first workspace on mount when list becomes available
  useEffect(() => {
    if (workspaces.length > 0 && selectedId === null && !showNewForm) {
      setSelectedId(workspaces[0].id);
    }
  }, [workspaces, selectedId, showNewForm]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setShowNewForm(false);
  };

  const handleNew = () => {
    setSelectedId(null);
    setShowNewForm(true);
  };

  const handleCreated = (id: string) => {
    setShowNewForm(false);
    setSelectedId(id);
  };

  const handleDeleted = () => {
    setSelectedId(null);
    setShowNewForm(false);
  };

  return (
    <div className="flex h-full">
      <WorkspaceList
        selectedId={selectedId}
        onSelect={handleSelect}
        onNew={handleNew}
      />

      {showNewForm ? (
        <NewWorkspaceForm
          onCreated={handleCreated}
          onCancel={() => setShowNewForm(false)}
        />
      ) : selectedId ? (
        <WorkspaceDetailPanel
          workspaceId={selectedId}
          onDeleted={handleDeleted}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          選擇或建立一個工作區
        </div>
      )}
    </div>
  );
}
