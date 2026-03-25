import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ─── Create mode ─────────────────────────────────────────────

interface CreateData {
  title: string;
  description: string;
  assigneeId: string;
}

interface CreateModeProps {
  mode: "create";
  defaultTitle?: string;
  defaultDescription?: string;
  agents: { id: string; name: string; emoji: string }[];
  onConfirm: (data: CreateData) => void;
  onCancel: () => void;
}

// ─── Created mode ────────────────────────────────────────────

interface CreatedModeProps {
  mode: "created";
  issueId: string;
  title: string;
  assignee?: string;
}

type IssueCardProps = CreateModeProps | CreatedModeProps;

// ─── Component ───────────────────────────────────────────────

export function IssueCard(props: IssueCardProps) {
  if (props.mode === "created") {
    return <CreatedCard {...props} />;
  }
  return <CreateCard {...props} />;
}

// ─── Create form ─────────────────────────────────────────────

function CreateCard({ defaultTitle = "", defaultDescription = "", agents, onConfirm, onCancel }: CreateModeProps) {
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState(defaultDescription);
  const [assigneeId, setAssigneeId] = useState(agents[0]?.id ?? "");

  function handleConfirm() {
    if (!title.trim()) return;
    onConfirm({ title: title.trim(), description: description.trim(), assigneeId });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleConfirm();
    if (e.key === "Escape") onCancel();
  }

  return (
    <div
      className="rounded-lg border border-border bg-background p-3 shadow-sm space-y-2 text-sm"
      onKeyDown={handleKeyDown}
    >
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">建立 Issue</p>

      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Issue 標題"
        className="h-8 text-sm"
        autoFocus
      />

      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="描述（選填）"
        rows={3}
        className="w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] resize-none"
      />

      {agents.length > 0 && (
        <select
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
          className="w-full h-8 rounded-md border border-input bg-transparent px-2 text-sm text-foreground focus:outline-none focus-visible:border-ring"
        >
          <option value="">— 不指派 —</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.emoji} {a.name}
            </option>
          ))}
        </select>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          取消
        </Button>
        <Button size="sm" onClick={handleConfirm} disabled={!title.trim()}>
          確認建立
        </Button>
      </div>
    </div>
  );
}

// ─── Created confirmation ─────────────────────────────────────

function CreatedCard({ issueId, title, assignee }: CreatedModeProps) {
  return (
    <div className="rounded-lg border border-border bg-background p-3 shadow-sm text-sm space-y-1">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Issue 已建立</p>
      <p className="font-medium text-foreground">{title}</p>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="font-mono">#{issueId}</span>
        {assignee && <span>指派給 {assignee}</span>}
      </div>
    </div>
  );
}
