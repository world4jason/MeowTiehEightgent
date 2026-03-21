import { cn } from "@/lib/utils";
import { AgentInfo } from "./types";

interface AgentRun {
  agentName: string;
  tokens?: number;
  cost?: string;
}

interface Props {
  open: boolean;
  membersOpen: boolean;
  agents: AgentInfo[];
  runs: AgentRun[];
}

export function RunsPanel({ open, membersOpen, agents, runs }: Props) {
  const agentMap = Object.fromEntries(agents.map((a) => [a.name, a]));

  return (
    <div
      className={cn(
        "absolute top-0 bottom-0 flex shrink-0 flex-col overflow-hidden border-l border-border bg-panel transition-[width,right] duration-200 z-10",
      )}
      style={{
        width: open ? 260 : 0,
        right: membersOpen ? 220 : 0,
      }}
    >
      <div className="shrink-0 px-3.5 py-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Runs</span>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2 flex flex-col gap-3">
        {runs.map((r) => {
          const a = agentMap[r.agentName];
          return (
            <div key={r.agentName} className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: a?.color ?? "#888" }} />
                {r.agentName}
              </div>
              {r.tokens != null && (
                <div className="pl-3.5 text-xs text-muted-foreground">
                  {r.tokens.toLocaleString()} tokens
                  {r.cost && <span className="ml-1">· {r.cost}</span>}
                </div>
              )}
            </div>
          );
        })}
        {runs.length === 0 && (
          <p className="px-1 text-xs text-muted-foreground">No runs yet</p>
        )}
      </div>
    </div>
  );
}
