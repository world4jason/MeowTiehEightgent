import { useState } from "react";
import { X, Plus, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { AgentInfo } from "./types";

interface Props {
  open: boolean;
  agents: AgentInfo[];
  availableAgents: AgentInfo[];
  onModeChange: (agentName: string, mode: "chat" | "think") => void;
  onAddAgent: (agentName: string) => void;
  onRemoveAgent: (agentName: string) => void;
  onClose: () => void;
}

export function MembersPanel({ open, agents, availableAgents, onModeChange, onAddAgent, onRemoveAgent, onClose }: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const activeNames = new Set(agents.map((a) => a.name));
  const addable = availableAgents.filter((a) => !activeNames.has(a.name));

  return (
    <div
      className={cn(
        "flex shrink-0 flex-col overflow-hidden border-l border-border bg-panel transition-[width] duration-200",
      )}
      style={{ width: open ? 220 : 0 }}
      aria-hidden={!open}
      inert={!open || undefined}
    >
      <div className="flex shrink-0 items-center justify-between px-3.5 py-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Members</span>
        <button
          aria-label="Close members panel"
          onClick={onClose}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {agents.map((a) => (
          <div key={a.name} className="flex items-center gap-2 px-3.5 py-2">
            <span className="text-base">{a.emoji}</span>
            <span className="flex-1 truncate text-sm font-medium">{a.name}</span>
            {/* chat/think toggle */}
            <div className="flex gap-0.5">
              <button
                aria-label="Chat mode"
                aria-pressed={!a.mode || a.mode === "chat"}
                onClick={() => onModeChange(a.name, "chat")}
                className={cn(
                  "rounded px-1.5 py-0.5 text-xs transition-colors",
                  (!a.mode || a.mode === "chat") ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                C
              </button>
              <button
                aria-label={a.supportsThinking === false ? "Think mode (not supported)" : "Think mode"}
                aria-pressed={a.mode === "think"}
                disabled={a.supportsThinking === false}
                onClick={() => onModeChange(a.name, "think")}
                className={cn(
                  "rounded px-1.5 py-0.5 text-xs transition-colors",
                  a.mode === "think" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                  a.supportsThinking === false && "opacity-30 cursor-not-allowed",
                )}
              >
                T
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add agent */}
      <div className="shrink-0 border-t border-border">
        <button
          onClick={() => setAddOpen((o) => !o)}
          className="flex w-full items-center gap-2 px-3.5 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add agent
          <ChevronDown className={cn("ml-auto h-3.5 w-3.5 transition-transform", addOpen && "rotate-180")} />
        </button>
        {addOpen && (
          addable.length === 0 ? (
            <p className="px-3.5 py-2 text-xs text-muted-foreground">No agents available</p>
          ) : (
            addable.map((a) => (
              <button
                key={a.name}
                onClick={() => { onAddAgent(a.name); setAddOpen(false); }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-foreground hover:bg-muted transition-colors"
              >
                <span>{a.emoji}</span>
                {a.name}
              </button>
            ))
          )
        )}
      </div>
    </div>
  );
}
