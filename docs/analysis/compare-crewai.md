# 比較報告：CrewAI vs Agent CLI Conversation

> https://github.com/crewaiinc/crewai
> 撰寫時間：2026-03-17

---

## CrewAI 是什麼

**定位：** 工程師用的多 agent 任務自動化 Python SDK

CrewAI 是一個純 Python 框架，讓開發者定義有 role / goal / backstory 的 agent，組成「crew」，按照預先設計的任務流程（sequential 或 hierarchical）自動執行。核心思路是「分工合作完成一個複雜任務」，不是「自由對話」。

### Tech Stack

| 項目 | 技術 |
|------|------|
| 語言 | Python 3.10–3.13 |
| 安裝 | `pip install crewai` |
| 設定方式 | YAML（agents.yaml、tasks.yaml）+ Python class |
| LLM 支援 | OpenAI（預設）、Ollama、任何 OpenAI-compatible API |
| 工具 | 40+ 內建工具（搜尋、爬蟲、檔案、資料庫...）|
| UI | 無（純 SDK）|
| 授權 | MIT |

### 核心概念

```python
# 定義 agent
researcher = Agent(
    role='Research Analyst',
    goal='Find accurate information',
    backstory='Expert in finding data',
    tools=[SerperDevTool()]
)

# 定義 task
task = Task(
    description='Research AI trends',
    agent=researcher
)

# 組成 crew
crew = Crew(agents=[researcher, writer], tasks=[task1, task2])
crew.kickoff()
```

### CrewAI 的多 agent 運作方式

**Task-based delegation，非自由對話。**

```
Sequential 模式：
  Task A → Research Agent → 完成
  Task B → Writer Agent（拿到 A 的結果）→ 完成
  輸出

Hierarchical 模式：
  Manager Agent
    ├─ 分析任務 → 指派給 Research Agent
    ├─ 拿到結果 → 指派給 Writer Agent
    └─ 驗證結果 → 輸出
```

Agent 可以拿到前一個 task 的結果（輸出傳遞），但這不是「互相對話」，是「任務鏈」。

---

## 與你的專案比較

### 根本設計差異

| 面向 | CrewAI | 你的專案 |
|------|--------|---------|
| 核心模型 | Task pipeline：定義好工作流，agent 按順序完成任務 | 討論室：agent 自由輪流說話，human 隨時介入 |
| 人類的角色 | 工程師——寫程式定義任務流程；最終用戶只看結果 | 主持人——在討論進行中隨時導向 |
| 使用門檻 | 需要寫 Python | 開瀏覽器即用，不需寫程式 |
| 對話性質 | 預設好的任務執行，有明確的開始和結束 | 開放式討論，沒有終點 |
| Agent 定義 | Role + Goal + Backstory（code / YAML）| AGENT.md + IDENTITY.md + SOUL.md（markdown）|
| 執行目標 | 完成特定任務（報告、分析、程式碼）| 探索話題、腦力激盪、多角度討論 |

### CrewAI 有、你沒有

| 功能 | 說明 |
|------|------|
| **Tool use（40+）** | 搜尋、爬蟲、Python code execution、檔案操作、資料庫... |
| **Hierarchical orchestration** | Manager agent 自動分配任務、驗證結果 |
| **Memory 系統** | Short-term、long-term、entity memory，semantic 搜尋 |
| **Workflow DSL（Flow）** | 用 `@start`、`@listen`、`@router` 定義複雜的執行流程 |
| **MCP 支援** | Model Context Protocol 擴充 |
| **企業支援** | CrewAI AMP Suite，有 observability dashboard |

### 你有、CrewAI 沒有

| 功能 | 說明 |
|------|------|
| **使用者介面** | 一般人開瀏覽器就能用，不需寫程式 |
| **自由對話** | Agent 不是在執行任務，是在「討論」，沒有預設終點 |
| **Human-as-moderator** | 主持人可以隨時打斷、轉換話題，對話方向由人引導 |
| **Agent 個性（三層 md）** | 有「靈魂」和「身份」的角色定義，不只是 role/goal |
| **每日記憶** | 跨 session 自動記錄，agent 有積累感 |
| **/skill 語法注入** | 對話中途插入 skill，改變當下所有 agent 的行為 |
| **Marketplace** | 預設 agent 模板（財務專家、廚師、哲學家...）一鍵安裝 |
| **Session 下載** | 匯出 JSON、Markdown、PDF |

---

## 結論

CrewAI 和你的專案**幾乎沒有重疊**，服務的是完全不同的使用情境：

- **CrewAI** = 「我是工程師，我要自動化一個複雜的工作流（研究 + 寫作 + 驗證）」
- **你的專案** = 「我想讓多個 AI 角色討論一個問題，我來主持」

CrewAI 的使用者是開發者，產出是任務結果（報告、程式碼）；你的使用者是任何人，產出是討論過程本身。

如果要借鑑 CrewAI 的設計，最有價值的是 **tool use 的思路**（讓 agent 在討論中能執行搜尋、查資料）和 **memory 架構**（semantic 搜尋過去的對話記憶）。
