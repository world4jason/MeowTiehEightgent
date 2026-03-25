import { Activity } from "lucide-react";
import type { AgentControl } from "./types";

interface Props {
  agents: AgentControl[];
  open: boolean;
}

export function ActivityFeed({ agents, open }: Props) {
  if (!open) return null;
  return (
    <div className="w-64 border-l bg-background p-4 shrink-0 overflow-y-auto">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="h-4 w-4" />
        <span className="text-sm font-medium">Agent 動態</span>
      </div>
      <div className="space-y-3">
        {agents.map((agent) => (
          <div key={agent.agentId} className="flex items-center gap-2">
            <span>{agent.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{agent.name}</div>
              <div className="text-xs text-muted-foreground">
                {agent.status === "active" && "對話中..."}
                {agent.status === "paused" && "已暫停"}
                {agent.status === "idle" && "閒置"}
              </div>
            </div>
            <div className={`h-2 w-2 rounded-full shrink-0 ${
              agent.status === "active" ? "bg-green-500" :
              agent.status === "paused" ? "bg-yellow-500" : "bg-gray-300"
            }`} />
          </div>
        ))}
      </div>
    </div>
  );
}
