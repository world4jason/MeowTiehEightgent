interface Props {
  onInstalled: (agentName: string) => void;
}
export function AgentMarketTab({ onInstalled }: Props) {
  return <div className="p-6 text-sm text-muted-foreground">市場 — 開發中</div>;
}
