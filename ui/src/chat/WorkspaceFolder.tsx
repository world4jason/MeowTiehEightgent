import { useState } from "react";
import { ChevronRight, ChevronDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatSession, WorkspaceInfo } from "./types";
import { SessionItem } from "./SessionItem";

interface Props {
  workspace: WorkspaceInfo;
  sessions: ChatSession[];
  activeSessionId: string | null;
  allWorkspaces: WorkspaceInfo[];
  onSelectSession: (id: string) => void;
  onNewSession: (workspaceId: string) => void;
  onRenameSession: (id: string, name: string) => void;
  onDeleteSession: (id: string) => void;
  onMoveSession: (id: string, workspaceId: string | null) => void;
}

export function WorkspaceFolder({
  workspace, sessions, activeSessionId, allWorkspaces,
  onSelectSession, onNewSession, onRenameSession, onDeleteSession, onMoveSession,
}: Props) {
  const [open, setOpen] = useState(false);
  const Icon = open ? ChevronDown : ChevronRight;

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
      >
        <Icon className="h-3 w-3 shrink-0" />
        <span className="truncate">{workspace.name}</span>
      </button>
      {open && (
        <div className="pb-1">
          {sessions.map((s) => (
            <SessionItem
              key={s.id}
              session={s}
              active={s.id === activeSessionId}
              workspaces={allWorkspaces}
              indent
              onSelect={onSelectSession}
              onRename={onRenameSession}
              onDelete={onDeleteSession}
              onMove={onMoveSession}
            />
          ))}
          <button
            onClick={() => onNewSession(workspace.id)}
            className="flex w-full items-center gap-1.5 rounded-md py-1 pl-6 pr-2 text-xs text-muted-foreground hover:bg-muted/60 hover:text-primary transition-colors"
          >
            <Plus className="h-3 w-3" />
            New Session
          </button>
        </div>
      )}
    </div>
  );
}
