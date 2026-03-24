import { useState, useEffect } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useAdapterPresets,
  useCreateAdapterPreset,
  useUpdateAdapterPreset,
  useDeleteAdapterPreset,
} from "./useSettingsApi";
import type { AdapterPresetInfo } from "../types";

// ─── Left-column adapter item ────────────────────────────────

interface AdapterItemProps {
  adapterType: string;
  preset: AdapterPresetInfo;
  selected: boolean;
  onClick: () => void;
}

function AdapterItem({ adapterType, preset, selected, onClick }: AdapterItemProps) {
  const isApi = Boolean(preset.baseUrl);
  return (
    <div
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer transition-colors ${
        selected ? "bg-accent" : "hover:bg-accent/50"
      }`}
      onClick={onClick}
    >
      <span className="text-lg leading-none">{isApi ? "🌐" : "💻"}</span>
      <div className="flex-1 min-w-0">
        <div className="truncate text-sm font-semibold">{adapterType}</div>
        <div className="truncate text-xs text-muted-foreground">
          {preset.command ?? preset.baseUrl ?? "—"}
        </div>
      </div>
      <span className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide bg-muted text-muted-foreground flex-shrink-0">
        {isApi ? "api" : "cli"}
      </span>
    </div>
  );
}

// ─── Edit form (right column) ────────────────────────────────

interface EditFormProps {
  adapterType: string;
  preset: AdapterPresetInfo;
  onDeleted: () => void;
}

function EditForm({ adapterType, preset, onDeleted }: EditFormProps) {
  const updatePreset = useUpdateAdapterPreset();
  const deletePreset = useDeleteAdapterPreset();

  const [command, setCommand] = useState(preset.command ?? "");
  const [defaultArgs, setDefaultArgs] = useState((preset.defaultArgs ?? []).join(" "));
  const [defaultModel, setDefaultModel] = useState(preset.defaultModel ?? "");
  const [baseUrl, setBaseUrl] = useState(preset.baseUrl ?? "");
  const [timeoutSec, setTimeoutSec] = useState(String(preset.timeoutSec ?? ""));
  const [startupTimeoutSec, setStartupTimeoutSec] = useState(
    String(preset.startupTimeoutSec ?? "")
  );
  const [supportsImage, setSupportsImage] = useState(preset.supports_image ?? false);

  useEffect(() => {
    setCommand(preset.command ?? "");
    setDefaultArgs((preset.defaultArgs ?? []).join(" "));
    setDefaultModel(preset.defaultModel ?? "");
    setBaseUrl(preset.baseUrl ?? "");
    setTimeoutSec(String(preset.timeoutSec ?? ""));
    setStartupTimeoutSec(String(preset.startupTimeoutSec ?? ""));
    setSupportsImage(preset.supports_image ?? false);
  }, [adapterType]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = () => {
    const body: AdapterPresetInfo = {
      adapterType,
      command: command || undefined,
      defaultArgs: defaultArgs.trim() ? defaultArgs.trim().split(/\s+/) : undefined,
      defaultModel: defaultModel || undefined,
      baseUrl: baseUrl || undefined,
      timeoutSec: timeoutSec ? Number(timeoutSec) : undefined,
      startupTimeoutSec: startupTimeoutSec ? Number(startupTimeoutSec) : undefined,
      supports_image: supportsImage || undefined,
    };
    updatePreset.mutate(body);
  };

  const handleDelete = () => {
    if (!window.confirm(`確定要刪除 Adapter「${adapterType}」嗎？`)) return;
    deletePreset.mutate(adapterType, { onSuccess: onDeleted });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-base font-semibold">{adapterType}</h2>
        <p className="text-xs text-muted-foreground">Adapter Preset 設定</p>
      </div>

      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          基本設定
        </p>

        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            指令 (Command)
          </label>
          <Input
            placeholder="例：claude"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            預設參數 (Default Args)
          </label>
          <Input
            placeholder="例：--dangerously-skip-permissions --print"
            value={defaultArgs}
            onChange={(e) => setDefaultArgs(e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">以空格分隔</p>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            預設模型 (Default Model)
          </label>
          <Input
            placeholder="例：claude-sonnet-4-20250514"
            value={defaultModel}
            onChange={(e) => setDefaultModel(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Base URL
          </label>
          <Input
            placeholder="例：http://localhost:11434"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Timeout (秒)
            </label>
            <Input
              type="number"
              placeholder="300"
              value={timeoutSec}
              onChange={(e) => setTimeoutSec(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              啟動 Timeout (秒)
            </label>
            <Input
              type="number"
              placeholder="30"
              value={startupTimeoutSec}
              onChange={(e) => setStartupTimeoutSec(e.target.value)}
            />
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={supportsImage}
            onChange={(e) => setSupportsImage(e.target.checked)}
          />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            支援圖片
          </span>
        </label>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2">
        <Button
          className="bg-green-600 hover:bg-green-700 text-white"
          onClick={handleSave}
          disabled={updatePreset.isPending}
        >
          {updatePreset.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          儲存
        </Button>

        <div className="flex-1" />

        <Button
          variant="outline"
          className="text-destructive hover:text-destructive"
          onClick={handleDelete}
          disabled={deletePreset.isPending}
        >
          {deletePreset.isPending ? (
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

// ─── New adapter form (right column) ─────────────────────────

interface NewFormProps {
  onCreated: (adapterType: string) => void;
  onCancel: () => void;
}

function NewForm({ onCreated, onCancel }: NewFormProps) {
  const createPreset = useCreateAdapterPreset();

  const [adapterType, setAdapterType] = useState("");
  const [command, setCommand] = useState("");
  const [defaultArgs, setDefaultArgs] = useState("");
  const [defaultModel, setDefaultModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");

  const handleCreate = () => {
    if (!adapterType.trim()) return;
    const body: AdapterPresetInfo = {
      adapterType: adapterType.trim(),
      command: command || undefined,
      defaultArgs: defaultArgs.trim() ? defaultArgs.trim().split(/\s+/) : undefined,
      defaultModel: defaultModel || undefined,
      baseUrl: baseUrl || undefined,
    };
    createPreset.mutate(body, {
      onSuccess: () => onCreated(adapterType.trim()),
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">新增 Adapter Preset</h2>
        <p className="text-xs text-muted-foreground">設定新的 Adapter 連接</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Adapter Type <span className="text-destructive">*</span>
          </label>
          <Input
            placeholder="例：claude_local"
            value={adapterType}
            onChange={(e) => setAdapterType(e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">
            唯一識別碼，例：claude_local, gemini_local, ollama_api
          </p>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            指令 (Command)
          </label>
          <Input
            placeholder="例：claude"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            預設參數 (Default Args)
          </label>
          <Input
            placeholder="例：--dangerously-skip-permissions --print"
            value={defaultArgs}
            onChange={(e) => setDefaultArgs(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            預設模型 (Default Model)
          </label>
          <Input
            placeholder="例：claude-sonnet-4-20250514"
            value={defaultModel}
            onChange={(e) => setDefaultModel(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Base URL
          </label>
          <Input
            placeholder="例：http://localhost:11434"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 pt-2">
        <Button
          className="bg-green-600 hover:bg-green-700 text-white"
          onClick={handleCreate}
          disabled={!adapterType.trim() || createPreset.isPending}
        >
          {createPreset.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          建立
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          取消
        </Button>
      </div>
    </div>
  );
}

// ─── Main tab ────────────────────────────────────────────────

export function AdaptersTab() {
  const { data: presetsMap, isLoading } = useAdapterPresets();
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Convert record to sorted entries
  const entries = Object.entries(presetsMap ?? {}).sort(([a], [b]) => a.localeCompare(b));

  const selectedPreset = selectedType
    ? entries.find(([k]) => k === selectedType)
    : null;

  // Auto-select first if none selected
  useEffect(() => {
    if (!isCreating && !selectedType && entries.length > 0) {
      setSelectedType(entries[0][0]);
    }
  }, [entries.length, isCreating, selectedType]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelect = (type: string) => {
    setIsCreating(false);
    setSelectedType(type);
  };

  const handleNew = () => {
    setIsCreating(true);
    setSelectedType(null);
  };

  const handleCreated = (type: string) => {
    setIsCreating(false);
    setSelectedType(type);
  };

  const handleDeleted = () => {
    setSelectedType(null);
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
        ) : entries.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">
            尚未設定 Adapter
          </div>
        ) : (
          entries.map(([type, preset]) => (
            <AdapterItem
              key={type}
              adapterType={type}
              preset={preset}
              selected={!isCreating && selectedType === type}
              onClick={() => handleSelect(type)}
            />
          ))
        )}

        {/* Add button */}
        <button
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          onClick={handleNew}
        >
          <Plus className="h-3.5 w-3.5" />
          新增 Adapter
        </button>
      </div>

      {/* Right column */}
      <div className="flex-1 overflow-y-auto p-6">
        {isCreating ? (
          <NewForm onCreated={handleCreated} onCancel={() => setIsCreating(false)} />
        ) : selectedPreset ? (
          <EditForm
            key={selectedPreset[0]}
            adapterType={selectedPreset[0]}
            preset={selectedPreset[1]}
            onDeleted={handleDeleted}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            選擇左側 Adapter 或新增一個
          </div>
        )}
      </div>
    </div>
  );
}
