import { useState } from "react";
import { cn } from "@/lib/utils";
import { ModelsTab } from "./ModelsTab";
import { AdaptersTab } from "./AdaptersTab";
import { AgentsTab } from "./AgentsTab";
import { AgentMarketTab } from "./AgentMarketTab";
import { SkillsTab } from "./SkillsTab";
import { WorkspacesTab } from "./WorkspacesTab";
import { SoulTab } from "./SoulTab";
import { AboutTab } from "./AboutTab";
import { ScenariosTab } from "./ScenariosTab";

type SettingsTab = "models" | "adapters" | "agents" | "market" | "skills" | "scenarios" | "workspaces" | "soul" | "about";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "models", label: "模型" },
  { id: "adapters", label: "Adapters" },
  { id: "agents", label: "代理人" },
  { id: "market", label: "代理人市場" },
  { id: "skills", label: "技能" },
  { id: "scenarios", label: "情境模板" },
  { id: "workspaces", label: "工作區" },
  { id: "soul", label: "靈魂" },
  { id: "about", label: "關於" },
];

interface Props {
  coworkOnline: boolean;
}

export function SettingsShell({ coworkOnline }: Props) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("models");
  const [navigateToAgent, setNavigateToAgent] = useState<string | null>(null);

  function handleInstalled(agentName: string) {
    setNavigateToAgent(agentName);
    setActiveTab("agents");
  }

  return (
    <div className="flex h-full w-full">
      <nav className="flex w-[200px] min-w-[200px] flex-col gap-0.5 border-r border-border bg-muted/30 p-3">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "rounded-lg px-3 py-2 text-left text-sm transition-colors",
              activeTab === tab.id
                ? "bg-accent font-semibold text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      {/* Each tab handles its own overflow-y-auto */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "models" && <ModelsTab />}
        {activeTab === "adapters" && <AdaptersTab />}
        {activeTab === "agents" && (
          <AgentsTab initialAgent={navigateToAgent} onClearInitial={() => setNavigateToAgent(null)} />
        )}
        {activeTab === "market" && <AgentMarketTab onInstalled={handleInstalled} />}
        {activeTab === "skills" && <SkillsTab />}
        {activeTab === "scenarios" && <ScenariosTab />}
        {activeTab === "workspaces" && <WorkspacesTab />}
        {activeTab === "soul" && <SoulTab />}
        {activeTab === "about" && <AboutTab />}
      </div>
    </div>
  );
}
