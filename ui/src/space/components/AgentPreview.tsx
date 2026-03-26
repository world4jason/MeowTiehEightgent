import type { AgentPosition } from "../types";

interface AgentPreviewProps {
  agent: AgentPosition;
  onInteract: () => void;
}

export function AgentPreview({ agent, onInteract }: AgentPreviewProps) {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 rounded-lg border border-border bg-background/95 px-4 py-3 shadow-lg backdrop-blur">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{agent.emoji}</span>
        <div>
          <p className="font-medium text-sm">{agent.name}</p>
          <p className="text-xs text-muted-foreground">
            {agent.status === "idle" && "閒置中"}
            {agent.status === "chatting" && "對話中"}
            {agent.status === "working" && `處理中${agent.currentTask ? `: ${agent.currentTask}` : ""}`}
          </p>
        </div>
        <button
          onClick={onInteract}
          className="ml-4 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          對話 (Enter)
        </button>
      </div>
    </div>
  );
}
