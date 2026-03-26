import { useRef, useState, useCallback, useEffect } from "react";
import { Send, Hexagon, X, Square, CornerDownLeft } from "lucide-react";
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

interface TextAttachment {
  name: string;
  content: string;
  size: number;
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
  // P2-13: Message Queue
  onQueueMessage?: (text: string) => void;
  queueLength?: number;
}

export function ChatInputArea({ skills, agents, onSend, disabled, supportsImage = false, isStreaming = false, onStop, paused = false, onNext, autoMode, onToggleMode, rounds, onQueueMessage, queueLength = 0 }: Props) {
  const [text, setText] = useState("");
  const [textFiles, setTextFiles] = useState<TextAttachment[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const skill = useSkillPicker(skills);
  const agent = useAgentPicker(agents);
  const { images, attach, remove, clear } = useImageAttachment(supportsImage);

  // P2-12: Enter-to-Send Toggle — default true (Enter sends)
  const [enterToSend, setEnterToSend] = useState<boolean>(() => {
    try { const v = localStorage.getItem("enter-to-send"); return v === null ? true : v === "true"; } catch { return true; }
  });

  function toggleEnterToSend() {
    const next = !enterToSend;
    setEnterToSend(next);
    try { localStorage.setItem("enter-to-send", String(next)); } catch { /* ignore */ }
  }

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

  function buildFinalText(): string {
    let finalText = text.trim();
    // Prepend text file contents as code blocks
    if (textFiles.length > 0) {
      const blocks = textFiles.map((f) => `\`\`\`${f.name}\n${f.content}\n\`\`\``).join("\n");
      finalText = blocks + (finalText ? "\n" + finalText : "");
    }
    return finalText;
  }

  const sendingRef = useRef(false);
  function send() {
    if (sendingRef.current) return; // debounce
    const finalText = buildFinalText();
    if (!finalText && images.length === 0) return;

    // P2-13: Queue if streaming
    if (isStreaming && onQueueMessage) {
      onQueueMessage(finalText);
      setText("");
      setTextFiles([]);
      skill.close();
      agent.close();
      return;
    }

    sendingRef.current = true;
    onSend({ text: finalText, images: images.length > 0 ? images.map((i) => i.base64) : undefined });
    setText("");
    setTextFiles([]);
    clear();
    skill.close();
    agent.close();
    setTimeout(() => { sendingRef.current = false; }, 300);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (skill.onKeyDown(e, insertSkill)) return;
    if (agent.onKeyDown(e, insertAgent)) return;
    // P2-12: Enter-to-Send toggle logic
    if (enterToSend) {
      // Enter mode: Enter sends, Shift+Enter adds newline
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
    } else {
      // Manual mode (default): Shift+Enter sends, Enter adds newline
      if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); send(); }
    }
  }

  // P2-14: Handle file selection (image or text)
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    e.target.value = "";

    const isImage = f.type.startsWith("image/");
    if (isImage) {
      attach(f);
    } else {
      // Read as text
      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target?.result as string;
        setTextFiles((prev) => [...prev, { name: f.name, content, size: f.size }]);
      };
      reader.readAsText(f);
    }
  }

  function removeTextFile(idx: number) {
    setTextFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  // P2-15: Context-aware placeholder
  function getPlaceholder(): string {
    if (paused) return "按 Next → 繼續，或輸入訊息插話...";
    if (isStreaming) return "Agent 回應中，輸入的訊息將加入佇列...";
    if (autoMode === false) return "輸入訊息插話，或等待 Agent 完成...";
    return "輸入訊息...";
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

      {/* P2-13: Queue badge */}
      {queueLength > 0 && (
        <div className="px-1 py-1 text-xs text-amber-400">
          佇列中: {queueLength}
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

      {/* P2-14: Text file previews */}
      {textFiles.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {textFiles.map((f, i) => (
            <div key={i} className="flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-1 text-xs">
              <span className="max-w-[120px] truncate text-foreground">{f.name}</span>
              <span className="text-muted-foreground">({Math.round(f.size / 1024 * 10) / 10}KB)</span>
              <button
                aria-label={`Remove ${f.name}`}
                onClick={() => removeTextFile(i)}
                className="ml-1 rounded-full p-0.5 hover:bg-destructive hover:text-white"
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
              accept="image/*,.txt,.md,.json,.csv,.py,.js,.ts"
              className="hidden"
              onChange={handleFileChange}
            />
          </>
        )}

        <textarea
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
          placeholder={getPlaceholder()}
          aria-label="Message input"
          className={cn(
            "flex-1 resize-none rounded-xl border border-border bg-muted px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground",
            "max-h-40 overflow-y-auto",
            disabled && "opacity-50 cursor-not-allowed",
          )}
          style={{ fieldSizing: "content" } as React.CSSProperties}
        />

        {/* P2-12: Enter-to-Send toggle button */}
        <button
          aria-label="Toggle Enter to send"
          title={enterToSend ? "Enter 送出（點擊切換）" : "Shift+Enter 送出（點擊切換）"}
          onClick={toggleEnterToSend}
          className={cn(
            "shrink-0 rounded-md p-2 text-sm transition-colors",
            enterToSend
              ? "text-emerald-400 hover:bg-emerald-600/20"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <CornerDownLeft className="h-4 w-4" />
        </button>

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
            disabled={disabled || (!text.trim() && images.length === 0 && textFiles.length === 0)}
            className="shrink-0 rounded-xl bg-primary p-2.5 text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
