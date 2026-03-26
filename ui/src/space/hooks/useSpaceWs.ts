import { useCallback } from "react";
import { useSpace } from "../SpaceContext";
import type { AgentPosition } from "../types";

export function useSpaceWs(
  engineRef: React.MutableRefObject<{ updateAgentStatus: (name: string, status: AgentPosition["status"], task?: string) => void; showAgentNotification: (name: string, text: string) => void } | null>,
) {
  const { agentPositions, setAgentPositions } = useSpace();

  const handleAgentStatus = useCallback(
    (agentName: string, status: "idle" | "chatting" | "working") => {
      setAgentPositions(
        agentPositions.map((a) =>
          a.name === agentName ? { ...a, status } : a,
        ),
      );
      engineRef.current?.updateAgentStatus(agentName, status);
    },
    [agentPositions, setAgentPositions, engineRef],
  );

  const handleCoworkUpdate = useCallback(
    (event: string, issueId: string, title: string, agentName?: string) => {
      if (!agentName) return;
      const emoji =
        event === "issue_created" ? "💡" : event === "issue_completed" ? "✅" : "📝";
      const text = `${emoji} ${title}`;
      engineRef.current?.showAgentNotification(agentName, text);
    },
    [engineRef],
  );

  return { handleAgentStatus, handleCoworkUpdate };
}
