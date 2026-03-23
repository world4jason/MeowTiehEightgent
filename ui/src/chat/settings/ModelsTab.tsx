import { useState, useEffect } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useModels,
  useCreateModel,
  useUpdateModel,
  useDeleteModel,
  useOllamaModels,
  usePullOllamaModel,
} from "./useSettingsApi";
import type { ModelInfo } from "../types";

// ─── Helpers ──────────────────────────────────────────────────

function isApiType(type: string) {
  return type === "api" || type === "ollama";
}

function typeBadge(type: string) {
  return type === "cli" ? "cli" : "api";
}

// ─── Left-column model item ────────────────────────────────────

interface ModelItemProps {
  model: ModelInfo;
  selected: boolean;
  onClick: () => void;
}

function ModelItem({ model, selected, onClick }: ModelItemProps) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer transition-colors ${
        selected ? "bg-accent" : "hover:bg-accent/50"
      }`}
      onClick={onClick}
    >
      <span className="text-lg leading-none">{model.emoji ?? "🤖"}</span>
      <div className="flex-1 min-w-0">
        <div
          className="truncate text-sm font-semibold"
          style={{ color: model.color ?? undefined }}
        >
          {model.label ?? model.id}
        </div>
      </div>
      <span className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide bg-muted text-muted-foreground flex-shrink-0">
        {typeBadge(model.type)}
      </span>
    </div>
  );
}

// ─── Ollama model selector ─────────────────────────────────────

interface OllamaModelSelectProps {
  baseUrl: string;
  value: string;
  onChange: (v: string) => void;
}

function OllamaModelSelect({ baseUrl, value, onChange }: OllamaModelSelectProps) {
  const { data, isLoading } = useOllamaModels(baseUrl);
  const models = data?.models ?? [];

  if (!baseUrl) {
    return (
      <Input
        placeholder="例：llama3.2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>載入模型清單...</span>
      </div>
    );
  }

  if (models.length === 0) {
    return (
      <Input
        placeholder="例：llama3.2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return (
    <select
      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">-- 選擇模型 --</option>
      {models.map((m) => (
        <option key={m} value={m}>
          {m}
        </option>
      ))}
    </select>
  );
}

// ─── Edit form (right column) ──────────────────────────────────

interface EditFormProps {
  model: ModelInfo;
  onDeleted: () => void;
}

function EditForm({ model, onDeleted }: EditFormProps) {
  const updateModel = useUpdateModel();
  const deleteModel = useDeleteModel();

  const [label, setLabel] = useState(model.label ?? "");
  const [emoji, setEmoji] = useState(model.emoji ?? "");
  const [color, setColor] = useState(model.color ?? "");
  const [cmd, setCmd] = useState((model.cmd ?? []).join(" "));
  const [baseUrl, setBaseUrl] = useState(model.baseUrl ?? "");
  const [apiModel, setApiModel] = useState(model.apiModel ?? "");

  // Reset when selected model changes
  useEffect(() => {
    setLabel(model.label ?? "");
    setEmoji(model.emoji ?? "");
    setColor(model.color ?? "");
    setCmd((model.cmd ?? []).join(" "));
    setBaseUrl(model.baseUrl ?? "");
    setApiModel(model.apiModel ?? "");
  }, [model.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pullOllama = usePullOllamaModel();
  const [pulling, setPulling] = useState(false);

  const handleSave = () => {
    const body: Partial<ModelInfo> & { id: string } = {
      id: model.id,
      label: label || undefined,
      emoji: emoji || undefined,
      color: color || undefined,
    };
    if (model.type === "cli") {
      body.cmd = cmd.trim() ? cmd.trim().split(/\s+/) : [];
    } else {
      body.baseUrl = baseUrl || undefined;
      body.apiModel = apiModel || undefined;
    }
    updateModel.mutate(body);
  };

  const handleDelete = () => {
    if (!window.confirm(`確定要刪除模型「${model.label ?? model.id}」嗎？`)) return;
    deleteModel.mutate(model.id, { onSuccess: onDeleted });
  };

  const handlePull = async () => {
    if (!apiModel) return;
    setPulling(true);
    pullOllama.mutate(
      { model: apiModel, base_url: baseUrl || undefined },
      { onSettled: () => setPulling(false) }
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="text-3xl">{emoji || "🤖"}</span>
        <div>
          <h2 className="text-base font-semibold">{model.label ?? model.id}</h2>
          <p className="text-xs text-muted-foreground">ID: {model.id}</p>
        </div>
      </div>

      {/* Basic info */}
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          基本資訊
        </p>

        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            顯示名稱
          </label>
          <Input
            placeholder={model.id}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Emoji
          </label>
          <Input
            placeholder="🤖"
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            顏色
          </label>
          <div className="flex items-center gap-2">
            {color && (
              <span
                className="inline-block h-3 w-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
              />
            )}
            <Input
              placeholder="#6366f1"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </div>
        </div>

        {model.type === "cli" ? (
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              指令 (Command)
            </label>
            <Input
              placeholder="claude --dangerously-skip-permissions"
              value={cmd}
              onChange={(e) => setCmd(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">以空格分隔的指令與參數</p>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Base URL
              </label>
              <Input
                placeholder="http://localhost:11434"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                模型名稱
              </label>
              <OllamaModelSelect
                baseUrl={baseUrl}
                value={apiModel}
                onChange={setApiModel}
              />
            </div>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2">
        <Button
          className="bg-green-600 hover:bg-green-700 text-white"
          onClick={handleSave}
          disabled={updateModel.isPending}
        >
          {updateModel.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          儲存
        </Button>

        {isApiType(model.type) && baseUrl && apiModel && (
          <Button
            variant="outline"
            onClick={handlePull}
            disabled={pulling || pullOllama.isPending}
          >
            {(pulling || pullOllama.isPending) && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {pulling || pullOllama.isPending ? "下載中..." : "Pull Model"}
          </Button>
        )}

        <div className="flex-1" />

        <Button
          variant="outline"
          className="text-destructive hover:text-destructive"
          onClick={handleDelete}
          disabled={deleteModel.isPending}
        >
          {deleteModel.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="mr-2 h-4 w-4" />
          )}
          刪除
        </Button>
      </div>
    </div>
  );
}

// ─── New model form (right column) ────────────────────────────

interface NewFormProps {
  onCreated: (id: string) => void;
  onCancel: () => void;
}

function NewForm({ onCreated, onCancel }: NewFormProps) {
  const createModel = useCreateModel();

  const [type, setType] = useState<"cli" | "api">("cli");
  const [id, setId] = useState("");
  const [label, setLabel] = useState("");
  const [emoji, setEmoji] = useState("");
  const [color, setColor] = useState("");
  const [cmd, setCmd] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiModel, setApiModel] = useState("");

  const handleCreate = () => {
    if (!id.trim()) return;
    const body: Partial<ModelInfo> & { id: string } = {
      id: id.trim(),
      type,
      label: label || undefined,
      emoji: emoji || undefined,
      color: color || undefined,
    };
    if (type === "cli") {
      body.cmd = cmd.trim() ? cmd.trim().split(/\s+/) : [];
    } else {
      body.baseUrl = baseUrl || undefined;
      body.apiModel = apiModel || undefined;
    }
    createModel.mutate(body, {
      onSuccess: () => onCreated(id.trim()),
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-base font-semibold">新增模型</h2>
        <p className="text-xs text-muted-foreground">設定新的模型連接</p>
      </div>

      {/* Type toggle */}
      <div className="space-y-1">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          類型
        </label>
        <div className="flex gap-2">
          <button
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              type === "cli"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
            onClick={() => setType("cli")}
          >
            CLI
          </button>
          <button
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              type === "api"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
            onClick={() => setType("api")}
          >
            API
          </button>
        </div>
      </div>

      {/* ID */}
      <div className="space-y-1">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          ID <span className="text-destructive">*</span>
        </label>
        <Input
          placeholder="例：my-claude"
          value={id}
          onChange={(e) => setId(e.target.value)}
        />
        <p className="text-[11px] text-muted-foreground">唯一識別碼，建立後無法更改</p>
      </div>

      {/* Basic info */}
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          基本資訊
        </p>

        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            顯示名稱
          </label>
          <Input
            placeholder="My Claude"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Emoji
          </label>
          <Input
            placeholder="🤖"
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            顏色
          </label>
          <div className="flex items-center gap-2">
            {color && (
              <span
                className="inline-block h-3 w-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
              />
            )}
            <Input
              placeholder="#6366f1"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </div>
        </div>

        {type === "cli" ? (
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              指令 (Command)
            </label>
            <Input
              placeholder="claude --dangerously-skip-permissions"
              value={cmd}
              onChange={(e) => setCmd(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">以空格分隔的指令與參數</p>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Base URL
              </label>
              <Input
                placeholder="http://localhost:11434"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                模型名稱
              </label>
              <OllamaModelSelect
                baseUrl={baseUrl}
                value={apiModel}
                onChange={setApiModel}
              />
            </div>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2">
        <Button
          className="bg-green-600 hover:bg-green-700 text-white"
          onClick={handleCreate}
          disabled={!id.trim() || createModel.isPending}
        >
          {createModel.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          建立
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          取消
        </Button>
      </div>
    </div>
  );
}

// ─── Main tab ─────────────────────────────────────────────────

export function ModelsTab() {
  const { data: models = [], isLoading } = useModels();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const selectedModel = models.find((m) => m.id === selectedId) ?? null;

  // Auto-select first model if none selected and not creating
  useEffect(() => {
    if (!isCreating && !selectedId && models.length > 0) {
      setSelectedId(models[0].id);
    }
  }, [models, isCreating, selectedId]);

  const handleSelect = (id: string) => {
    setIsCreating(false);
    setSelectedId(id);
  };

  const handleNew = () => {
    setIsCreating(true);
    setSelectedId(null);
  };

  const handleCreated = (id: string) => {
    setIsCreating(false);
    setSelectedId(id);
  };

  const handleDeleted = () => {
    setSelectedId(null);
  };

  return (
    <div className="flex h-full">
      {/* Left column */}
      <div className="w-[260px] min-w-[260px] overflow-y-auto border-r border-border p-4 flex flex-col gap-1">
        {isLoading ? (
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>載入中...</span>
          </div>
        ) : models.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">
            尚未設定模型
          </div>
        ) : (
          models.map((m) => (
            <ModelItem
              key={m.id}
              model={m}
              selected={!isCreating && selectedId === m.id}
              onClick={() => handleSelect(m.id)}
            />
          ))
        )}

        {/* Add button */}
        <button
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          onClick={handleNew}
        >
          <Plus className="h-3.5 w-3.5" />
          新增模型
        </button>
      </div>

      {/* Right column */}
      <div className="flex-1 overflow-y-auto p-6">
        {isCreating ? (
          <NewForm onCreated={handleCreated} onCancel={() => setIsCreating(false)} />
        ) : selectedModel ? (
          <EditForm key={selectedModel.id} model={selectedModel} onDeleted={handleDeleted} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            選擇左側模型或新增一個
          </div>
        )}
      </div>
    </div>
  );
}
