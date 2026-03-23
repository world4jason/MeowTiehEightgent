import { useState, useEffect, useRef } from "react";
import { Loader2, Plus, Pencil } from "lucide-react";
import {
  useMarketplaceAgents,
  useMarketplaceAgentDetail,
  useInstallMarketplaceAgent,
  useCreateAgent,
  useModels,
  useCreateMarketplaceAgent,
  useUpdateMarketplaceAgent,
  useDeleteMarketplaceAgent,
} from "./useSettingsApi";
import type { MarketplaceAgent } from "../types";
import { isValidName } from "./utils";

interface Props {
  onInstalled: (agentName: string) => void;
}

// ─── Installed badge ─────────────────────────────────────────
function InstalledBadge() {
  return (
    <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
      已安裝
    </span>
  );
}

// ─── Card grid ───────────────────────────────────────────────
interface CardGridProps {
  agents: MarketplaceAgent[];
  onSelect: (agent: MarketplaceAgent) => void;
}

function CardGrid({ agents, onSelect }: CardGridProps) {
  if (agents.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        代理人市場中沒有可用的模板 — 使用上方「手動新增」建立代理人
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-3xl grid grid-cols-1 md:grid-cols-2 gap-4">
        {agents.map((agent) => (
          <button
            key={agent.id}
            className="rounded-xl border border-border bg-card p-5 text-left transition-colors hover:bg-accent/30 cursor-pointer"
            onClick={() => onSelect(agent)}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{agent.emoji}</span>
                <span className="font-bold" style={{ color: agent.color }}>
                  {agent.id}
                </span>
              </div>
              {agent.installed && <InstalledBadge />}
            </div>
            <p className="text-sm text-muted-foreground mb-3">{agent.description}</p>
            <span className="text-sm text-emerald-500">點擊查看 →</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Detail view ─────────────────────────────────────────────
interface DetailViewProps {
  agent: MarketplaceAgent;
  onBack: () => void;
  onInstalled: (agentName: string) => void;
  onEdit: (agentId: string) => void;
}

function DetailView({ agent, onBack, onInstalled, onEdit }: DetailViewProps) {
  const { data: detail, isLoading: detailLoading } = useMarketplaceAgentDetail(agent.id);
  const { data: modelsData } = useModels();
  const installMutation = useInstallMarketplaceAgent();

  const [name, setName] = useState(agent.id);
  const [model, setModel] = useState<string>("");
  const [nameError, setNameError] = useState<string | null>(null);

  const handleNameChange = (v: string) => {
    setName(v);
    if (v && !isValidName(v)) {
      setNameError("名稱不可包含 / \\ . 空格，最長 64 字元");
    } else {
      setNameError(null);
    }
  };

  const models = modelsData ?? [];
  const effectiveModel = model || (models[0]?.id ?? "");

  function handleInstall() {
    installMutation.mutate(
      { id: agent.id, name, model: effectiveModel },
      {
        onSuccess: (result) => {
          onInstalled(result.name);
        },
      }
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Back button */}
        <button
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          onClick={onBack}
        >
          ← 返回代理人市場
        </button>

        {/* Header */}
        <div className="flex items-center gap-3">
          <span className="text-4xl">{agent.emoji}</span>
          <div className="flex-1">
            <h2 className="text-xl font-bold" style={{ color: agent.color }}>
              {agent.id}
            </h2>
            <p className="text-sm text-muted-foreground">{agent.description}</p>
          </div>
          {agent.installed && <InstalledBadge />}
          <button
            onClick={() => onEdit(agent.id)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
            編輯
          </button>
        </div>

        {/* Preview sections */}
        {detailLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            載入中...
          </div>
        ) : detail ? (
          <>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                AGENT.MD
              </p>
              <pre className="overflow-x-auto rounded-lg bg-muted/40 p-4 text-xs text-muted-foreground whitespace-pre-wrap">
                {detail.agent_md || "(空)"}
              </pre>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                IDENTITY.MD
              </p>
              <pre className="overflow-x-auto rounded-lg bg-muted/40 p-4 text-xs text-muted-foreground whitespace-pre-wrap">
                {detail.identity_md || "(空)"}
              </pre>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                SOUL.MD
              </p>
              <pre className="overflow-x-auto rounded-lg bg-muted/40 p-4 text-xs text-muted-foreground whitespace-pre-wrap">
                {detail.soul_md || "(空)"}
              </pre>
            </div>
          </>
        ) : null}

        {/* Fork form */}
        <div className="rounded-xl border border-border p-5 space-y-4">
          <h3 className="font-semibold text-sm">安裝此模板</h3>

          {/* Name input */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Agent 名稱</label>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="輸入 agent 名稱..."
            />
            {nameError && (
              <p className="text-xs text-destructive">{nameError}</p>
            )}
          </div>

          {/* Model select */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">模型</label>
            <select
              value={effectiveModel}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.emoji ? `${m.emoji} ` : ""}{m.label ?? m.id}
                </option>
              ))}
              {models.length === 0 && (
                <option value="" disabled>
                  載入模型中...
                </option>
              )}
            </select>
          </div>

          {/* Install button */}
          <button
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            onClick={handleInstall}
            disabled={installMutation.isPending || !name.trim() || !isValidName(name.trim())}
          >
            {installMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            安裝
          </button>

          {installMutation.isError && (
            <p className="text-xs text-destructive">安裝失敗，請重試。</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Create agent form ────────────────────────────────────────

interface CreateFormProps {
  onBack: () => void;
  onCreated: (agentName: string) => void;
}

function CreateAgentForm({ onBack, onCreated }: CreateFormProps) {
  const { data: modelsData } = useModels();
  const createAgent = useCreateAgent();

  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🤖");
  const [description, setDescription] = useState("");
  const [model, setModel] = useState("");

  const models = modelsData ?? [];
  const effectiveModel = model || (models[0]?.id ?? "");
  const nameValid = isValidName(name);

  function handleCreate() {
    createAgent.mutate(
      { name, emoji, description: description || undefined, model: effectiveModel },
      { onSuccess: (result) => onCreated(result.name) },
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <button
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          onClick={onBack}
        >
          ← 返回代理人市場
        </button>

        <h2 className="text-xl font-bold">手動新增代理人</h2>
        <p className="text-sm text-muted-foreground">
          從零開始建立一個新的代理人，使用預設模板（靈魂 tab 中的 _default）。
        </p>

        <div className="rounded-xl border border-border p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">名稱</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="例如: my-agent"
            />
            {name.length > 0 && !nameValid && (
              <p className="text-xs text-destructive">名稱不可包含 / \ . 空格，最長 64 字元</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Emoji</label>
            <input
              type="text"
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              className="w-20 rounded-lg border border-border bg-background px-3 py-2 text-sm text-center"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">描述</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="選填"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">模型</label>
            <select
              value={effectiveModel}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.emoji ? `${m.emoji} ` : ""}{m.label ?? m.id}
                </option>
              ))}
              {models.length === 0 && (
                <option value="" disabled>載入模型中...</option>
              )}
            </select>
          </div>

          <div className="flex gap-3">
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              onClick={handleCreate}
              disabled={createAgent.isPending || !nameValid}
            >
              {createAgent.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              建立
            </button>
            <button
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              onClick={onBack}
            >
              取消
            </button>
          </div>

          {createAgent.isError && (
            <p className="text-xs text-destructive">建立失敗，請檢查名稱是否重複。</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Create Marketplace Template form ────────────────────────
interface CreateTemplateFormProps {
  onBack: () => void;
}

function CreateTemplateForm({ onBack }: CreateTemplateFormProps) {
  const createTemplate = useCreateMarketplaceAgent();

  const [id, setId] = useState("");
  const [emoji, setEmoji] = useState("🤖");
  const [color, setColor] = useState("#888888");
  const [description, setDescription] = useState("");
  const [agentMd, setAgentMd] = useState("");
  const [identityMd, setIdentityMd] = useState("");
  const [soulMd, setSoulMd] = useState("");

  const idValid = isValidName(id);

  function handleCreate() {
    createTemplate.mutate(
      {
        id,
        emoji: emoji || undefined,
        color: color || undefined,
        description: description || undefined,
        agent_md: agentMd || undefined,
        identity_md: identityMd || undefined,
        soul_md: soulMd || undefined,
      },
      { onSuccess: onBack },
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <button
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          onClick={onBack}
        >
          ← 返回代理人市場
        </button>

        <h2 className="text-xl font-bold">上架模板到市場</h2>
        <p className="text-sm text-muted-foreground">
          建立一個新的市場模板，其他人可以安裝使用。
        </p>

        <div className="rounded-xl border border-border p-5 space-y-4">
          {/* ID */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">ID（必填）</label>
            <input
              type="text"
              value={id}
              onChange={(e) => setId(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="例如: my-template"
            />
            {id.length > 0 && !idValid && (
              <p className="text-xs text-destructive">ID 不可包含 / \ . 空格，最長 64 字元</p>
            )}
          </div>

          {/* Emoji */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Emoji</label>
            <input
              type="text"
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              className="w-20 rounded-lg border border-border bg-background px-3 py-2 text-sm text-center"
            />
          </div>

          {/* Color */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">顏色（Hex）</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border border-border bg-background"
              />
              <input
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-32 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="#888888"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
              placeholder="選填"
              rows={2}
            />
          </div>

          {/* AGENT.MD */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">AGENT.MD</label>
            <textarea
              value={agentMd}
              onChange={(e) => setAgentMd(e.target.value)}
              className="min-h-[200px] resize-y rounded-lg border border-border bg-background p-4 font-mono text-sm w-full focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Agent 行為說明（Markdown）"
            />
          </div>

          {/* IDENTITY.MD */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">IDENTITY.MD</label>
            <textarea
              value={identityMd}
              onChange={(e) => setIdentityMd(e.target.value)}
              className="min-h-[200px] resize-y rounded-lg border border-border bg-background p-4 font-mono text-sm w-full focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Agent 身份定義（Markdown）"
            />
          </div>

          {/* SOUL.MD */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">SOUL.MD</label>
            <textarea
              value={soulMd}
              onChange={(e) => setSoulMd(e.target.value)}
              className="min-h-[200px] resize-y rounded-lg border border-border bg-background p-4 font-mono text-sm w-full focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Agent 靈魂設定（Markdown）"
            />
          </div>

          <div className="flex gap-3">
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              onClick={handleCreate}
              disabled={createTemplate.isPending || !idValid}
            >
              {createTemplate.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              上架
            </button>
            <button
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              onClick={onBack}
            >
              取消
            </button>
          </div>

          {createTemplate.isError && (
            <p className="text-xs text-destructive">上架失敗，請檢查 ID 是否重複。</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Edit Marketplace Template form ──────────────────────────
interface EditTemplateFormProps {
  agentId: string;
  onBack: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}

function EditTemplateForm({ agentId, onBack, onSaved, onDeleted }: EditTemplateFormProps) {
  const { data: detail, isLoading } = useMarketplaceAgentDetail(agentId);
  const updateTemplate = useUpdateMarketplaceAgent();
  const deleteTemplate = useDeleteMarketplaceAgent();

  const [emoji, setEmoji] = useState("");
  const [color, setColor] = useState("");
  const [description, setDescription] = useState("");
  const [agentMd, setAgentMd] = useState("");
  const [identityMd, setIdentityMd] = useState("");
  const [soulMd, setSoulMd] = useState("");
  const initializedRef = useRef(false);

  // Pre-fill form once detail loads
  useEffect(() => {
    if (detail && !initializedRef.current) {
      setEmoji(detail.emoji ?? "🤖");
      setColor(detail.color ?? "#888888");
      setDescription(detail.description ?? "");
      setAgentMd(detail.agent_md ?? "");
      setIdentityMd(detail.identity_md ?? "");
      setSoulMd(detail.soul_md ?? "");
      initializedRef.current = true;
    }
  }, [detail]);

  function handleSave() {
    updateTemplate.mutate(
      {
        id: agentId,
        emoji: emoji || undefined,
        color: color || undefined,
        description: description || undefined,
        agent_md: agentMd || undefined,
        identity_md: identityMd || undefined,
        soul_md: soulMd || undefined,
      },
      { onSuccess: onSaved },
    );
  }

  function handleDelete() {
    if (!window.confirm(`確定要刪除「${agentId}」模板嗎？此操作無法復原。`)) return;
    deleteTemplate.mutate(agentId, { onSuccess: onDeleted });
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        載入中...
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <button
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          onClick={onBack}
        >
          ← 返回詳細頁
        </button>

        <h2 className="text-xl font-bold">編輯模板：{agentId}</h2>

        <div className="rounded-xl border border-border p-5 space-y-4">
          {/* Emoji */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Emoji</label>
            <input
              type="text"
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              className="w-20 rounded-lg border border-border bg-background px-3 py-2 text-sm text-center"
            />
          </div>

          {/* Color */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">顏色（Hex）</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border border-border bg-background"
              />
              <input
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-32 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="#888888"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
              rows={2}
            />
          </div>

          {/* AGENT.MD */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">AGENT.MD</label>
            <textarea
              value={agentMd}
              onChange={(e) => setAgentMd(e.target.value)}
              className="min-h-[200px] resize-y rounded-lg border border-border bg-background p-4 font-mono text-sm w-full focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* IDENTITY.MD */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">IDENTITY.MD</label>
            <textarea
              value={identityMd}
              onChange={(e) => setIdentityMd(e.target.value)}
              className="min-h-[200px] resize-y rounded-lg border border-border bg-background p-4 font-mono text-sm w-full focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* SOUL.MD */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">SOUL.MD</label>
            <textarea
              value={soulMd}
              onChange={(e) => setSoulMd(e.target.value)}
              className="min-h-[200px] resize-y rounded-lg border border-border bg-background p-4 font-mono text-sm w-full focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              onClick={handleSave}
              disabled={updateTemplate.isPending}
            >
              {updateTemplate.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              儲存
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 transition-colors"
              onClick={handleDelete}
              disabled={deleteTemplate.isPending}
            >
              {deleteTemplate.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              刪除
            </button>
          </div>

          {updateTemplate.isError && (
            <p className="text-xs text-destructive">儲存失敗，請重試。</p>
          )}
          {deleteTemplate.isError && (
            <p className="text-xs text-destructive">刪除失敗，請重試。</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────
type View =
  | { type: "grid" }
  | { type: "detail"; agent: MarketplaceAgent }
  | { type: "create" }
  | { type: "create-template" }
  | { type: "edit"; agentId: string };

export function AgentMarketTab({ onInstalled }: Props) {
  const { data, isLoading } = useMarketplaceAgents();
  const [view, setView] = useState<View>({ type: "grid" });

  const agents = data ?? [];

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        載入代理人市場...
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {view.type === "detail" ? (
        <DetailView
          agent={view.agent}
          onBack={() => setView({ type: "grid" })}
          onInstalled={onInstalled}
          onEdit={(agentId) => setView({ type: "edit", agentId })}
        />
      ) : view.type === "create" ? (
        <CreateAgentForm
          onBack={() => setView({ type: "grid" })}
          onCreated={onInstalled}
        />
      ) : view.type === "create-template" ? (
        <CreateTemplateForm
          onBack={() => setView({ type: "grid" })}
        />
      ) : view.type === "edit" ? (
        <EditTemplateForm
          agentId={view.agentId}
          onBack={() => {
            // Find the agent from the list to go back to detail view
            const agent = agents.find((a) => a.id === view.agentId);
            if (agent) {
              setView({ type: "detail", agent });
            } else {
              setView({ type: "grid" });
            }
          }}
          onSaved={() => {
            const agent = agents.find((a) => a.id === (view.type === "edit" ? view.agentId : ""));
            if (agent) {
              setView({ type: "detail", agent });
            } else {
              setView({ type: "grid" });
            }
          }}
          onDeleted={() => setView({ type: "grid" })}
        />
      ) : (
        <>
          {/* Header with buttons */}
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <h2 className="text-sm font-semibold">代理人市場</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setView({ type: "create-template" })}
                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                上架模板
              </button>
              <button
                onClick={() => setView({ type: "create" })}
                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                手動新增
              </button>
            </div>
          </div>
          <CardGrid agents={agents} onSelect={(a) => setView({ type: "detail", agent: a })} />
        </>
      )}
    </div>
  );
}
