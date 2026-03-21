# 比較報告：LibreChat vs Agent CLI Conversation

> https://github.com/danny-avila/LibreChat
> 撰寫時間：2026-03-17
> ⚠️ 本報告已查證，修正其他 LLM 對 LibreChat 的部分誤述（見下方說明）

---

## LibreChat 是什麼

**定位：** 開源的 ChatGPT/Poe 替代品，支援多 LLM 供應商的統一 Web 介面

LibreChat 解決的是「我想用各種 AI，但不想被 ChatGPT 鎖定，也不想把資料送到雲端」的問題。它提供一個可以自架的 Web UI，支援幾乎所有主流 LLM 供應商，並內建 agent 建構器、工具、code interpreter 等功能。

### Tech Stack

| 層 | 技術 |
|----|------|
| 語言 | TypeScript 70% + JavaScript 30% |
| 前端 | React |
| 後端 | Node.js API server |
| 資料庫 | MongoDB（對話、訊息、agent、用戶持久化）|
| 部署 | Docker，支援自架 |
| Stars | 34,700+（2026-03）|
| 授權 | MIT |

### 核心功能

- **多 LLM 供應商**：OpenAI、Anthropic Claude、Google Gemini、AWS Bedrock、Azure、Groq、DeepSeek、Ollama...
- **No-code agent 建構器**：圖形介面建立自訂 AI agent
- **Code interpreter**：沙盒執行 Python、Node.js、Go、C/C++、Java、PHP、Rust、Fortran
- **Web 搜尋**：Tavily、Google Search + 重排序
- **圖片生成**：DALL-E 3、Stable Diffusion、Flux
- **Generative UI**：React、HTML、Mermaid artifacts
- **多模態**：圖片上傳/分析、語音輸入輸出（TTS/STT）
- **30+ 語言 UI**

---

## ⚠️ 查證：其他 LLM 對 LibreChat 的三個誤述

### 誤述 1：「2026 年強化多代理協作」
**❌ 誤導性描述。** 2026 roadmap 確實提到 subagents、background agents，但這是強化**單一 agent 的能力**，不是讓多個 agent 在同一個聊天室裡互相對話。LibreChat 仍然是「一個對話一個 agent」的模型。

### 誤述 2：「Agent Gateway 是 LibreChat 的功能」
**❌ 張冠李戴。** Agent Gateway 是 agentgateway.dev 的**獨立產品**，不是 LibreChat 內建功能。LibreChat 可以整合 Agent Gateway，但兩者是不同的專案。

### 誤述 3：「對話分支讓你隨時切換當前說話的人」
**❌ 描述錯誤。** LibreChat 的 conversation branching 是**訊息樹分叉**（像 ChatGPT 的 edit + 新分支），讓你從某個時間點探索不同的對話走向。這不是多個 agent 在同一個 thread 裡輪流說話。

---

## LibreChat 的「多 agent」實際上是什麼

**一個對話 = 一個 agent，使用者自己決定切換哪個。**

```
Conversation 1: [Claude Sonnet] ← 使用者輸入 → Claude 回應
Conversation 2: [GPT-4o]       ← 使用者輸入 → GPT-4o 回應
（可以在設定裡換 endpoint，但一次一個）
```

LibreChat 的 conversation branching：
```
使用者: 請分析這個問題
  AI: 回答 A
  ↓ 使用者 fork 到這裡
  ├─ 分支 1: 繼續追問方向 X
  └─ 分支 2: 繼續追問方向 Y
```
這是探索不同對話路徑，不是多個 AI 互相對話。

---

## 與你的專案比較

### 根本設計差異

| 面向 | LibreChat | 你的專案 |
|------|-----------|---------|
| 核心定位 | ChatGPT 替代品，支援多供應商 | 多 agent 即時討論室 |
| 多 agent 模型 | 一個對話一個 agent，使用者手動切換 | N 個 agent 輪流說話，互相看到彼此發言 |
| 人類角色 | 使用者——和 AI 一對一對話 | 主持人——在 N 個 AI 的討論中導向 |
| 部署 | Docker，自架，稍有門檻 | uvicorn，輕量 |
| 儲存 | MongoDB | JSON 檔案 |
| 用戶管理 | ✅ 多用戶、OAuth2、LDAP | ❌ 單人使用 |

### LibreChat 有、你沒有

| 功能 | 說明 |
|------|------|
| **Streaming 回應** | Token by token 輸出 |
| **直接 API 支援** | OpenAI / Anthropic / Gemini API 直接接入，不需裝 CLI |
| **Code interpreter** | 沙盒執行 8 種語言的程式碼 |
| **Web 搜尋** | 內建搜尋工具 |
| **圖片生成** | DALL-E 3、Stable Diffusion |
| **多模態** | 圖片上傳分析、語音輸入輸出 |
| **多用戶系統** | OAuth2、LDAP、email 登入 |
| **Conversation branching** | 從任意時間點建立分支，探索不同對話走向 |
| **Agent marketplace** | 社群分享的自訂 agent |
| **MCP 支援** | Model Context Protocol 擴充工具 |
| **30+ 語言 UI** | 多語系介面 |

### 你有、LibreChat 沒有

| 功能 | 說明 |
|------|------|
| **多 agent 同室討論** | N 個 agent 在同一個 session 輪流對話，互相看到彼此發言 |
| **Human-as-moderator** | 任何時刻打斷輪次、轉換話題、注入技能 |
| **Agent 個性系統（三層 md）** | AGENT.md + IDENTITY.md + SOUL.md，agent 有角色靈魂 |
| **每日記憶** | 跨 session 自動記錄，agent 有積累感 |
| **/skill 語法注入** | 對話中途插入 skill，改變所有 agent 行為 |
| **Marketplace 模板** | 廚師、哲學家、心理學家...一鍵安裝 + 選模型 |
| **Auto / Manual 節奏** | 控制 agent 自由討論 vs 人類主導步調 |
| **Ollama Pull** | UI 裡直接拉模型 |

---

## 結論

LibreChat 是功能非常完整的「ChatGPT 開源替代品」——它幾乎做到了 ChatGPT 的所有功能，再加上多供應商支援和自架隱私保護。但它的核心仍然是**人類和 AI 一對一對話**，不是多個 AI 互相討論。

兩個專案在定位上幾乎沒有直接競爭：
- **LibreChat** = 「我想要一個更好的、私有的 ChatGPT」
- **你的專案** = 「我想讓多個 AI 角色圍坐在一桌討論」

如果要從 LibreChat 借鑑，最有價值的是：**直接 API 支援**（不需裝 CLI 工具）和 **Conversation branching 的概念**（從某個時間點分支，讓討論走不同方向）。
