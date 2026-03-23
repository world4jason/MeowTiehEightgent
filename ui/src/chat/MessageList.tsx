import { useEffect, useRef } from "react";
import { MarkdownBody } from "@/components/MarkdownBody";
import { ChatMessage } from "./types";

interface MessageListProps {
  messages: ChatMessage[];
}

export function MessageList({ messages }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
              <p className="mb-1 text-xs font-semibold" style={{ color: msg.agentColor }}>
                {msg.agentName}
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
  );
}
