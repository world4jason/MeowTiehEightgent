import { ChatSession } from "./types";

interface SessionSidebarProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
}

export function SessionSidebar({
  sessions, activeSessionId, onSelectSession, onNewSession
}: SessionSidebarProps) {
  return (
    <div className="flex h-full w-56 flex-col border-r border-border bg-sidebar">
      <div className="p-3">
        <button
          onClick={onNewSession}
          className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          + New Chat
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {sessions.map((session) => (
          <button
            key={session.id}
            onClick={() => onSelectSession(session.id)}
            className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${
              session.id === activeSessionId ? "bg-muted font-medium" : "text-muted-foreground"
            }`}
          >
            <p className="truncate">{session.name || "Untitled"}</p>
            {session.preview && (
              <p className="truncate text-xs text-muted-foreground">{session.preview}</p>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
