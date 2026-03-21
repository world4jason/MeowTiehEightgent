import { ChatMode } from "../chat/types";

interface ModeToggleProps {
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  chatOnline: boolean;
  coworkOnline: boolean;
  hasUnreadChat?: boolean;
}

export function ModeToggle({ mode, onModeChange, chatOnline, coworkOnline, hasUnreadChat }: ModeToggleProps) {
  return (
    <div data-testid="mode-toggle" className="flex items-center gap-1 rounded-lg border border-border bg-muted p-1">
      <button
        aria-pressed={mode === "chat"}
        onClick={() => onModeChange("chat")}
        className={`relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
          mode === "chat" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Chat
        {!chatOnline && (
          <span data-testid="chat-offline" className="h-1.5 w-1.5 rounded-full bg-destructive" title="Offline" />
        )}
        {hasUnreadChat && mode !== "chat" && (
          <span data-testid="chat-unread-badge" className="h-1.5 w-1.5 rounded-full bg-primary" title="New message" />
        )}
      </button>
      <button
        aria-pressed={mode === "cowork"}
        onClick={() => onModeChange("cowork")}
        className={`relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
          mode === "cowork" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Cowork
        {!coworkOnline && (
          <span data-testid="cowork-offline" className="h-1.5 w-1.5 rounded-full bg-destructive" title="Offline" />
        )}
      </button>
    </div>
  );
}
