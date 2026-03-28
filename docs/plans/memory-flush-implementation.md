# Plan: Pre-Compaction Memory Flush + Entity Extraction

**Date:** 2026-03-29
**Status:** Draft — 待 review
**Survey:** [docs/specs/memory-flush-survey.md](../specs/memory-flush-survey.md)

---

## 目標

在 `compress_history()` 壓縮舊對話前，先用 LLM 抽取重要事實和實體，寫入 agent memory 檔案。確保跨 session 的記憶乾淨、結構化。

## 調研結論

| 來源 | 機制 | 我們採用的部分 |
|------|------|--------------|
| OpenClaw | `compact()` + `afterTurn()` lifecycle + `customInstructions` | afterTurn 概念 — 每輪結束可做記憶操作 |
| MemGPT/Letta | Agent 自主 tool call 管理三層記憶 | 記憶分層概念（但我們不用 tool call） |
| CrewAI | `extract_memories()` 自動拆分 facts + 向量去重 | **fact extraction prompt + 去重邏輯** |
| LangChain | `ConversationEntityMemory` 抽取實體資訊 | **entity extraction 概念** |
| LangChain | `ConversationSummaryBufferMemory` token 超限觸發 | 已有（compress_history） |
| MassGen | Workspace snapshots + Substantive Gate | **Substantive Gate 判斷是否值得記** |

## 架構設計

### 記憶層級（三層）

```
┌─────────────────────────────────────────┐
│ Layer 1: Working Memory（即時）           │
│ - 當前 session 的 history_text           │
│ - Kanban 狀態                           │
│ - 注入方式：build_prompt() 直接帶入      │
└────────────────────┬────────────────────┘
                     │ compress_history() 觸發
                     ▼
┌─────────────────────────────────────────┐
│ Layer 2: Session Memory（壓縮後）        │
│ - summary.json（摘要）                   │
│ - 注入方式：壓縮摘要 prepend 到 history  │
└────────────────────┬────────────────────┘
                     │ extract_facts() 在壓縮前觸發
                     ▼
┌─────────────────────────────────────────┐
│ Layer 3: Long-Term Memory（跨 session）  │
│ - agents/{name}/memory/YYYY-MM-DD.md    │
│ - 事實 + 實體 + 決策                     │
│ - 注入方式：build_prompt() 載入最近 N 天  │
└─────────────────────────────────────────┘
```

### 觸發時機

```
compress_history() 被呼叫
  │
  ├── 檢查：有沒有新的溢出訊息需要壓縮？
  │   └── 沒有 → return（用 cache）
  │
  ├── Step 1: extract_facts()  ← 新增
  │   ├── 輸入：即將被壓縮的舊訊息
  │   ├── LLM 抽取：facts + entities + decisions
  │   ├── 輸出：結構化事實列表
  │   └── 寫入：agents/{speaker}/memory/YYYY-MM-DD.md
  │
  ├── Step 2: extract_entities()  ← 新增
  │   ├── 輸入：同上
  │   ├── LLM 抽取：人名、概念、工具、偏好
  │   ├── 輸出：entity → description mapping
  │   └── 寫入：agents/{speaker}/memory/entities.json
  │
  └── Step 3: compress（現有）
      ├── 舊訊息 → LLM 摘要
      └── 存入 summary.json
```

### 為什麼分 facts 和 entities？

- **Facts** = 時間點的事實（「3/29 決定用 Python backend」）→ 追加到日期檔
- **Entities** = 持續存在的知識（「Jason 偏好 zh-TW」「Gemini 是綠色」）→ 更新到 entities.json
- Facts 會隨時間累積，entities 會被更新覆蓋

## 實作細節

### 1. `extract_facts()` — 事實抽取

**位置：** `history_manager.py`

**Prompt：**
```
You are reviewing a multi-agent conversation segment that is about to be archived.
Extract ONLY facts worth remembering across future sessions.

Categories:
1. DECISIONS — choices made, directions agreed upon
2. ACTION_ITEMS — tasks assigned, commitments made
3. FINDINGS — technical discoveries, conclusions reached
4. PREFERENCES — user preferences, constraints discovered

Output format (one per line):
- [DECISION] description
- [ACTION] description
- [FINDING] description
- [PREFERENCE] description

If nothing worth remembering, output: NONE

Conversation segment:
{overflow_messages}
```

**去重邏輯：**
- 讀取現有 memory 檔案
- 新 fact 跟既有 facts 做字串相似度比對（簡單 difflib，不需向量 DB）
- 相似度 > 0.8 → 跳過

