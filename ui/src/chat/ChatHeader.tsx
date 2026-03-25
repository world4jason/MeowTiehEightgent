import { Users, Activity, Radio } from "lucide-react";
import { AgentInfo } from "./types";
import { cn } from "@/lib/utils";

interface Props {
  agents: AgentInfo[];
  membersOpen: boolean;
  runsOpen: boolean;
  activityOpen?: boolean;
  onToggleMembers: () => void;
  onToggleRuns: () => void;
  onToggleActivity?: () => void;
  topic?: string;
}

export function ChatHeader({ agents, membersOpen, runsOpen, activityOpen, onToggleMembers, onToggleRuns, onToggleActivity, topic }: Props) {
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
      {/* Agent pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        {agents.map((a) => (
          <span
            key={a.name}
            className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-xs font-medium"
          >
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: a.color }}
            />
            {a.emoji} {a.name}
          </span>
        ))}
      </div>

      {/* Topic */}
      {topic && (
        <span className="text-sm text-muted-foreground truncate max-w-xs">{topic}</span>
      )}

      {/* Panel toggles */}
      <div className="flex items-center gap-1 shrink-0">
        {onToggleActivity && (
          <button
            aria-pressed={!!activityOpen}
            aria-label="Toggle activity feed"
            onClick={onToggleActivity}
            className={cn(
              "rounded-md p-1.5 text-muted-foreground transition-colors",
              activityOpen ? "bg-muted text-foreground" : "hover:bg-muted hover:text-foreground",
            )}
            title="Agent 動態"
          >
            <Radio className="h-4 w-4" />
          </button>
        )}
        <button
          aria-pressed={runsOpen}
          aria-label="Toggle runs panel"
          onClick={onToggleRuns}
          className={cn(
            "rounded-md p-1.5 text-muted-foreground transition-colors",
            runsOpen ? "bg-muted text-foreground" : "hover:bg-muted hover:text-foreground",
          )}
          title="Token runs"
        >
          <Activity className="h-4 w-4" />
        </button>
        <button
          aria-pressed={membersOpen}
          aria-label="Toggle members panel"
          onClick={onToggleMembers}
          className={cn(
            "rounded-md p-1.5 text-muted-foreground transition-colors",
            membersOpen ? "bg-muted text-foreground" : "hover:bg-muted hover:text-foreground",
          )}
          title="Members"
        >
          <Users className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
