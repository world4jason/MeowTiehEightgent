import { useState, useRef, useEffect } from "react";
import { Trash2, FolderInput, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatSession, WorkspaceInfo } from "./types";
import { SessionMoveDropdown } from "./SessionMoveDropdown";

const CHAT_URL = import.meta.env.VITE_CHAT_URL ?? "http://localhost:8000";

async function downloadSession(e: React.MouseEvent, sessionId: string, sessionName: string) {
  e.stopPropagation();
  const fmt = window.prompt("Download format: json or md", "md");
  if (!fmt) return;
  const msgs = await fetch(`${CHAT_URL}/sessions/${sessionId}`).then((r) => r.json()).catch(() => []);
  const slug = sessionName.slice(0, 20).replace(/[^a-z0-9]/gi, "-") || sessionId.slice(0, 8);
  if (fmt === "json") {
    const blob = new Blob([JSON.stringify(msgs, null, 2)], { type: "application/json" });
    triggerDownload(blob, `session-${slug}.json`);
  } else {
    const lines: string[] = [];
    for (const m of msgs as Record<string, unknown>[]) {
      if (m.type === "system") { lines.push(`# ${m.text ?? ""}`, ""); }
      else if (m.type === "message" || m.role === "agent") {
        const ts = m.timestamp ? `  \`${String(m.timestamp).slice(0, 16).replace("T", " ")}\`` : "";
        lines.push(`**${m.agent ?? "Agent"}**${ts}`, "", String(m.text ?? m.content ?? ""), "", "---", "");
      } else if (m.type === "user" || m.role === "user") {
        lines.push(`**You**`, "", String(m.text ?? m.content ?? ""), "", "---", "");
      }
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    triggerDownload(blob, `session-${slug}.md`);
  }
}

function triggerDownload(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

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
  const [draft, setDraft] = useState("");
  const [moveOpen, setMoveOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const committingRef = useRef(false);

  useEffect(() => { if (renaming) inputRef.current?.select(); }, [renaming]);

  // Sync draft when session.name changes while not in rename mode
  useEffect(() => {
    if (!renaming) setDraft(session.name);
  }, [session.name, renaming]);

  function commitRename() {
    if (committingRef.current) return;
    committingRef.current = true;
    const trimmed = draft.trim();
    if (trimmed && trimmed !== session.name) onRename(session.id, trimmed);
    setDraft(session.name); // reset draft on any exit (including empty-string abort)
    setRenaming(false);
    committingRef.current = false;
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
            if (e.key === "Enter") { e.preventDefault(); commitRename(); }
            if (e.key === "Escape") { committingRef.current = true; setDraft(session.name); setRenaming(false); committingRef.current = false; }
          }}
          className="flex-1 rounded border border-border bg-muted px-1.5 py-0.5 text-sm outline-none"
          aria-label={`Rename ${session.name || "Untitled"}`}
        />
      ) : (
        <button
          aria-label={session.name || "Untitled"}
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
            aria-label="Download session"
            onClick={(e) => downloadSession(e, session.id, session.name)}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
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
