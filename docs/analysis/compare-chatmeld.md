# 比較報告：ChatMeld vs Agent CLI Conversation

> https://github.com/balazspiller/ChatMeld
> 撰寫時間：2026-03-17
> ✅ 另一個 LLM 對 ChatMeld 的說法已查證，基本準確

---

## ChatMeld 是什麼

**定位：** 瀏覽器端的多模型對話遊樂場，AI-to-AI 對話實驗工具

ChatMeld 是一個純前端的 Web App（client-side only），讓使用者把多個 AI 模型拉進同一個對話視窗，讓它們輪流說話——可以是 AI 自動對話，也可以手動指定下一個說話者。資料全部存在瀏覽器 IndexedDB，不上傳任何伺服器。

### Tech Stack

| 層 | 技術 |
|----|------|
| 語言 | TypeScript |
| 前端 | React + Vite |
| 狀態管理 | Zustand |
| 資料庫 | Dexie.js（IndexedDB）|
| 樣式 | Tailwind CSS |
| 部署 | 純靜態，GitHub Pages 託管 |
| LLM 供應商 | OpenAI + Google AI Studio（需使用者自備 API key）|

### 核心功能

- 2-4 個 AI 模型同時在一個聊天室
- **Auto Advance 模式**：模型自動輪流說話（AI-to-AI 對話）
- **Manual 模式**：使用者手動指定下一個說話者
- 全對話編輯控制：暫停、倒帶、編輯、刪除 AI 回應
- 資料完全本地（IndexedDB），無遙測
- 使用者自備 API key，直接打 OpenAI / Gemini API

---

## ✅ 查證：其他 LLM 對 ChatMeld 的說法

| 說法 | 查證結果 |
|------|---------|
| Group Chat 模式，可以加入 GPT、Claude、Llama 等模型，設定自動/手動模式 | ✅ **正確**（支援 2-4 個模型，auto/manual 模式真實存在）|
| 模型 A 回覆完後，觸發模型 B 對 A 的回覆進行評論 | ✅ **正確**（auto advance 自動觸發，或手動指定 B 為下一個說話者）|

注意：ChatMeld 目前**只支援 OpenAI 和 Google AI Studio**，不支援 Claude 或 Llama（另一個 LLM 的說法把這些模型都列進去，稍有誇大）。

---

## ChatMeld 的多 agent 運作方式

```
聊天室（同一個 session）：
  使用者: 來討論 AI 倫理
  [GPT-4o]: 我認為...
  [Gemini]: 補充一下，另一個角度...（Auto Advance 觸發）
  使用者: （手動切換，指定 GPT-4o 下一個說話）
  [GPT-4o]: 回應 Gemini 的觀點...
```

這和你的專案的運作方式**非常相似**。

---

## 與你的專案比較

### 相似之處（兩者最接近）

ChatMeld 是這次比較的五個產品裡，**功能定位最接近你的專案**的：

| 面向 | ChatMeld | 你的專案 |
|------|----------|---------|
| 多 agent 同室 | ✅ 2-4 個模型 | ✅ 1-N 個 agent |
| 共享對話 context | ✅ | ✅ |
| Auto / Manual 切換 | ✅ | ✅（Auto mode / Manual mode）|
| 使用者隨時介入 | ✅（手動指定說話者）| ✅（打字即介入，重置輪次）|
| 不需寫程式 | ✅ | ✅ |
| 瀏覽器 UI | ✅ | ✅ |

### 根本差異

| 面向 | ChatMeld | 你的專案 |
|------|----------|---------|
| 架構 | 純前端（client-side only）| 後端 FastAPI + WebSocket |
| LLM 供應商 | OpenAI + Google AI Studio（需自備 API key）| CLI tools + Ollama（本地優先）|
| Agent 個性 | System prompt 文字設定 | AGENT.md + IDENTITY.md + SOUL.md 三層，有角色靈魂 |
| 持久化 | IndexedDB（瀏覽器）| JSON 檔案（server）|
| 跨裝置 | ❌（資料在瀏覽器 IndexedDB，換瀏覽器就沒了）| ✅（server 端，任何裝置可訪問）|
| Session Resume | 受限（IndexedDB）| ✅ 完整 resume，帶完整歷史 |
| 記憶 | ❌ | ✅（每日記憶、跨 session 積累）|
| Marketplace | ❌ | ✅（廚師、哲學家...）|
| /skill 注入 | ❌ | ✅ |
| 下載 session | ❌ | ✅（JSON / Markdown / PDF）|
| Streaming | 視 API 而定 | ❌（等整段回應）|

### ChatMeld 有、你沒有

| 功能 | 說明 |
|------|------|
| **直接 API 接入** | 使用者自備 OpenAI / Gemini key，不需裝 CLI 工具 |
| **對話倒帶 / 編輯** | 可以編輯或刪除某個 AI 的回應，改寫對話歷史 |
| **無伺服器部署** | 純靜態 HTML，放 GitHub Pages 就能跑 |

### 你有、ChatMeld 沒有

| 功能 | 說明 |
|------|------|
| **Agent 個性系統** | 三層 md，agent 有角色、身份、靈魂，不只是一段 prompt |
| **每日記憶 / 跨 session 積累** | Agent 會記得之前說過什麼 |
| **Marketplace** | 預設 agent 模板一鍵安裝 |
| **/skill 語法注入** | 對話中途插入 skill，即時改變所有 agent 行為 |
| **Session 完整 Resume** | 從同一個歷史繼續，帶完整 context |
| **Server 端持久化** | 跨瀏覽器、跨裝置可訪問 |
| **Session 下載** | JSON / Markdown / PDF 匯出 |
| **本地模型支援** | Ollama 支援，不需要 API key |
| **N 個 agent（無上限）** | ChatMeld 最多 4 個；你的專案沒有限制 |

---

## 結論

ChatMeld 是這五個產品裡**概念上最接近你的專案**的：都是多模型同室、都有 auto/manual 模式、都讓 AI 互相看到彼此的發言。

但兩者的差距在於**深度和架構**：

- **ChatMeld** = 輕量遊樂場，快速實驗 AI-to-AI 對話，無需安裝，但也沒有持久化、記憶、角色個性
- **你的專案** = 有 server 端、有記憶、有角色個性、有 marketplace 的完整多 agent 討論平台

ChatMeld 適合「我想快速看兩個 AI 互相討論一個問題」；你的專案適合「我想建立一個有個性的 AI 團隊，長期一起討論各種話題」。

### 從 ChatMeld 值得借鑑的

1. **對話倒帶 / 編輯功能** — 讓使用者可以修改某個 agent 的回應，重新繼續
2. **直接 API key 輸入** — 降低不需裝 CLI 的使用者的門檻
