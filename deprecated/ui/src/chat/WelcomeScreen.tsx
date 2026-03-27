import { useState } from "react";
import { cn } from "@/lib/utils";
import { AgentInfo, ScenarioInfo, WorkspaceInfo } from "./types";

interface Props {
  agents: AgentInfo[];
  scenarios: ScenarioInfo[];
  workspaces: WorkspaceInfo[];
  onStartSession: (config: {
    agents: string[];
    systemPrompt?: string;
    topic?: string;
    workspaceId?: string;
  }) => void;
  onSelectAgents: (agents: string[]) => void;
  autoMode?: boolean;
  onAutoModeChange?: (auto: boolean) => void;
  rounds?: number;
  onRoundsChange?: (rounds: number) => void;
}

export function WelcomeScreen({ agents, scenarios, workspaces, onStartSession, onSelectAgents, autoMode, onAutoModeChange, rounds, onRoundsChange }: Props) {
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(
    new Set(agents.filter((a) => a.enabled).map((a) => a.name))
  );
  const [contextMode, setContextMode] = useState<"workspace" | "scenario" | "blank">("scenario");
  const [selectedWorkspace, setSelectedWorkspace] = useState<string | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<ScenarioInfo | null>(null);
  const [topic, setTopic] = useState("");
  const [silence, setSilence] = useState(false);

  function toggleAgent(name: string) {
    setSelectedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      onSelectAgents([...next]);
      return next;
    });
  }

  function handleStart() {
    let systemPrompt: string | undefined;
    let workspaceId: string | undefined;

    if (contextMode === "scenario" && selectedScenario) {
      systemPrompt = selectedScenario.systemPrompt;
    } else if (contextMode === "workspace" && selectedWorkspace) {
      workspaceId = selectedWorkspace;
    }

    onStartSession({
      agents: [...selectedAgents],
      systemPrompt,
      topic: topic.trim() || undefined,
      workspaceId,
    });
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      {/* Title */}
      <div className="text-center">
        <h2 className="text-2xl font-bold" style={{ color: "#7c3aed" }}>MeowTiehEightgent</h2>
        <p className="mt-1 text-sm text-muted-foreground">Pick agents and start chatting, or choose a context.</p>
      </div>

      {/* Agent chips */}
      <div className="flex flex-wrap justify-center gap-2">
        {agents.map((a) => (
          <button
            key={a.name}
            aria-label={`Toggle ${a.name}`}
            aria-pressed={selectedAgents.has(a.name)}
            onClick={() => toggleAgent(a.name)}
            className={cn(
              "flex items-center gap-2 rounded-full border-2 px-3.5 py-1.5 text-sm font-medium transition-all",
              selectedAgents.has(a.name)
                ? "border-transparent text-white"
                : "border-border bg-transparent text-muted-foreground hover:border-border/80",
            )}
            style={selectedAgents.has(a.name) ? { backgroundColor: a.color, borderColor: a.color } : {}}
          >
            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
            {a.emoji} {a.name}
          </button>
        ))}
      </div>

      {/* Auto/Manual mode + silence checkbox */}
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-4">
          {autoMode !== undefined && (
            <div className="flex items-center gap-2 rounded-lg border border-border p-1">
              <button
                aria-label="Auto"
                onClick={() => onAutoModeChange?.(true)}
                className={cn(
                  "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                  autoMode ? "bg-emerald-600 text-white" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Auto
              </button>
              <button
                aria-label="Manual"
                onClick={() => onAutoModeChange?.(false)}
                className={cn(
                  "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                  !autoMode ? "bg-amber-600 text-white" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Manual
              </button>
            </div>
          )}
          {/* Silence checkbox */}
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={silence}
              onChange={(e) => setSilence(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            機率性沈默
          </label>
        </div>
        {autoMode !== undefined && !autoMode && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>每</span>
            <input
              type="number"
              min={1}
              max={20}
              value={rounds ?? 2}
              onChange={(e) => onRoundsChange?.(Math.max(1, Math.min(20, Number(e.target.value))))}
              className="w-16 rounded border border-border bg-muted px-2 py-1 text-center text-foreground"
            />
            <span>輪暫停</span>
          </div>
        )}
      </div>

      {/* Context mode tabs */}
      <div className="w-full max-w-2xl">
        <div className="flex items-center gap-1 rounded-lg border border-border p-1 w-fit mx-auto mb-4">
          {(["workspace", "scenario", "blank"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setContextMode(mode)}
              className={cn(
                "rounded-md px-4 py-1.5 text-sm font-medium transition-colors capitalize",
                contextMode === mode
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {mode === "workspace" ? "Workspace" : mode === "scenario" ? "Scenario" : "Blank"}
            </button>
          ))}
        </div>

        {/* Content area */}
        {contextMode === "scenario" && (
          <>
            {scenarios.length > 0 ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {scenarios.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      const next = selectedScenario?.id === s.id ? null : s;
                      setSelectedScenario(next);
                      if (next) {
                        // Merge scenario's suggested agents into selection
                        setSelectedAgents((prev) => {
                          const merged = new Set(prev);
                          for (const name of next.agents) merged.add(name);
                          onSelectAgents([...merged]);
                          return merged;
                        });
                      }
                    }}
                    className={cn(
                      "rounded-xl border p-4 text-left transition-colors hover:bg-muted",
                      selectedScenario?.id === s.id
                        ? "border-primary bg-muted"
                        : "border-border"
                    )}
                  >
                    <p className="font-semibold text-sm">{s.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{s.description}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {s.agents.map((name) => {
                        const a = agents.find((ag) => ag.name === name);
                        return a ? (
                          <span key={name} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground border border-border">
                            {a.emoji} {name}
                          </span>
                        ) : null;
                      })}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-center text-sm text-muted-foreground">沒有可用的情境</p>
            )}
          </>
        )}

        {contextMode === "workspace" && (
          <>
            {workspaces.length > 0 ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {workspaces.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => setSelectedWorkspace(w.id)}
                    className={cn(
                      "rounded-xl border border-border p-4 text-left transition-colors hover:bg-muted",
                      selectedWorkspace === w.id && "border-primary bg-muted"
                    )}
                  >
                    <p className="font-semibold text-sm">{w.name}</p>
                    {w.sessionCount !== undefined && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{w.sessionCount} 個對話</p>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-center text-sm text-muted-foreground">沒有可用的工作區</p>
            )}
          </>
        )}

        {contextMode === "blank" && (
          <p className="text-center text-sm text-muted-foreground py-6">開始一個空白對話</p>
        )}
      </div>

      {/* Topic input */}
      <div className="w-full max-w-2xl">
        <textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder={selectedScenario?.topicHint || "輸入討論主題..."}
          rows={2}
          className="w-full rounded-xl border border-border bg-muted px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      {/* Start button */}
      <button
        onClick={handleStart}
        className="rounded-xl bg-primary px-8 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        開始對話 →
      </button>
    </div>
  );
}
