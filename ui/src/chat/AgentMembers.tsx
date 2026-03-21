import { AgentInfo } from "./types";

interface AgentMembersProps {
  agents: AgentInfo[];
  onModeChange?: (agentName: string, mode: "chat" | "think") => void;
}

export function AgentMembers({ agents, onModeChange }: AgentMembersProps) {
  if (agents.length === 0) return null;

  return (
    <div className="border-t border-border p-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">Members</p>
      <div className="space-y-1">
        {agents.map((agent) => (
          <div key={agent.name} className="flex items-center gap-2 rounded px-2 py-1 text-sm">
            <span>{agent.emoji}</span>
            <span className="flex-1 truncate" style={{ color: agent.color }}>
              {agent.name}
            </span>
            {agent.messageCount !== undefined && (
              <span className="text-xs text-muted-foreground">×{agent.messageCount}</span>
            )}
            {agent.supportsThinking && onModeChange && (
              <div className="flex gap-1">
                {(["chat", "think"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => onModeChange(agent.name, m)}
                    className={`rounded px-1.5 py-0.5 text-xs border transition-colors ${
                      (agent.mode ?? "chat") === m
                        ? "bg-muted border-border text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
