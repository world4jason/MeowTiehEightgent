import { cn } from "@/lib/utils";

export interface SettingsAgent {
  name: string;
  emoji: string;
  color: string;
  model: string;
  enabled: boolean;
  source: "chat" | "cowork";
}

interface Props {
  chatAgents: SettingsAgent[];
  coworkAgents: SettingsAgent[];
  coworkOnline: boolean;
}

function SourceBadge({ source }: { source: "chat" | "cowork" }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        source === "chat"
          ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
      )}
    >
      {source === "chat" ? "Chat" : "Cowork"}
    </span>
  );
}

function AgentRow({ agent }: { agent: SettingsAgent }) {
  return (
    <div className="flex items-center gap-3 border-b border-border px-6 py-3 last:border-b-0">
      <span className="text-lg">{agent.emoji}</span>
      <span className={cn("flex-1 text-sm font-medium", !agent.enabled && "text-muted-foreground")}>
        {agent.name}
      </span>
      <span className={cn("text-xs", agent.enabled ? "text-green-600 dark:text-green-400" : "text-muted-foreground")}>
        {agent.enabled ? "enabled" : "disabled"}
      </span>
      <SourceBadge source={agent.source} />
    </div>
  );
}

export function ChatSettings({ chatAgents, coworkAgents, coworkOnline }: Props) {
  const allAgents = [...chatAgents, ...coworkAgents];

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-8">
      <h2 className="mb-6 text-lg font-semibold">Agents</h2>

      {allAgents.length === 0 ? (
        <p className="text-sm text-muted-foreground">No agents configured.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {allAgents.map((agent) => (
            <AgentRow key={`${agent.source}:${agent.name}`} agent={agent} />
          ))}
        </div>
      )}

      {!coworkOnline && coworkAgents.length === 0 && (
        <p className="mt-4 text-xs text-muted-foreground">Cowork offline — cowork agents unavailable</p>
      )}
    </div>
  );
}
