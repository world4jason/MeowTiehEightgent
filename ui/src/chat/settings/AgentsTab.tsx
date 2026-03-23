interface Props {
  initialAgent?: string | null;
  onClearInitial?: () => void;
}
export function AgentsTab({ initialAgent, onClearInitial }: Props) {
  return <div className="p-6 text-sm text-muted-foreground">代理人 — 開發中</div>;
}
