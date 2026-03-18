# 比較報告：AutoGen vs Agent CLI Conversation

> https://github.com/microsoft/autogen
> 撰寫時間：2026-03-17

---

## AutoGen 是什麼

**定位：** Microsoft 出品的多 agent 協作框架（Python + .NET），概念上最接近你的設計

AutoGen 是一個事件驅動的多 agent 框架，核心是 message passing 架構。它有 **GroupChat** 功能，讓多個 agent 在同一個 context 裡輪流說話——這在概念上和你的聊天室最為接近。但它是 SDK，需要寫程式才能用。

### Tech Stack

| 項目 | 技術 |
|------|------|
| 語言 | Python 3.10+ 和 .NET / C# |
| 安裝 | `pip install autogen-agentchat` |
| 架構 | 三層：Core API（message passing）、AgentChat API（快速原型）、Extensions（LLM/工具）|
| LLM 支援 | OpenAI、Azure OpenAI、Anthropic Claude、Google Gemini、Ollama |
| Streaming | ✅（IStreamingAgent、IStreamingMiddleware）|
| UI | 無內建（AutoGen Studio 可選，no-code GUI）|
| 授權 | CC-BY-4.0 / MIT |

### GroupChat 概念

```python
from autogen_agentchat.agents import AssistantAgent
from autogen_agentchat.teams import RoundRobinGroupChat

agent_a = AssistantAgent("philosopher", system_message="You are a philosopher...")
agent_b = AssistantAgent("scientist", system_message="You are a scientist...")
agent_c = AssistantAgent("historian", system_message="You are a historian...")

team = RoundRobinGroupChat([agent_a, agent_b, agent_c])
await team.run(task="Discuss the nature of intelligence")
```

每個 agent 可以看到其他 agent 說的話（共享 context）。支援：
- **RoundRobin**：依序輪流
- **Graph-based**：自訂 routing 邏輯
- **Coordinator**：有 manager agent 決定誰說話

---

## GroupChat vs 你的聊天室

這是最關鍵的比較。

### 相似之處

| 面向 | AutoGen GroupChat | 你的專案 |
|------|-------------------|---------|
| 多 agent 共享 context | ✅ 所有 agent 看到完整對話 | ✅ 共享 `history_text` |
| 輪流機制 | RoundRobin | `itertools.cycle` |
| Human 可以介入 | ✅ 支援 | ✅ 任何時刻可打斷 |
| 多 LLM 支援 | ✅ | ✅ |

### 本質不同

| 面向 | AutoGen GroupChat | 你的專案 |
|------|-------------------|---------|
| 使用方式 | 寫 Python 程式 | 開瀏覽器、點選、打字 |
| 目標用戶 | 工程師、研究人員 | 任何人 |
| Agent 定義 | Python class + 系統 prompt | AGENT.md + IDENTITY.md + SOUL.md（markdown，非技術用戶可編輯）|
| 執行觸發 | `team.run(task="...")` | 選 agent、輸入話題、按開始 |
| 持久化 | 需自己實作 | 自動 JSON session，可 resume |
| 記憶 | 需自己實作 | 每日記憶自動記錄 |
| 角色個性 | 靠系統 prompt 的文字描述 | 三層 md 系統（identity / soul / instructions 分離）|

---

## 與你的專案功能比較

### AutoGen 有、你沒有

| 功能 | 說明 |
|------|------|
| **Streaming 回應** | `IStreamingAgent` 支援 token by token 輸出 |
| **Tool use / code execution** | 內建 code interpreter，agent 可執行 Python、browsing |
| **MCP 整合** | Model Context Protocol，可接各種外部工具 |
| **Graph-based routing** | 自訂 agent 之間的說話順序和條件 |
| **.NET / C# SDK** | 工程師可以用不同語言接入 |
| **AutoGen Studio** | 可選的 no-code GUI，視覺化建立 workflow |
| **企業級架構** | Azure 整合、WebAPI sample、多行程支援 |

### 你有、AutoGen 沒有

| 功能 | 說明 |
|------|------|
| **End-user UI** | 不需寫程式，開瀏覽器選 agent 就能用 |
| **Human-as-moderator UX** | 打字介入 → 輪次重置 → agent 直接回應 human，自然的主持體驗 |
| **Agent 個性系統（三層 md）** | 非技術用戶也能自訂 agent 的角色、身份、價值觀 |
| **每日記憶** | Agent 跨 session 自動記錄、積累 |
| **/skill 語法** | 對話中途注入 skill，即時改變 agent 行為 |
| **Marketplace** | 預設 agent 模板，一鍵安裝 + 選模型 + 改名 |
| **Auto / Manual 節奏控制** | 切換 agent 自由討論 vs 人類控制步調 |
| **Session 下載** | JSON、Markdown、PDF 匯出 |
| **Ollama Pull** | UI 裡直接拉模型 |
| **輕量部署** | 只需 `pip install fastapi uvicorn`，無需 Node/Bun/Electron |

---

## 結論

AutoGen GroupChat 是目前**概念上最接近你的專案的工具**：多個 agent 在同一個對話 context 裡輪流說話、互相看到對方的發言。

但兩者的本質差異是**使用門檻和對象**：

- **AutoGen** = 工程師用 Python 搭建的 agent 協作管道，需要程式能力
- **你的專案** = 一般人開瀏覽器就能主持的多 agent 討論室

如果 AutoGen 是「讓工程師蓋聊天室」，你的專案是「已經蓋好的聊天室，任何人都可以進去坐下來開始討論」。

### 最值得從 AutoGen 借鑑的

1. **Streaming**（IStreamingAgent 的實作思路，用 SSE 或 WebSocket 逐 token 推送）
2. **Tool use 架構**（讓 agent 在討論中能搜尋、執行程式碼）
3. **Graph-based routing**（未來可能需要讓某個 agent 指定要下一個誰說話）
