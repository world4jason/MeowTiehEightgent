# Mth — 專案概覽

> https://github.com/meowtieheightgent/paperclip
> 30k stars / 4.1k forks（2026-03-20）

---

## 定位

**AI 公司的操控平台（orchestration control plane）**

讓你用 AI agents 組建並運營一整家公司。

Tagline：*"If OpenClaw is an employee, Mth is the company."*

它**不是**：
- 聊天工具
- Agent 框架（不定義 agent 怎麼運作）
- Workflow builder（沒有拖拉介面）
- 單一 agent 工具

它**是**：
- 給 AI agents 的組織基礎設施：org chart、預算、任務、治理

---

## 解決的問題

當你有 20+ 個 AI coding agents 同時在跑，問題不是技術，是管理：
- 沒有組織結構（誰報告給誰？）
- 沒有預算控制（花了多少錢？）
- 沒有任務追蹤（做了什麼、做到哪？）
- 沒有治理機制（誰有權批准新的行動？）
- 沒有 audit trail（為什麼做這個決定？）

---

## Tech Stack

| 層 | 技術 |
|---|---|
| 語言 | TypeScript 96.3%，Shell 2% |
| 後端框架 | **Hono**（明確選 REST，不用 tRPC）|
| 前端 | React + Vite |
| 資料庫 | PostgreSQL / PGlite（dev 嵌入式，零設定）|
| ORM | Drizzle ORM |
| 認證 | Better Auth（Board 用 session，agents 用 hashed API key）|
| 即時通訊 | WebSocket（run output streaming）|
| 包管理 | pnpm 9.15+ / Node 20+ |
| 測試 | Vitest |
| Container | Docker（可選）|

Database schema：54 個 table。

---

## 核心設計原則（來自 SPEC.md）

1. **不干涉 agent 執行** — Mth 只協調，agents 愛在哪跑就在哪跑
2. **公司是最小組織單位** — 所有資源（agent、任務、預算、secret）company-scoped，嚴格隔離
3. **任務是唯一溝通媒介** — 沒有 chat、沒有 DM；所有協調都透過 task 創建和評論（每個決定都可追蹤）
4. **所有工作都追溯到目標** — Initiative → Project → Milestone → Issue → Sub-issue
5. **Board 永遠保有治理控制** — 人類永遠有控制面板，不會被鎖出去
6. **透明而非靜默自動化** — 卡住的任務顯示在儀表板，Mth 不自動修復
7. **單一任務執行者** — SQL 層原子 checkout，409 on conflict，防止兩個 agent 做同一件事
8. **Plugin 為擴充邊界** — 知識庫、artifact 管理、第三方整合全推給 plugin，核心保持精簡

---

## 關鍵架構不變量

- **原子任務 Checkout**：只有一個 agent 能持有一個 issue（SQL 層保證）
- **Company-scoped 邊界**：所有 route 強制 company access check，無跨公司洩漏
- **雙重認證模型**：Board operators 用 Better Auth session，agents 用 hashed API key bearer token
- **預算硬停**：100% 用量時新的 checkout 和 invocation 全部被阻塞
- **Config 版本控制**：adapter config 有 revision history，壞的變更可以回滾

---

## Heartbeat 協議

Mth 控制 *何時* 和 *如何* 喚醒 agents，agents 不主動 poll。

- Context payload 分兩種：`fat`（完整任務 + 預算 + 評論）或 `thin`（只有 ID + callback URL）
- Adapters 必須實作三個方法：`invoke()`、`status()`、`cancel()`
- Agent state 跨 heartbeat 週期持久化（不是 ephemeral）
- 優雅暫停：送終止信號 → grace period → 強制 kill → 未來 heartbeat 被阻塞

---

## 支援的 Agent Adapters

| Adapter | 說明 |
|---|---|
| `claude-local` | Claude Code CLI，`--output-format stream-json` |
| `gemini-local` | Gemini CLI，`--output-format stream-json` |
| `codex-local` | OpenAI Codex CLI，`exec --json` |
| `cursor-local` | Cursor IDE，解析其 stream-json |
| `opencode-local` | OpenCode（開源 coding agent）|
| `openclaw-gateway` | OpenClaw gateway（商業版）|
| `pi-local` | Pi（另一個 CLI agent）|
| `http` | HTTP webhook 調用 |
| `process` | 任意 child process |

---

## 部署模式

| 模式 | 適用 |
|---|---|
| `local_trusted` | 單人開發者，無 auth，只聽 loopback |
| `authenticated + private` | 小團隊，LAN/VPN/Tailscale |
| `authenticated + public` | 面向網際網路，多用戶 |

---

## ClipHub（模板市集）

類似 npm 的公司模板市集，export 時自動 scrub 所有 secrets 和 runtime state。

預建模板：
- Content Marketing Agency（8 agents）
- Crypto Trading Desk（12 agents）
- E-commerce Operator（10 agents）
- YouTube Factory（6 agents）
- Dev Agency（9 agents）
- Real Estate Leads（7 agents）
