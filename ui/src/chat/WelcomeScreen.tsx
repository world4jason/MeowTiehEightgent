import { useState } from "react";
import { cn } from "@/lib/utils";
import { AgentInfo, ScenarioInfo } from "./types";

interface Props {
  agents: AgentInfo[];
  scenarios: ScenarioInfo[];
  onStartSession: (scenario: Pick<ScenarioInfo, "agents" | "systemPrompt">) => void;
  onSelectAgents: (agents: string[]) => void;
  autoMode?: boolean;
  onAutoModeChange?: (auto: boolean) => void;
  rounds?: number;
  onRoundsChange?: (rounds: number) => void;
}

export function WelcomeScreen({ agents, scenarios, onStartSession, onSelectAgents, autoMode, onAutoModeChange, rounds, onRoundsChange }: Props) {
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(
    new Set(agents.filter((a) => a.enabled).map((a) => a.name))
  );

  function toggleAgent(name: string) {
    setSelectedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      onSelectAgents([...next]);
      return next;
    });
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h2 className="text-xl font-semibold">Start a conversation</h2>
        <p className="mt-1 text-sm text-muted-foreground">Pick agents and start chatting, or choose a scenario.</p>
      </div>

      {/* Auto/Manual mode selection */}
      {autoMode !== undefined && (
        <div className="flex flex-col items-center gap-3">
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
          {!autoMode && (
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
      )}

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

      {/* Scenario cards */}
      {scenarios.length > 0 && (
        <div className="w-full max-w-2xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scenarios</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {scenarios.map((s) => (
              <button
                key={s.id}
                onClick={() => onStartSession({ agents: s.agents, systemPrompt: s.systemPrompt })}
                className="rounded-xl border border-border p-4 text-left transition-colors hover:bg-muted"
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
        </div>
      )}
    </div>
  );
}
