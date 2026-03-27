import { useEffect, useRef, useState } from "react";
import { MarkdownBody } from "@/components/MarkdownBody";
import { ChatMessage } from "./types";
import { ImageLightbox } from "./ImageLightbox";

interface MessageListProps {
  messages: ChatMessage[];
}

function formatTime(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function MessageList({ messages }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function handleMessageAreaClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (target.tagName === "IMG") {
      const src = (target as HTMLImageElement).src;
      if (src) setLightboxSrc(src);
    }
  }

  return (
    <>
      <div
        className="flex-1 overflow-y-auto p-4 space-y-4"
        onClick={handleMessageAreaClick}
      >
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
            {msg.role === "agent" && (
              <span className="mt-1 text-xl leading-none">{msg.agentEmoji ?? "🤖"}</span>
            )}
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground"
              }`}
            >
              {msg.role === "agent" && msg.agentName && (
                <p className="mb-1 text-xs font-semibold flex items-center gap-1.5" style={{ color: msg.agentColor }}>
                  {msg.agentName}
                  {msg.mode === "think" && (
                    <span className="ml-1 text-xs" title="思考模式">🧠</span>
                  )}
                  {formatTime(msg.timestamp) && (
                    <span className="text-[10px] text-muted-foreground font-normal">
                      {formatTime(msg.timestamp)}
                    </span>
                  )}
                </p>
              )}
              {msg.thinking ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">思考中</span>
                  <span className="flex gap-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "300ms" }} />
                  </span>
                </div>
              ) : msg.role === "agent" ? (
                <MarkdownBody>{msg.content}</MarkdownBody>
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
              {msg.streaming && <span className="ml-1 animate-pulse">▌</span>}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}
    </>
  );
}
