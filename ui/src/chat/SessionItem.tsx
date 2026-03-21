import { useState, useRef, useEffect } from "react";
import { Trash2, FolderInput } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatSession, WorkspaceInfo } from "./types";
import { SessionMoveDropdown } from "./SessionMoveDropdown";

interface Props {
  session: ChatSession;
  active: boolean;
  workspaces: WorkspaceInfo[];
  indent?: boolean;
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, workspaceId: string | null) => void;
}

export function SessionItem({ session, active, workspaces, indent, onSelect, onRename, onDelete, onMove }: Props) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(session.name);
  const [moveOpen, setMoveOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (renaming) inputRef.current?.select(); }, [renaming]);

  function commitRename() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== session.name) onRename(session.id, trimmed);
    setRenaming(false);
  }

  return (
    <div className={cn("group relative flex items-center gap-1 rounded-md", indent && "pl-6")}>
      {renaming ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") { setDraft(session.name); setRenaming(false); }
          }}
          className="flex-1 rounded border border-border bg-muted px-1.5 py-0.5 text-sm outline-none"
          aria-label={`Rename ${session.name}`}
        />
      ) : (
        <button
          aria-label={session.name}
          onClick={() => onSelect(session.id)}
          onDoubleClick={() => { setDraft(session.name); setRenaming(true); }}
          className={cn(
            "flex-1 truncate rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
            active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          )}
        >
          {session.name || "Untitled"}
        </button>
      )}

      {/* Hover-reveal actions */}
      {!renaming && (
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            aria-label="Delete session"
            onClick={(e) => { e.stopPropagation(); onDelete(session.id); }}
            className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <div className="relative">
            <button
              aria-label="Move session"
              onClick={(e) => { e.stopPropagation(); setMoveOpen((o) => !o); }}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <FolderInput className="h-3.5 w-3.5" />
            </button>
            {moveOpen && (
              <SessionMoveDropdown
                currentWorkspaceId={session.workspaceId ?? null}
                workspaces={workspaces}
                onSelect={(wid) => { onMove(session.id, wid); setMoveOpen(false); }}
                onClose={() => setMoveOpen(false)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
