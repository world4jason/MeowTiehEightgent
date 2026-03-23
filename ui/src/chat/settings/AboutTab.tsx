export function AboutTab() {
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
      </div>
    </div>
  );
}
