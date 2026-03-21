import { useState, useMemo } from "react";
import { Settings, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatSession, WorkspaceInfo } from "./types";
import { WorkspaceFolder } from "./WorkspaceFolder";
import { SessionItem } from "./SessionItem";

interface Props {
  workspaces: WorkspaceInfo[];
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onNewSessionInWorkspace: (workspaceId: string) => void;
  onRenameSession: (id: string, name: string) => void;
  onDeleteSession: (id: string) => void;
  onMoveSession: (id: string, workspaceId: string | null) => void;
  onOpenSettings: () => void;
}

export function SessionSidebar({
  workspaces, sessions, activeSessionId,
  onSelectSession, onNewSession, onNewSessionInWorkspace,
  onRenameSession, onDeleteSession, onMoveSession, onOpenSettings,
}: Props) {
  const [search, setSearch] = useState("");

  const { byWorkspace, standalone } = useMemo(() => {
    const filtered = search.trim()
      ? sessions.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
      : sessions;
    const byWorkspace: Record<string, ChatSession[]> = {};
    const standalone: ChatSession[] = [];
    for (const s of filtered) {
      if (s.workspaceId) {
        (byWorkspace[s.workspaceId] ??= []).push(s);
      } else {
        standalone.push(s);
      }
    }
    return { byWorkspace, standalone };
  }, [sessions, search]);

  return (
    <div className="flex h-full w-56 shrink-0 flex-col border-r border-border bg-sidebar">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3">
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground truncate">
          Workspaces
        </span>
      </div>

      {/* Search */}
      <div className="px-2 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sessions…"
            className="w-full rounded-md border border-border bg-muted py-1.5 pl-8 pr-2 text-xs text-foreground placeholder:text-muted-foreground outline-none"
          />
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-1.5 pb-2 flex flex-col gap-0.5">
        {workspaces.map((ws) => (
          <WorkspaceFolder
            key={ws.id}
            workspace={ws}
            sessions={byWorkspace[ws.id] ?? []}
            activeSessionId={activeSessionId}
            allWorkspaces={workspaces}
            onSelectSession={onSelectSession}
            onNewSession={onNewSessionInWorkspace}
            onRenameSession={onRenameSession}
            onDeleteSession={onDeleteSession}
            onMoveSession={onMoveSession}
          />
        ))}

        {standalone.length > 0 && (
          <div className={cn("flex flex-col gap-0.5", workspaces.length > 0 && "mt-2 border-t border-border pt-2")}>
            {standalone.map((s) => (
              <SessionItem
                key={s.id}
                session={s}
                active={s.id === activeSessionId}
                workspaces={workspaces}
                onSelect={onSelectSession}
                onRename={onRenameSession}
                onDelete={onDeleteSession}
                onMove={onMoveSession}
              />
            ))}
          </div>
        )}
      </div>

      {/* Dock */}
      <div className="flex items-center gap-1 border-t border-border px-2 py-2">
        <button
          onClick={onNewSession}
          className="flex-1 rounded-md bg-primary/10 px-2 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
        >
          + New Chat
        </button>
        <button
          aria-label="Settings"
          onClick={onOpenSettings}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
