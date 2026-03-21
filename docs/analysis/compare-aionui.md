# 比較報告：AionUi vs Agent CLI Conversation

> https://github.com/iOfficeAI/AionUi
> 撰寫時間：2026-03-17

---

## AionUi 是什麼

**定位：** CLI Agent 集線器 + 跨平台桌面 App + IM Bot 平台

AionUi 是一個 Electron 桌面應用，把現有的 CLI agent 工具（claude CLI、gemini CLI、qwen code、codex、goose、kimi 等）包裝起來，透過統一 GUI 操作。同時支援 Telegram / Lark / DingTalk 作為訊息入口，讓 CLI agent 也能在 IM 平台上服務使用者。

### Tech Stack

| 層 | 技術 |
|----|------|
| 前端 | React 19 + Arco Design + TypeScript |
| 桌面 | Electron（macOS / Windows / Linux）|
| 後端 | Node.js 22 + SQLite |
| 套件管理 | Bun |
| LLM 接入 | 包裝 CLI 工具；另有 Anthropic / OpenAI / Gemini SDK 用於直接 API call |
| 測試 | Vitest + Playwright |

### 核心架構

```
Renderer Process (React UI)
        ↓ IPC Bridge
Main Process (Electron/Node.js)
  ├─ WorkerManage.ts        ← 管理 CLI 行程
  ├─ Channels Framework     ← Telegram/Lark/DingTalk 整合
  ├─ LLM Adapter            ← Anthropic/OpenAI/Gemini rotating client
  └─ SQLite                 ← 對話、session、plugin 持久化
```

### AionUi 的「多 agent」

**每個 conversation tab = 一個 agent，互相獨立。**

```
Tab 1: [Claude Code]  ← 使用者輸入 → Claude 回應
Tab 2: [Qwen Code]    ← 使用者輸入 → Qwen 回應
Tab 3: [Gemini CLI]   ← 使用者輸入 → Gemini 回應
```

Agent 之間完全不知道彼此的存在，不會看到對方說什麼。

---

## 與你的專案比較

### 根本設計差異

| 面向 | AionUi | 你的專案 |
|------|--------|---------|
| 多 agent 模型 | 多個獨立 tab，agent 各自回應使用者 | N 個 agent 在同一個聊天室輪流對話，互相看到彼此發言 |
| 人類的角色 | 「使用者」——跟每個 agent 分別對話 | 「主持人」——在 N 個 agent 的討論中隨時介入導向 |
| 部署方式 | Electron 桌面 App + 可選 WebUI mode | 輕量 uvicorn server，browser 開即用 |
| 儲存 | SQLite（結構化） | JSON 檔案（簡單） |
| 前端技術 | React + TypeScript + Arco Design | Vanilla JS + CSS |
| LLM 接入 | CLI wrapper + 直接 API SDK | CLI subprocess + Ollama HTTP API |

### AionUi 有、你沒有

| 功能 | 說明 |
|------|------|
| **Streaming 回應** | Token by token 輸出，不用等整段完成 |
| **IM 整合** | Telegram、Lark、DingTalk 可以直接 bot 互動 |
| **WebUI remote mode** | `--webui --remote` 讓手機 / 平板 / Android Termux 透過瀏覽器訪問 |
| **文件處理** | Word、Excel、PowerPoint、PDF 直接餵給 agent |
| **排程任務（Cron）** | 定時觸發 agent 執行任務 |
| **多 CLI agent 支援** | claude、gemini、qwen、codex、goose、kimi、opencode... 自動偵測 |
| **Extension 系統** | 動態載入外掛，有 sandbox 隔離 |
| **SQLite 持久化** | 支援複雜查詢、plugin/session 管理 |
| **多語言 UI** | 英、繁、簡、日、韓 |

### 你有、AionUi 沒有

| 功能 | 說明 |
|------|------|
| **多 agent 同室討論** | N 個 agent 共享 history_text，互相讀到對方的發言 |
| **Human-as-moderator** | 任何時刻打斷輪次、轉換話題、注入技能 |
| **Agent 個性系統** | AGENT.md + IDENTITY.md + SOUL.md 三層角色定義，agent 有「靈魂」 |
| **每日記憶** | 跨 session 自動記錄，agent 有積累感 |
| **/skill 語法** | 對話中途插入 skill 內容，改變所有 agent 行為 |
| **Marketplace 模板** | 廚師、哲學家、心理學家...一鍵安裝，支援改名 + 選模型 |
| **Auto / Manual 節奏** | Auto：agent 自由討論；Manual：人類控制何時繼續 |
| **Session 下載** | 匯出 JSON、Markdown、PDF |
| **Ollama Pull** | UI 裡直接拉模型，SSE 進度流 |

### 兩邊都有

- Session 歷史 / Resume
- 預設 agent 模板（marketplace 概念）
- 技能系統
- 多 LLM 供應商支援
- 黑暗模式 UI
- WebSocket 即時通訊

---

## 結論

AionUi 和你的專案服務的是**完全不同的場景**：

- **AionUi** = 「我想用 claude CLI 完成一個任務，但不想開 terminal」
- **你的專案** = 「我想讓財務專家、哲學家、心理學家三個 AI 一起討論這個問題」

兩者不是直接競品。AionUi 的使用者不太會需要你的功能；你的使用者也不需要 AionUi 的 IM 整合或文件處理。

如果要從 AionUi 借鑑，最值得的是 **Streaming 回應**（UX 最痛點）和 **WebUI remote mode 思路**（讓手機也能用）。
