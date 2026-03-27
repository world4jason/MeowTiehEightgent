import { useEffect, useState } from "react";
import { useScenarios } from "../hooks/useChatApi";
import { useAgentsList } from "../hooks/useChatApi";
import {
  useScenarioDetail,
  useCreateScenario,
  useUpdateScenario,
  useDeleteScenario,
} from "./useSettingsApi";
import { isValidName } from "./utils";

// ─── Left column: scenario list ──────────────────────────────

interface ScenarioListProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}

function ScenarioList({ selectedId, onSelect, onNew }: ScenarioListProps) {
  const { data: scenarios = [] } = useScenarios();

  return (
    <div className="w-[260px] min-w-[260px] overflow-y-auto border-r border-border p-4 flex flex-col gap-1">
      {scenarios.length === 0 && (
        <p className="text-xs text-muted-foreground px-2 py-4 text-center">
          尚未建立情境模板
        </p>
      )}
      {scenarios.map((sc) => (
        <button
          key={sc.id}
          onClick={() => onSelect(sc.id)}
          className={`flex flex-col w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
            selectedId === sc.id
              ? "bg-accent text-accent-foreground"
              : "hover:bg-muted/50 text-foreground"
          }`}
        >
          <span className="font-medium truncate">{sc.name}</span>
          {sc.description && (
            <span className="text-xs text-muted-foreground truncate mt-0.5">
              {sc.description}
            </span>
          )}
        </button>
      ))}
      <button
        onClick={onNew}
        className="mt-2 flex items-center justify-center gap-1 w-full border border-dashed border-border rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
      >
        + 新增情境
      </button>
    </div>
  );
}

// ─── New scenario form ────────────────────────────────────────

interface NewScenarioFormProps {
  onCreated: (id: string) => void;
  onCancel: () => void;
}

function NewScenarioForm({ onCreated, onCancel }: NewScenarioFormProps) {
  const { data: agents = [] } = useAgentsList();
  const createScenario = useCreateScenario();

  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [topicHint, setTopicHint] = useState("");
  const [checkedAgents, setCheckedAgents] = useState<string[]>([]);

  const idValid = isValidName(id);
  const canSubmit = idValid && name.trim().length > 0 && !createScenario.isPending;

  const toggleAgent = (agentName: string) => {
    setCheckedAgents((prev) =>
      prev.includes(agentName)
        ? prev.filter((a) => a !== agentName)
        : [...prev, agentName]
    );
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    createScenario.mutate(
      {
        id: id.trim(),
        name: name.trim(),
        description: description.trim(),
        system_prompt: systemPrompt,
        suggested_agents: checkedAgents,
        topic_hint: topicHint.trim(),
      },
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
        <h2 className="text-xl font-bold">新增情境模板</h2>

        <div className="rounded-xl border border-border p-5 space-y-4">
          {/* ID */}
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              ID <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="例：code-review"
              autoFocus
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            {id && !idValid && (
              <p className="text-xs text-destructive">
                ID 不可含空白、/ \\ . 且長度須在 1–64 字元
              </p>
            )}
          </div>

          {/* Name */}
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              名稱 <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="輸入情境名稱..."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              描述
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="簡短說明此情境..."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* System Prompt */}
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              System Prompt
            </label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="輸入系統提示詞..."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none font-mono min-h-[200px]"
            />
          </div>

          {/* Topic Hint */}
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Topic Hint
            </label>
            <input
              type="text"
              value={topicHint}
              onChange={(e) => setTopicHint(e.target.value)}
              placeholder="例：請描述你想 review 的程式碼..."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Suggested Agents */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              建議 Agents
            </label>
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
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {createScenario.isPending ? "建立中..." : "建立"}
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

// ─── Scenario detail panel ────────────────────────────────────

interface ScenarioDetailPanelProps {
  scenarioId: string;
  onDeleted: () => void;
}

function ScenarioDetailPanel({ scenarioId, onDeleted }: ScenarioDetailPanelProps) {
  const { data: detail } = useScenarioDetail(scenarioId);
  const { data: agents = [] } = useAgentsList();

  const updateScenario = useUpdateScenario();
  const deleteScenario = useDeleteScenario();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [topicHint, setTopicHint] = useState("");
  const [checkedAgents, setCheckedAgents] = useState<string[]>([]);
  const [showSaved, setShowSaved] = useState(false);

  // Sync local state when detail loads
  useEffect(() => {
    if (detail) {
      setName(detail.name ?? "");
      setDescription(detail.description ?? "");
      setSystemPrompt(detail.system_prompt ?? "");
      setTopicHint(detail.topic_hint ?? "");
      setCheckedAgents(detail.suggested_agents ?? []);
    }
  }, [detail]);

  const handleSave = () => {
    updateScenario.mutate(
      {
        id: scenarioId,
        name: name.trim(),
        description: description.trim(),
        system_prompt: systemPrompt,
        suggested_agents: checkedAgents,
        topic_hint: topicHint.trim(),
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
    if (window.confirm("確定刪除此情境模板？")) {
      deleteScenario.mutate(scenarioId, {
        onSuccess: () => onDeleted(),
      });
    }
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
        <h2 className="text-xl font-bold">{detail.name}</h2>

        {/* Fields */}
        <div className="rounded-xl border border-border p-5 space-y-4">
          {/* Name */}
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              名稱
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              描述
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="簡短說明此情境..."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* System Prompt */}
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              System Prompt
            </label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="輸入系統提示詞..."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none font-mono min-h-[200px]"
            />
          </div>

          {/* Topic Hint */}
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Topic Hint
            </label>
            <input
              type="text"
              value={topicHint}
              onChange={(e) => setTopicHint(e.target.value)}
              placeholder="例：請描述你想討論的主題..."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Suggested Agents */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              建議 Agents
            </label>
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
        </div>

        {/* Save button */}
        <div>
          <button
            onClick={handleSave}
            disabled={updateScenario.isPending}
            className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {updateScenario.isPending ? "儲存中..." : "儲存"}
          </button>
          {showSaved && (
            <span className="ml-3 text-xs text-green-600 dark:text-green-400">已儲存</span>
          )}
        </div>

        {/* Danger zone */}
        <div className="rounded-xl border border-red-200 dark:border-red-900/50 p-4 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            刪除此情境模板
          </span>
          <button
            onClick={handleDelete}
            disabled={deleteScenario.isPending}
            className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {deleteScenario.isPending ? "刪除中..." : "刪除"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────

export function ScenariosTab() {
  const { data: scenarios = [] } = useScenarios();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);

  // Auto-select first scenario on mount when list becomes available
  useEffect(() => {
    if (scenarios.length > 0 && selectedId === null && !showNewForm) {
      setSelectedId(scenarios[0].id);
    }
  }, [scenarios, selectedId, showNewForm]);

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
      <ScenarioList
        selectedId={selectedId}
        onSelect={handleSelect}
        onNew={handleNew}
      />

      {showNewForm ? (
        <NewScenarioForm
          onCreated={handleCreated}
          onCancel={() => setShowNewForm(false)}
        />
      ) : selectedId ? (
        <ScenarioDetailPanel
          scenarioId={selectedId}
          onDeleted={handleDeleted}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          選擇或建立一個情境模板
        </div>
      )}
    </div>
  );
}
