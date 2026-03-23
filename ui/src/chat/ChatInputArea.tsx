import { useRef, useState, useCallback } from "react";
import { Send, Hexagon, X, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { AgentInfo, SkillInfo } from "./types";
import { SkillPicker } from "./SkillPicker";
import { AgentPicker } from "./AgentPicker";
import { useSkillPicker } from "./hooks/useSkillPicker";
import { useAgentPicker } from "./hooks/useAgentPicker";
import { useImageAttachment } from "./hooks/useImageAttachment";

export interface SendPayload {
  text: string;
  images?: string[]; // base64
}

interface Props {
  skills: SkillInfo[];
  agents: AgentInfo[];
  onSend: (payload: SendPayload) => void;
  disabled: boolean;
  supportsImage?: boolean;
  isStreaming?: boolean;
  onStop?: () => void;
  paused?: boolean;
  onNext?: () => void;
  autoMode?: boolean;
  onToggleMode?: () => void;
  rounds?: number;
}

export function ChatInputArea({ skills, agents, onSend, disabled, supportsImage = false, isStreaming = false, onStop, paused = false, onNext, autoMode, onToggleMode, rounds }: Props) {
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const skill = useSkillPicker(skills);
  const agent = useAgentPicker(agents);
  const { images, attach, remove, clear } = useImageAttachment(supportsImage);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    setText(v);
    skill.check(v);
    agent.check(v);
  }

  const insertSkill = useCallback((slug: string) => {
    setText((t) => t.replace(/\/\S*$/, `/${slug} `));
    skill.close();
  }, [skill.close]);

  const insertAgent = useCallback((name: string) => {
    setText((t) => t.replace(/@\S*$/, `@${name} `));
    agent.close();
  }, [agent.close]);

  function send() {
    const trimmed = text.trim();
    if (!trimmed && images.length === 0) return;
    onSend({ text: trimmed, images: images.length > 0 ? images.map((i) => i.base64) : undefined });
    setText("");
    clear();
    skill.close();
    agent.close();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (skill.onKeyDown(e, insertSkill)) return;
    if (agent.onKeyDown(e, insertAgent)) return;
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  return (
    <div className="shrink-0 border-t border-border p-3">
      {/* Mode indicator */}
      {autoMode !== undefined && (
        <div className="flex items-center gap-2 px-1 py-1.5 text-xs text-muted-foreground">
          <button
            aria-label={autoMode ? "Auto" : "Manual"}
            onClick={onToggleMode}
            className={cn(
              "rounded px-2 py-0.5 font-medium transition-colors",
              autoMode ? "bg-emerald-600/20 text-emerald-400" : "bg-amber-600/20 text-amber-400"
            )}
          >
            {autoMode ? "Auto" : "Manual"}
          </button>
          {!autoMode && rounds !== undefined && (
            <span className="text-muted-foreground">每 {rounds} 輪暫停</span>
          )}
        </div>
      )}

      {/* Image previews */}
      {images.length > 0 && (
        <div className="mb-2 flex gap-2">
          {images.map((img, i) => (
            <div key={img.preview} className="relative h-16 w-16">
              <img src={img.preview} className="h-full w-full rounded-md object-cover" alt="attachment" />
              <button
                aria-label="Remove attachment"
                onClick={() => remove(i)}
                className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-white"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="relative flex items-end gap-2">
        {/* Skill picker */}
        {skill.open && (
          <SkillPicker skills={skill.filtered} focusIdx={skill.focusIdx} onSelect={insertSkill} />
        )}
        {/* Agent picker — only show when skill picker is not active */}
        {agent.open && !skill.open && (
          <AgentPicker agents={agent.filtered} focusIdx={agent.focusIdx} onSelect={insertAgent} />
        )}

        {supportsImage && (
          <>
            <button
              aria-label="Attach image"
              onClick={() => fileRef.current?.click()}
              className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Hexagon className="h-4 w-4" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) attach(f); e.target.value = ""; }}
            />
          </>
        )}

        <textarea
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
          placeholder="Message…"
          aria-label="Message input"
          className={cn(
            "flex-1 resize-none rounded-xl border border-border bg-muted px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground",
            "max-h-40 overflow-y-auto",
            disabled && "opacity-50 cursor-not-allowed",
          )}
          style={{ fieldSizing: "content" } as React.CSSProperties}
        />

        {paused ? (
          <button
            aria-label="Next"
            onClick={onNext}
            className="flex items-center gap-1.5 shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
          >
            Next →
          </button>
        ) : isStreaming ? (
          <button
            aria-label="Stop"
            onClick={onStop}
            className="shrink-0 rounded-xl bg-destructive p-2.5 text-destructive-foreground transition-colors hover:bg-destructive/90"
          >
            <Square className="h-4 w-4" />
          </button>
        ) : (
          <button
            aria-label="Send message"
            onClick={send}
            disabled={disabled || (!text.trim() && images.length === 0)}
            className="shrink-0 rounded-xl bg-primary p-2.5 text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
