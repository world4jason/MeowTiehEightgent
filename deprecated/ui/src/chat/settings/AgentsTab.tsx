import { useState, useEffect, useRef, useCallback } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useAgentDetail,
  useCreateAgent,
  useUpdateAgent,
  useModels,
  useAdapterPresets,
  useAgentMd,
  useUpdateAgentMd,
  useAgentIdentity,
  useUpdateAgentIdentity,
  useAgentSoul,
  useUpdateAgentSoul,
  useTestAgent,
  useCoworkAgents,
  type CoworkAgent,
} from "./useSettingsApi";
import { useAgentsList, useSkillsList } from "../hooks/useChatApi";
import type { AgentInfo, AdapterPresetInfo, ModelInfo, SkillInfo } from "../types";
import { isValidName } from "./utils";

const AGENT_ROLES = [
  { value: "", label: "-- 選擇角色 --" },
  { value: "general", label: "通用 (General)" },
  { value: "engineer", label: "工程師 (Engineer)" },
  { value: "designer", label: "設計師 (Designer)" },
  { value: "pm", label: "產品經理 (PM)" },
  { value: "qa", label: "品管 (QA)" },
  { value: "ceo", label: "CEO" },
  { value: "cto", label: "CTO" },
  { value: "cmo", label: "CMO" },
  { value: "cfo", label: "CFO" },
  { value: "researcher", label: "研究員 (Researcher)" },
  { value: "devops", label: "DevOps" },
];

// ─── Left-column agent item ──────────────────────────────────

interface AgentItemProps {
  agent: AgentInfo;
  selected: boolean;
  onClick: () => void;
}

function AgentItem({ agent, selected, onClick }: AgentItemProps) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer transition-colors ${
        selected ? "bg-accent" : "hover:bg-accent/50"
      }`}
      onClick={onClick}
    >
      <span className="text-lg leading-none">{agent.emoji || "🤖"}</span>
      <div className="flex-1 min-w-0">
        <div
          className="truncate text-sm font-bold"
          style={{ color: agent.color || undefined }}
        >
          {agent.name}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {agent.model}
        </div>
      </div>
      {agent.enabled && (
        <span className="h-2 w-2 rounded-full bg-green-500 flex-shrink-0" />
      )}
    </div>
  );
}

// ─── Cowork agent item (left column) ─────────────────────────

interface CoworkAgentItemProps {
  agent: CoworkAgent;
  selected: boolean;
  onClick: () => void;
}

function CoworkAgentItem({ agent, selected, onClick }: CoworkAgentItemProps) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer transition-colors ${
        selected ? "bg-accent" : "hover:bg-accent/50"
      }`}
      onClick={onClick}
    >
      <span className="text-lg leading-none">{agent.emoji || "🤖"}</span>
      <div className="flex-1 min-w-0">
        <div className="truncate text-sm font-bold">{agent.name}</div>
        <div className="truncate text-xs text-muted-foreground">{agent.model ?? agent.status}</div>
      </div>
      <span className="flex-shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
        Cowork
      </span>
    </div>
  );
}

// ─── Cowork agent read-only panel (right column) ──────────────

interface CoworkAgentPanelProps {
  agent: CoworkAgent;
}

