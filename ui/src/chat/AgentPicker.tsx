import { cn } from "@/lib/utils";
import { AgentInfo } from "./types";

interface Props {
  agents: AgentInfo[];
  focusIdx: number;
  onSelect: (name: string) => void;
}

export function AgentPicker({ agents, focusIdx, onSelect }: Props) {
  if (agents.length === 0) return null;
  return (
    <div
      role="listbox"
      aria-label="Agent picker"
      className="absolute bottom-full left-0 right-0 mb-1.5 overflow-hidden rounded-xl border border-border bg-popover shadow-lg z-50"
    >
      {agents.map((a, i) => (
        <div
          key={a.name}
          role="option"
          aria-selected={i === focusIdx}
          onMouseDown={(e) => { e.preventDefault(); onSelect(a.name); }}
          className={cn(
            "flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors",
            i === focusIdx ? "bg-muted" : "hover:bg-muted/60",
          )}
        >
          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
          <span className="text-sm font-medium"><span>{a.emoji}</span> <span>{a.name}</span></span>
        </div>
      ))}
    </div>
  );
}
