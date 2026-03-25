import { useState } from "react";
import { Pause, Play, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AgentControl } from "./types";

interface Props {
  agents: AgentControl[];
  onPause: (agentId: string) => void;
  onResume: (agentId: string) => void;
  onRedirect: (agentId: string, instruction: string) => void;
}

export function AgentControlBar({ agents, onPause, onResume, onRedirect }: Props) {
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [instruction, setInstruction] = useState("");

  const activeOrPaused = agents.filter((a) => a.status === "active" || a.status === "paused");
  if (activeOrPaused.length === 0) return null;

  const pausedAgents = agents.filter((a) => a.status === "paused");
  const hasPaused = pausedAgents.length > 0;

  // Default selected agent to first paused one if not yet set
  const effectiveSelected = selectedAgentId || pausedAgents[0]?.agentId || "";

  function handleSend() {
    if (!effectiveSelected || !instruction.trim()) return;
    onRedirect(effectiveSelected, instruction.trim());
    setInstruction("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleSend();
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border bg-background/80 px-4 py-2 backdrop-blur-sm">
      {/* Agent toggle buttons */}
      <div className="flex flex-wrap gap-2">
        {activeOrPaused.map((agent) => (
          <Button
            key={agent.agentId}
            variant="ghost"
            size="sm"
            onClick={() => {
              if (agent.status === "active") {
                onPause(agent.agentId);
              } else {
                onResume(agent.agentId);
              }
            }}
            className="flex items-center gap-1.5 text-xs"
          >
            <span>{agent.emoji}</span>
            <span>{agent.name}</span>
            {agent.status === "active" ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
          </Button>
        ))}
      </div>

      {/* Redirect section — only shown when there are paused agents */}
      {hasPaused && (
        <div className="flex items-center gap-2">
          <select
            value={effectiveSelected}
            onChange={(e) => setSelectedAgentId(e.target.value)}
            className="h-8 rounded-md border border-input bg-transparent px-2 text-xs text-foreground focus:outline-none focus-visible:border-ring"
          >
            {pausedAgents.map((a) => (
              <option key={a.agentId} value={a.agentId}>
                {a.emoji} {a.name}
              </option>
            ))}
          </select>
          <Input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="重新指派新指令..."
            className="h-8 flex-1 text-xs"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSend}
            disabled={!instruction.trim()}
            aria-label="送出指令"
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