function CoworkAgentPanel({ agent }: CoworkAgentPanelProps) {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <span className="text-3xl">{agent.emoji || "🤖"}</span>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold">{agent.name}</h2>
          <p className="text-xs text-muted-foreground">Cowork Agent（唯讀）</p>
        </div>
        <span
          className={`h-2 w-2 rounded-full flex-shrink-0 ${
            agent.status === "online" ? "bg-green-500" : "bg-muted-foreground"
          }`}
        />
      </div>

      <div className="rounded-xl border border-border p-4 space-y-2 text-sm">
        <div className="flex gap-3">
          <span className="w-16 text-xs font-semibold uppercase tracking-wide text-muted-foreground">狀態</span>
          <span>{agent.status}</span>
        </div>
        {agent.model && (
          <div className="flex gap-3">
            <span className="w-16 text-xs font-semibold uppercase tracking-wide text-muted-foreground">模型</span>
            <span>{agent.model}</span>
          </div>
        )}
        {agent.urlKey && (
          <div className="flex gap-3">
            <span className="w-16 text-xs font-semibold uppercase tracking-wide text-muted-foreground">URL Key</span>
            <span className="font-mono text-xs">{agent.urlKey}</span>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        此代理人由 Cowork 後端管理，無法在此編輯。
      </p>
    </div>
  );
}

// ─── Agent detail (right column) ─────────────────────────────

interface DetailProps {
  agentName: string;
  models: ModelInfo[];
  skills: SkillInfo[];
  adapterPresets: Record<string, AdapterPresetInfo>;
}

function AgentDetailView({ agentName, models, skills, adapterPresets }: DetailProps) {
  const { data: detail, isLoading: detailLoading } = useAgentDetail(agentName);
  const { data: agentMdData } = useAgentMd(agentName);
  const { data: identityData } = useAgentIdentity(agentName);
  const { data: soulData } = useAgentSoul(agentName);

  const updateAgent = useUpdateAgent();
  const updateAgentMd = useUpdateAgentMd();
  const updateIdentity = useUpdateAgentIdentity();
  const updateSoul = useUpdateAgentSoul();
  const testAgent = useTestAgent();

  // ── Form state ──
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("");
  const [model, setModel] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [supportsThinking, setSupportsThinking] = useState(false);
  const [thinkingModel, setThinkingModel] = useState("");
  // v1 fields
  const [role, setRole] = useState("");
  const [title, setTitle] = useState("");
  const [adapter, setAdapter] = useState("");

  const [agentMd, setAgentMd] = useState("");
  const [identity, setIdentity] = useState("");
  const [soul, setSoul] = useState("");

  // Track original MD values to detect changes
  const origAgentMd = useRef("");
  const origIdentity = useRef("");
  const origSoul = useRef("");

  // ── Save error state ──
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Test result state ──
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    response?: string;
    error?: string;
  } | null>(null);
  const testTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Reset form when detail data loads / agent changes ──
  useEffect(() => {
    if (detail) {
      setDescription(detail.description ?? "");
      setColor(detail.color ?? "");
      setModel(detail.model ?? "");
      setSelectedSkills(detail.skills ?? []);
      setSupportsThinking(detail.supports_thinking ?? false);
      setThinkingModel(detail.model_tiers?.thinking ?? "");
      // v1 fields
      setRole(detail.role ?? "");
      setTitle(detail.title ?? "");
      setAdapter(detail.adapter ?? "");
    }
  }, [agentName, detail]);

  useEffect(() => {
    const v = agentMdData?.content ?? "";
    setAgentMd(v);
    origAgentMd.current = v;
  }, [agentName, agentMdData]);

  useEffect(() => {
    const v = identityData?.content ?? "";
    setIdentity(v);
    origIdentity.current = v;
  }, [agentName, identityData]);

  useEffect(() => {
    const v = soulData?.content ?? "";
    setSoul(v);
    origSoul.current = v;
  }, [agentName, soulData]);

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      if (testTimerRef.current) clearTimeout(testTimerRef.current);
      if (saveErrorTimerRef.current) clearTimeout(saveErrorTimerRef.current);
    };
  }, []);

  // ── Handlers ──

  const handleToggleEnabled = useCallback(() => {
    if (!detail) return;
    updateAgent.mutate({ name: agentName, enabled: !detail.enabled });
  }, [detail, agentName, updateAgent]);

  const handleSave = useCallback(async () => {
    // Clear any previous error
    if (saveErrorTimerRef.current) clearTimeout(saveErrorTimerRef.current);
    setSaveError(null);

    try {
      // Save agent config
      await updateAgent.mutateAsync({
        name: agentName,
        description,
        color,
        model,
        skills: selectedSkills,
        supports_thinking: supportsThinking,
        model_tiers: thinkingModel
          ? { default: model, thinking: thinkingModel }
          : undefined,
        // v1 fields
        role: role || undefined,
        title: title || undefined,
        adapter: adapter || undefined,
      });

      // Save MD files only if changed
      const promises: Promise<unknown>[] = [];
      if (agentMd !== origAgentMd.current) {
        promises.push(updateAgentMd.mutateAsync({ name: agentName, content: agentMd }));
      }
      if (identity !== origIdentity.current) {
        promises.push(updateIdentity.mutateAsync({ name: agentName, content: identity }));
      }
      if (soul !== origSoul.current) {
        promises.push(updateSoul.mutateAsync({ name: agentName, content: soul }));
      }
      await Promise.all(promises);

      // Update refs so subsequent saves know the new baseline
      origAgentMd.current = agentMd;
      origIdentity.current = identity;
      origSoul.current = soul;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "儲存失敗，請重試";
      setSaveError(msg);
      saveErrorTimerRef.current = setTimeout(() => setSaveError(null), 5000);
    }
  }, [
    agentName, description, color, model, selectedSkills,
    supportsThinking, thinkingModel,
    role, title, adapter,
    agentMd, identity, soul,
    updateAgent, updateAgentMd, updateIdentity, updateSoul,
  ]);

  const handleTest = useCallback(() => {
    // Clear previous timer
    if (testTimerRef.current) clearTimeout(testTimerRef.current);
    setTestResult(null);

    testAgent.mutate(agentName, {
      onSuccess: (result) => {
        setTestResult(result);
        testTimerRef.current = setTimeout(() => setTestResult(null), 10000);
      },
      onError: (err) => {
        setTestResult({ ok: false, error: String(err) });
        testTimerRef.current = setTimeout(() => setTestResult(null), 10000);
      },
    });
  }, [agentName, testAgent]);

  const handleSkillToggle = useCallback((slug: string) => {
    setSelectedSkills((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    );
  }, []);

  if (detailLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        找不到代理人
      </div>
    );
  }

  const isSaving =
    updateAgent.isPending ||
    updateAgentMd.isPending ||
    updateIdentity.isPending ||
    updateSoul.isPending;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="text-3xl">{detail.emoji || "🤖"}</span>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold">{detail.name}</h2>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleToggleEnabled}
          disabled={updateAgent.isPending}
          className={
            detail.enabled
              ? "border-green-500 text-green-600 hover:bg-green-50"
              : "text-muted-foreground"
          }
        >
          {detail.enabled ? "啟用" : "停用"}
        </Button>
      </div>

      {/* Section: 基本設定 */}
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          基本設定
        </p>

        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            描述
          </label>
          <Input
            placeholder="代理人描述"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            顏色
          </label>
          <div className="flex items-center gap-2">
            {color && (
              <span
                className="inline-block h-3 w-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
              />
            )}
            <Input
              placeholder="#6366f1"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            角色
          </label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            {AGENT_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            職稱
          </label>
          <Input
            placeholder="例：資深前端工程師"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Adapter
          </label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={adapter}
            onChange={(e) => setAdapter(e.target.value)}
          >
            <option value="">-- 選擇 Adapter --</option>
            {Object.keys(adapterPresets).sort().map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground">
            選擇 Adapter 或使用下方模型欄位（向下相容）
          </p>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            模型
          </label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            <option value="">-- 選擇模型 --</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.emoji ?? "🤖"} {m.label ?? m.id}
              </option>
            ))}
          </select>
        </div>

        {/* Thinking mode */}
        <div className="space-y-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={supportsThinking}
              onChange={(e) => {
                setSupportsThinking(e.target.checked);
                if (!e.target.checked) setThinkingModel("");
              }}
            />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              支援思考模式
            </span>
          </label>
          {supportsThinking && (
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={thinkingModel}
              onChange={(e) => setThinkingModel(e.target.value)}
            >
              <option value="">-- 使用預設 (--effort max) --</option>
              {models
                .filter((m) => m.id !== model)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.emoji ?? "🤖"} {m.label ?? m.id}
                  </option>
                ))}
            </select>
          )}
        </div>
      </div>

      {/* Section: AGENT.MD */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          AGENT.MD
        </p>
        <textarea
          className="w-full min-h-[150px] resize-y rounded-lg border border-border bg-background p-4 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          value={agentMd}
          onChange={(e) => setAgentMd(e.target.value)}
        />
      </div>

      {/* Section: IDENTITY.MD */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          IDENTITY.MD
        </p>
        <textarea
          className="w-full min-h-[150px] resize-y rounded-lg border border-border bg-background p-4 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          value={identity}
          onChange={(e) => setIdentity(e.target.value)}
        />
      </div>

      {/* Section: SOUL.MD */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          SOUL.MD
        </p>
        <textarea
          className="w-full min-h-[150px] resize-y rounded-lg border border-border bg-background p-4 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          value={soul}
          onChange={(e) => setSoul(e.target.value)}
        />
      </div>

      {/* Section: 技能 */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          技能
        </p>
        {skills.length === 0 ? (
          <p className="text-xs text-muted-foreground">尚未安裝任何技能</p>
        ) : (
          <div className="space-y-1">
            {skills.map((skill) => (
              <label
                key={skill.slug}
                className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-accent/30 cursor-pointer"
              >
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={selectedSkills.includes(skill.slug)}
                  onChange={() => handleSkillToggle(skill.slug)}
                />
                <div className="min-w-0">
                  <span className="text-sm font-medium">{skill.name}</span>
                  <p className="text-xs text-muted-foreground truncate">
                    {skill.description}
                  </p>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Actions row */}
      <div className="flex items-center gap-2 pt-2">
        <Button
          className="bg-green-600 hover:bg-green-700 text-white"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          儲存
        </Button>

        <Button
          variant="outline"
          onClick={handleTest}
          disabled={testAgent.isPending}
        >
          {testAgent.isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          測試連線
        </Button>
      </div>

      {/* Save error */}
      {saveError && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
          {saveError}
        </div>
      )}

      {/* Test result */}
      {testResult && (
        <div
          className={`rounded-lg border px-4 py-2 text-sm ${
            testResult.ok
              ? "border-green-300 bg-green-50 text-green-700"
              : "border-red-300 bg-red-50 text-red-700"
          }`}
        >
          {testResult.ok
            ? testResult.response ?? "連線成功"
            : testResult.error ?? "連線失敗"}
        </div>
      )}
    </div>
  );
}

// ─── New agent form (right column) ───────────────────────────

interface NewFormProps {
  models: ModelInfo[];
  adapterPresets: Record<string, AdapterPresetInfo>;
  onCreated: (name: string) => void;
  onCancel: () => void;
}

type CreateStep = "choose" | "form";

function NewAgentForm({ models, adapterPresets, onCreated, onCancel }: NewFormProps) {
  const createAgent = useCreateAgent();
  const [step, setStep] = useState<CreateStep>("choose");
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🤖");
  const [model, setModel] = useState("");
  const [role, setRole] = useState("");
  const [title, setTitle] = useState("");
  const [adapter, setAdapter] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);

  const handleNameChange = (v: string) => {
    setName(v);
    if (v && !isValidName(v)) {
      setNameError("名稱不可包含 / \\ . 空格，最長 64 字元");
    } else {
      setNameError(null);
    }
  };

  const handleCreate = () => {
    if (!name.trim() || !isValidName(name.trim())) return;
    createAgent.mutate(
      {
        name: name.trim(),
        emoji: emoji || undefined,
        model: model || undefined,
        role: role || undefined,
        title: title || undefined,
        adapter: adapter || undefined,
      },
      { onSuccess: () => onCreated(name.trim()) }
    );
  };

  if (step === "choose") {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h2 className="text-base font-semibold">新增代理人</h2>
          <p className="text-xs text-muted-foreground">選擇建立方式</p>
        </div>

        <div className="space-y-3">
          {/* Fork from marketplace */}
          <div className="rounded-xl border border-border p-4">
            <p className="text-sm font-medium mb-1">從市場 Fork</p>
            <p className="text-xs text-muted-foreground">
              請切換至「市場」分頁瀏覽可用模板
            </p>
          </div>

          {/* Create from scratch */}
          <button
            className="w-full rounded-xl border border-border p-4 text-left transition-colors hover:bg-accent/30 cursor-pointer"
            onClick={() => setStep("form")}
          >
            <p className="text-sm font-medium mb-1">從零開始</p>
            <p className="text-xs text-muted-foreground">
              手動設定代理人的所有參數
            </p>
          </button>
        </div>

        <Button variant="ghost" onClick={onCancel}>
          取消
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-base font-semibold">從零開始</h2>
        <p className="text-xs text-muted-foreground">設定新代理人的基本資訊</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            名稱 <span className="text-destructive">*</span>
          </label>
          <Input
            placeholder="例：my-agent"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
          />
          {nameError && (
            <p className="text-[11px] text-destructive">{nameError}</p>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Emoji
          </label>
          <Input
            placeholder="🤖"
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            角色
          </label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            {AGENT_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            職稱
          </label>
          <Input
            placeholder="例：資深前端工程師"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Adapter
          </label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={adapter}
            onChange={(e) => setAdapter(e.target.value)}
          >
            <option value="">-- 選擇 Adapter --</option>
            {Object.keys(adapterPresets).sort().map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            模型
          </label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            <option value="">-- 選擇模型 --</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.emoji ?? "🤖"} {m.label ?? m.id}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-2">
        <Button
          className="bg-green-600 hover:bg-green-700 text-white"
          onClick={handleCreate}
          disabled={!name.trim() || !isValidName(name.trim()) || createAgent.isPending}
        >
          {createAgent.isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          建立
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          取消
        </Button>
      </div>
    </div>
  );
}

// ─── Main tab ─────────────────────────────────────────────────

interface Props {
  initialAgent?: string | null;
  onClearInitial?: () => void;
}

export function AgentsTab({ initialAgent, onClearInitial }: Props) {
  const { data: agents = [], isLoading } = useAgentsList();
  const { data: models = [] } = useModels();
  const { data: skills = [] } = useSkillsList();
  const { data: coworkAgents = [] } = useCoworkAgents();
  const { data: adapterPresetsMap = {} } = useAdapterPresets();

  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [selectedCoworkId, setSelectedCoworkId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Handle initialAgent prop (e.g. from marketplace install)
  useEffect(() => {
    if (initialAgent) {
      setSelectedAgent(initialAgent);
      setIsCreating(false);
      onClearInitial?.();
    }
  }, [initialAgent, onClearInitial]);

  // Auto-select first agent if none selected
  useEffect(() => {
    if (!isCreating && !selectedAgent && agents.length > 0) {
      setSelectedAgent(agents[0].name);
    }
  }, [agents, isCreating, selectedAgent]);

  const handleSelect = (name: string) => {
    setIsCreating(false);
    setSelectedAgent(name);
    setSelectedCoworkId(null);
  };

  const handleSelectCowork = (id: string) => {
    setIsCreating(false);
    setSelectedAgent(null);
    setSelectedCoworkId(id);
  };

  const handleNew = () => {
    setIsCreating(true);
    setSelectedAgent(null);
    setSelectedCoworkId(null);
  };

  const handleCreated = (name: string) => {
    setIsCreating(false);
    setSelectedAgent(name);
  };

  return (
    <div className="flex h-full">
      {/* Left column — Agent list */}
      <div className="w-[260px] min-w-[260px] overflow-y-auto border-r border-border p-4 flex flex-col gap-1">
        {isLoading ? (
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>載入中...</span>
          </div>
        ) : agents.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">
            尚未建立代理人
          </div>
        ) : (
          agents.map((a) => (
            <AgentItem
              key={a.name}
              agent={a}
              selected={!isCreating && selectedAgent === a.name}
              onClick={() => handleSelect(a.name)}
            />
          ))
        )}

        {/* Cowork agents */}
        {coworkAgents.length > 0 && (
          <>
            <div className="mt-4 mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Cowork
            </div>
            {coworkAgents.map((a) => (
              <CoworkAgentItem
                key={a.id}
                agent={a}
                selected={selectedCoworkId === a.id}
                onClick={() => handleSelectCowork(a.id)}
              />
            ))}
          </>
        )}

        {/* Add button */}
        <button
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          onClick={handleNew}
        >
          <Plus className="h-3.5 w-3.5" />
          新增代理人
        </button>
      </div>

      {/* Right column */}
      <div className="flex-1 overflow-y-auto p-6">
        {isCreating ? (
          <NewAgentForm
            models={models}
            adapterPresets={adapterPresetsMap}
            onCreated={handleCreated}
            onCancel={() => setIsCreating(false)}
          />
        ) : selectedAgent ? (
          <AgentDetailView
            key={selectedAgent}
            agentName={selectedAgent}
            models={models}
            skills={skills}
            adapterPresets={adapterPresetsMap}
          />
        ) : selectedCoworkId ? (
          (() => {
            const coworkAgent = coworkAgents.find((a) => a.id === selectedCoworkId);
            return coworkAgent ? (
              <CoworkAgentPanel agent={coworkAgent} />
            ) : null;
          })()
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            選擇左側代理人或新增一個
          </div>
        )}
      </div>
    </div>
  );
}
