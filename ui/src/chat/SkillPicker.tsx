import { cn } from "@/lib/utils";
import { SkillInfo } from "./types";

interface Props {
  skills: SkillInfo[];
  focusIdx: number;
  onSelect: (slug: string) => void;
}

export function SkillPicker({ skills, focusIdx, onSelect }: Props) {
  if (skills.length === 0) return null;
  return (
    <div
      role="listbox"
      aria-label="Skill picker"
      className="absolute bottom-full left-0 right-0 mb-1.5 overflow-hidden rounded-xl border border-border bg-popover shadow-lg z-50"
    >
      {skills.map((s, i) => (
        <div
          key={s.slug}
          role="option"
          aria-selected={i === focusIdx}
          onMouseDown={(e) => { e.preventDefault(); onSelect(s.slug); }}
          className={cn(
            "flex w-full flex-col gap-0.5 px-3.5 py-2.5 text-left transition-colors",
            i === focusIdx ? "bg-muted" : "hover:bg-muted/60",
          )}
        >
          <span className="text-sm font-semibold text-foreground"><span className="opacity-50">/</span><span>{s.name}</span></span>
          <span className="truncate text-xs text-muted-foreground">{s.description}</span>
        </div>
      ))}
    </div>
  );
}
