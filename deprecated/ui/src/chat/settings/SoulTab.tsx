import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useDefaultAgentMd,
  useUpdateDefaultAgentMd,
  useDefaultIdentity,
  useUpdateDefaultIdentity,
  useDefaultSoul,
  useUpdateDefaultSoul,
  useUserMd,
  useUpdateUserMd,
} from "./useSettingsApi";

type CardId = "agentMd" | "identity" | "soul" | "userMd";

interface CardDef {
  id: CardId;
  emoji: string;
  title: string;
  subtitle: string;
  description: string;
}

const CARDS: CardDef[] = [
  {
    id: "agentMd",
    emoji: "🤖",
    title: "AGENT.md",
    subtitle: "行為指令",
    description:
      "每個新代理人的基礎行為規範。定義角色職責、工作流程與回應風格。",
  },
  {
    id: "identity",
    emoji: "🪪",
    title: "IDENTITY.md",
    subtitle: "身份設定",
    description:
      "代理人的基本身份：名字、背景、個性特質。讓 AI 知道「我是誰」。",
  },
  {
    id: "soul",
    emoji: "✨",
    title: "SOUL.md",
    subtitle: "靈魂個性",
    description:
      "更深層的價值觀與思考風格。決定代理人如何思考、表達，以及與人互動的氣質。",
  },
  {
    id: "userMd",
    emoji: "👤",
    title: "USER.md",
    subtitle: "關於你自己",
    description:
      "告訴代理人你是誰、你的背景和偏好。每個代理人都會在對話前讀取這份文件。",
  },
];

function useCardData(id: CardId) {
  const agentMd = useDefaultAgentMd();
  const identity = useDefaultIdentity();
  const soul = useDefaultSoul();
  const userMd = useUserMd();

  const map = { agentMd, identity, soul, userMd };
  return map[id];
}

function useCardMutation(id: CardId) {
  const updateAgentMd = useUpdateDefaultAgentMd();
  const updateIdentity = useUpdateDefaultIdentity();
  const updateSoul = useUpdateDefaultSoul();
  const updateUserMd = useUpdateUserMd();

  const map = { agentMd: updateAgentMd, identity: updateIdentity, soul: updateSoul, userMd: updateUserMd };
  return map[id];
}

interface EditViewProps {
  card: CardDef;
  initialContent: string;
  onBack: () => void;
}

function EditView({ card, initialContent, onBack }: EditViewProps) {
  const [value, setValue] = useState(initialContent);
  const mutation = useCardMutation(card.id);

  const handleSave = () => {
    mutation.mutate({ content: value });
  };

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-4 flex items-center gap-3">
        <span className="text-2xl">{card.emoji}</span>
        <div className="flex-1">
          <h2 className="text-base font-semibold">{card.title}</h2>
          <p className="text-xs text-muted-foreground">{card.subtitle}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← 返回
        </Button>
      </div>
      <textarea
        className="flex-1 resize-none rounded-lg border border-border bg-background p-4 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <div className="mt-4 flex justify-end">
        <Button onClick={handleSave} disabled={mutation.isPending}>
          {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          儲存
        </Button>
      </div>
    </div>
  );
}

interface CardProps {
  card: CardDef;
  onClick: () => void;
}

function TemplateCard({ card, onClick }: CardProps) {
  const { data, isLoading } = useCardData(card.id);
  const content = data?.content ?? "";

  return (
    <button
      className="rounded-xl border border-border bg-card p-5 text-left transition-colors hover:bg-accent/30"
      onClick={onClick}
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xl">{card.emoji}</span>
        <span className="font-semibold text-sm">{card.title}</span>
      </div>
      <p className="mb-3 text-xs font-medium text-muted-foreground">{card.subtitle}</p>
      <p className="mb-3 text-xs text-muted-foreground">{card.description}</p>
      {isLoading ? (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>載入中…</span>
        </div>
      ) : (
        <pre className="overflow-hidden rounded-md bg-muted/40 p-3 text-xs text-muted-foreground line-clamp-4 whitespace-pre-wrap">
          {content || "(空白)"}
        </pre>
      )}
    </button>
  );
}

export function SoulTab() {
  const [editing, setEditing] = useState<CardId | null>(null);

  const activeCard = editing ? CARDS.find((c) => c.id === editing) : null;
  const activeData = useCardData(editing ?? "agentMd");

  if (activeCard) {
    return (
      <div className="flex-1 overflow-y-auto">
        <EditView
          card={activeCard}
          initialContent={activeData.data?.content ?? ""}
          onBack={() => setEditing(null)}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="mx-auto max-w-3xl grid grid-cols-2 gap-4">
        {CARDS.map((card) => (
          <TemplateCard key={card.id} card={card} onClick={() => setEditing(card.id)} />
        ))}
      </div>
      <p className="mx-auto mt-6 max-w-3xl text-xs text-muted-foreground">
        點選卡片即可編輯。新建代理人時會從這裡複製內容，{"{name}"} 會被替換成代理人名稱
      </p>
    </div>
  );
}
