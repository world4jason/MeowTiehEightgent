import { ChatMode } from "../chat/types";
import type { ReactNode } from "react";

interface ModeToggleProps {
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  chatOnline: boolean;
  coworkOnline: boolean;
  settingsOnline: boolean;
  hasUnreadChat?: boolean;
  spaceOnline?: boolean;
}

export function ModeToggle({
  mode, onModeChange, chatOnline, coworkOnline, settingsOnline, hasUnreadChat, spaceOnline = true,
}: ModeToggleProps) {
  const btn = (m: ChatMode, label: string, offline: boolean, extra?: ReactNode) => (
    <button
      aria-pressed={mode === m}
      onClick={() => onModeChange(m)}
      className={`relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        mode === m
          ? "bg-background shadow-sm text-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
      {!offline && (
        <span
          data-testid={`${m}-offline`}
          className="h-1.5 w-1.5 rounded-full bg-destructive"
          title="Offline"
        />
      )}
      {extra}
    </button>
  );

  return (
    <div
      data-testid="mode-toggle"
      className="flex items-center gap-1 rounded-lg border border-border bg-muted p-1"
    >
      {btn("chat", "Chat", chatOnline,
        hasUnreadChat && mode !== "chat"
          ? <span data-testid="chat-unread-badge" className="h-1.5 w-1.5 rounded-full bg-primary" title="New message" />
          : undefined
      )}
      {btn("cowork", "Cowork", coworkOnline)}
      {btn("settings", "Settings", settingsOnline)}
      {btn("space", "Space", spaceOnline)}
    </div>
  );
}
