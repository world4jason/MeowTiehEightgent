import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  useMarketplaceAgents,
  useMarketplaceAgentDetail,
  useInstallMarketplaceAgent,
  useModels,
} from "./useSettingsApi";
import type { MarketplaceAgent } from "../types";

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
        市場中沒有可用的模板
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
}

function DetailView({ agent, onBack, onInstalled }: DetailViewProps) {
  const { data: detail, isLoading: detailLoading } = useMarketplaceAgentDetail(agent.id);
  const { data: modelsData } = useModels();
  const installMutation = useInstallMarketplaceAgent();

  const [name, setName] = useState(agent.id);
  const [model, setModel] = useState<string>("");

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
          ← 返回市場
        </button>

        {/* Header */}
        <div className="flex items-center gap-3">
          <span className="text-4xl">{agent.emoji}</span>
          <div>
            <h2 className="text-xl font-bold" style={{ color: agent.color }}>
              {agent.id}
            </h2>
            <p className="text-sm text-muted-foreground">{agent.description}</p>
          </div>
          {agent.installed && <InstalledBadge />}
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
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="輸入 agent 名稱..."
            />
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
            disabled={installMutation.isPending || !name.trim()}
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

// ─── Main component ───────────────────────────────────────────
export function AgentMarketTab({ onInstalled }: Props) {
  const { data, isLoading } = useMarketplaceAgents();
  const [selected, setSelected] = useState<MarketplaceAgent | null>(null);

  const agents = data ?? [];

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        載入市場...
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {selected ? (
        <DetailView
          agent={selected}
          onBack={() => setSelected(null)}
          onInstalled={onInstalled}
        />
      ) : (
        <CardGrid agents={agents} onSelect={setSelected} />
      )}
    </div>
  );
}