**寫入格式（Markdown）：**
```markdown
## 2026-03-29 14:30 — Session Extract

- [DECISION] 從 v0.9.0 開出 rebirth branch，回歸 Python backend
- [FINDING] app.py 原本 2973 行，拆成 core/ + routes/ 後剩 418 行
- [ACTION] 實作 pre-compaction memory flush
- [PREFERENCE] 使用者偏好 zh-TW 介面
```

### 2. `extract_entities()` — 實體抽取

**Prompt：**
```
Extract key entities mentioned in this conversation.
For each entity, provide a brief description of what was learned about it.

Output as JSON:
{
  "entity_name": "description of what we know",
  ...
}

Only include entities that would be useful in future conversations.
Skip generic terms. Focus on: people, projects, tools, preferences, constraints.

Conversation:
{overflow_messages}
```

**儲存格式（JSON）：**
```json
{
  "Jason": "專案負責人，偏好 zh-TW，使用 Python + FastAPI",
  "rebirth": "從 v0.9.0 分支出來的 branch，回歸 Python 單後端",
  "Kanban": "對話頁面的討論看板，支援拖曳，狀態同步到 agent prompt"
}
```

**更新邏輯：** merge — 新的 description 覆蓋舊的（同 entity name）

### 3. `build_prompt()` 記憶注入

在 `core/prompt.py` 的 `build_prompt()` 中，agent identity 載入後加入：

```python
# Long-term memory injection
memory_dir = agent["workspace"] / "memory"
if memory_dir.exists():
    # Load recent facts (last 3 days)
    recent_facts = _load_recent_facts(memory_dir, max_days=3)
    if recent_facts:
        parts.append(f"## Recent Memory\n\n{recent_facts}")

    # Load entity knowledge
    entities = _load_entities(memory_dir)
    if entities:
        entity_text = "\n".join(f"- **{k}**: {v}" for k, v in entities.items())
        parts.append(f"## Known Entities\n\n{entity_text}")
```

### 4. Model 選擇

- Fact extraction 和 entity extraction 用**便宜 model**（跟 summarization 同一個 model）
- 設定來源：`config.json` 的 `summarization_model`
- 預設 fallback：用 agent 自己的 model

## 實作步驟

### Phase 1: Fact Extraction（核心）
1. `history_manager.py` 加 `extract_facts(messages, model, agent_names)`
2. `compress_history()` 在壓縮前呼叫 `extract_facts()`
3. 寫入 `agents/{name}/memory/YYYY-MM-DD.md`
4. 簡單去重（difflib）
5. 測試

### Phase 2: Entity Extraction
1. `history_manager.py` 加 `extract_entities(messages, model)`
2. `compress_history()` 在壓縮前呼叫 `extract_entities()`
3. 寫入/更新 `agents/{name}/memory/entities.json`
4. 測試

### Phase 3: Memory Injection
1. `core/prompt.py` 加 `_load_recent_facts()` 和 `_load_entities()`
2. `build_prompt()` 注入 Recent Memory + Known Entities
3. 測試

### Phase 4: 整合 TODO.md 既有項目
- 跟 **Changedoc/決策追蹤** 整合 — facts 的 `[DECISION]` 類別
- 跟 **Substantive Gate** 整合 — 判斷哪些值得記
- 為未來的 **跨 Session 向量記憶** 鋪路 — entities.json 可作為向量化的來源

## 風險與考量

| 風險 | 緩解 |
|------|------|
| LLM extraction 成本 | 用便宜 model，只在壓縮時觸發（不是每輪） |
| 事實品質差 | Prompt 明確分類，加 NONE 選項避免硬擠 |
| 記憶膨脹 | 每日一個檔案，build_prompt 只載最近 3 天 |
| Entity 衝突 | 新覆蓋舊，以最新為準 |
| 延遲 | Extraction 跟 compression 可以並行（asyncio.gather） |

## 與 TODO.md 的關係

| TODO 項目 | 關聯 |
|-----------|------|
| Changedoc/決策追蹤 | facts 的 `[DECISION]` 覆蓋此需求 |
| 跨 Session 向量記憶 | entities.json + facts 是向量化的來源 |
| Substantive Gate | 可用於判斷 fact 是否值得存 |
| Quality Gate | facts 可記錄 session 的完成狀態 |
| Session 機器可讀狀態 | entities.json 是結構化的 session 知識 |
