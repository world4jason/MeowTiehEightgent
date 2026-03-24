import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useModels, useGlobalConfig, useUpdateGlobalConfig } from "./useSettingsApi";

export function AboutTab() {
  const { data: config } = useGlobalConfig();
  const { data: modelsData } = useModels();
  const updateConfig = useUpdateGlobalConfig();

  const [summModel, setSummModel] = useState("");
  const [threshold, setThreshold] = useState(20);

  useEffect(() => {
    if (config) {
      setSummModel((config.summarization_model as string) ?? "");
      setThreshold((config.summary_trigger_threshold as number) ?? 20);
    }
  }, [config]);

  function handleSaveConfig() {
    updateConfig.mutate({
      summarization_model: summModel,
      summary_trigger_threshold: threshold,
    });
  }

  const models = modelsData ?? [];

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="mx-auto max-w-3xl space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-violet-400">MeowTiehEightgent</h1>
          <p className="mt-1 text-sm text-muted-foreground">多 Agent 協作對話平台</p>
        </div>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            這是什麼
          </h2>
          <p className="text-sm leading-relaxed">
            讓多個 AI 代理人在同一個對話室裡輪流發言、互相回應的平台。你可以隨時打斷、引導話題，或是直接 @mention 指定發言順序。
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            核心功能
          </h2>
          <ul className="space-y-2 text-sm">
            <li>🤝 多 Agent 輪流發言 — Claude、Gemini、Codex 同室對話</li>
            <li>⚡ 隨時打斷 — 任何時刻可插話重設輪次</li>
            <li>🐾 三層個性系統 — AGENT.md / IDENTITY.md / SOUL.md</li>
            <li>📁 工作區 — 依專案整理對話，注入不同 system prompt</li>
            <li>🔧 技能系統 — /skill 語法快速注入指令</li>
            <li>🖼️ 圖片輸入 — 支援多圖上傳（對應 agent 能力自動判斷）</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            技術架構
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            FastAPI + React，WebSocket streaming，CLI subprocess 包裝，Phase 0 穩定層（crash recovery、history sliding window、protected paths）
          </p>
        </section>

        <section className="space-y-4 border-t pt-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            全域設定
          </p>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              歷史壓縮模型
            </label>
            {!summModel && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
                請選擇一個模型以啟用歷史壓縮功能
              </div>
            )}
            <select
              value={summModel}
              onChange={(e) => setSummModel(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <option value="">-- 未啟用 --</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.emoji ? `${m.emoji} ` : ""}{m.label ?? m.id}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              壓縮觸發閾值（訊息數）
            </label>
            <Input
              type="number"
              min={1}
              max={100}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-32"
            />
          </div>

          <Button
            onClick={handleSaveConfig}
            disabled={updateConfig.isPending}
            size="sm"
          >
            {updateConfig.isPending ? "儲存中…" : "儲存全域設定"}
          </Button>

          {updateConfig.isSuccess && (
            <p className="text-xs text-green-600">已儲存</p>
          )}
          {updateConfig.isError && (
            <p className="text-xs text-red-500">儲存失敗，請再試一次</p>
          )}
        </section>
      </div>
    </div>
  );
}
