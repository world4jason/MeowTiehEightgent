import { useEffect, useRef } from "react";
import { WorkspaceInfo } from "./types";

interface Props {
  currentWorkspaceId: string | null;
  workspaces: WorkspaceInfo[];
  onSelect: (workspaceId: string | null) => void;
  onClose: () => void;
}

export function SessionMoveDropdown({ currentWorkspaceId, workspaces, onSelect, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full z-50 mt-1 min-w-[160px] rounded-lg border border-border bg-popover shadow-lg overflow-hidden"
    >
      {currentWorkspaceId && (
        <button
          className="w-full px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted transition-colors"
          onClick={() => onSelect(null)}
        >
          Remove from workspace
        </button>
      )}
      {workspaces.map((ws) => (
        <button
          key={ws.id}
          disabled={ws.id === currentWorkspaceId}
          aria-current={ws.id === currentWorkspaceId ? "true" : undefined}
          className="w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={() => onSelect(ws.id)}
        >
          {ws.name}
        </button>
      ))}
    </div>
  );
}
