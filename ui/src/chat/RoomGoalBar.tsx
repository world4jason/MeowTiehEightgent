import { useState, useRef, useEffect } from "react";
import { Target, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  goal: string;
  onSetGoal: (goal: string) => void;
}

export function RoomGoalBar({ goal, onSetGoal }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(goal);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync draft when goal prop changes externally
  useEffect(() => {
    if (!editing) setDraft(goal);
  }, [goal, editing]);

  function startEdit() {
    setDraft(goal);
    setEditing(true);
  }

  function save() {
    onSetGoal(draft.trim());
    setEditing(false);
  }

  function cancel() {
    setDraft(goal);
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") save();
    if (e.key === "Escape") cancel();
  }

  // Focus input when edit mode activates
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-accent/10 px-4 py-1.5">
      <Target className="h-4 w-4 shrink-0 text-muted-foreground" />

      {editing ? (
        <>
          <Input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="輸入討論目標..."
            className="h-7 flex-1 text-sm"
          />
          <Button variant="ghost" size="icon-xs" onClick={save} aria-label="確認">
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon-xs" onClick={cancel} aria-label="取消">
            <X className="h-3.5 w-3.5" />
          </Button>
        </>
      ) : (
        <>
          <span
            className="flex-1 cursor-pointer text-sm text-foreground/80 hover:text-foreground transition-colors"
            onClick={startEdit}
            title="點擊編輯目標"
          >
            {goal || (
              <span className="text-muted-foreground">點擊設定討論目標...</span>
            )}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={startEdit}
            aria-label="編輯目標"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
    </div>
  );
}
