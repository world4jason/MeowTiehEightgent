// ui/src/chat/hooks/useExport.ts
import { ChatMessage } from "../types";

export function useExport() {
  function exportMd(sessionName: string, messages: ChatMessage[]) {
    const md = `# ${sessionName}\n\n` + messages.map((m) =>
      `**${m.role === "user" ? "You" : m.agentName ?? "Agent"}:** ${m.content}`
    ).join("\n\n");
    download(`${sessionName}.md`, md, "text/markdown");
  }

  function exportJson(sessionName: string, messages: ChatMessage[]) {
    download(`${sessionName}.json`, JSON.stringify(messages, null, 2), "application/json");
  }

  function download(filename: string, content: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return { exportMd, exportJson };
}
