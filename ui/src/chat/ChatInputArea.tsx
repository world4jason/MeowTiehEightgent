import { useRef, useState, useCallback } from "react";
import { Send, Paperclip, X } from "lucide-react";
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
}

export function ChatInputArea({ skills, agents, onSend, disabled, supportsImage = false }: Props) {
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
              <Paperclip className="h-4 w-4" />
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

        <button
          aria-label="Send message"
          onClick={send}
          disabled={disabled || (!text.trim() && images.length === 0)}
          className="shrink-0 rounded-xl bg-primary p-2.5 text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
