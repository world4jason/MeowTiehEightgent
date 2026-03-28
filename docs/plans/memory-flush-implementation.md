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

## Edge Cases & 防禦設計

### 核心原則

**Memory flush 絕對不能影響主對話流程。** 任何 extraction 失敗都必須靜默降級，不能中斷 compress_history()，更不能中斷 WS session。

### Edge Case 分析

#### EC-1: Extraction LLM 呼叫失敗（timeout、API error、model 不存在）

**問題：** `extract_facts()` 呼叫 LLM 失敗，如果沒 catch 住會讓 `compress_history()` 整個 crash，導致 agent 拿不到 history → 回應錯亂。

**防禦：**
```python
async def extract_facts(...):
    try:
        result = await _call_agent(agent_dict, prompt)
        ...
    except Exception as exc:
        logger.warning("Fact extraction failed: %s", exc)
        return []  # 空列表，靜默降級
```

- `compress_history()` 裡用 try/except 包住整個 extraction 區塊
- Extraction 失敗 → 跳過，直接做原本的摘要壓縮
- **不設 cooldown** — extraction 失敗不影響 compression 本身的 cooldown

#### EC-2: Extraction 耗時過長，阻塞下一輪 agent 回應

**問題：** 現在 `compress_history()` 是在主迴圈的 agent turn 之前同步呼叫的（ws.py:249）。如果 extraction 加在 compression 前面，兩次 LLM 呼叫會讓延遲加倍。

**防禦：**
- **Extraction 跟 compression 並行**（`asyncio.gather`），而不是串行
- 或者：**extraction 放 background task**，不阻塞 compression
- 具體做法：

```python
async def compress_history(...):
    # ... existing overflow check ...

    # Phase 1: Fire-and-forget fact extraction (background)
    if overflow and agent_workspaces:
        asyncio.create_task(_safe_extract_facts(overflow, ...))

    # Phase 2: Original compression (不等 extraction 完成)
    summary_text = await _call_agent(...)
    ...
```

- `_safe_extract_facts()` 是包了 try/except 的 wrapper
- 就算 extraction 比 compression 慢，也不影響對話

#### EC-3: 多個 agent 同時觸發 extraction，寫同一個檔案

**問題：** 聊天室有 3 個 agent，compress_history 每輪都呼叫。如果 agent A 的 turn 觸發 extraction 正在寫 `memory/2026-03-29.md`，agent B 的 turn 又觸發，可能 race condition。

**防禦：**
- **Extraction 只觸發一次 per compression event** — 不是 per agent
- 用 flag：`_extraction_done_for_count` 記錄已經 extract 過的 overflow_count
- 或更簡單：**只在 summary cache miss 時觸發**（跟 compression 同時機）

```python
# Only extract when we actually need to recompress
if new_overflow >= trigger_threshold:
    await _safe_extract_facts(...)  # 只在新壓縮時做
    summary_text = await _call_agent(...)
```

#### EC-4: 對話剛開始就結束（< window_size 條訊息），從沒觸發過 compression

**問題：** 短對話不觸發 compression → 不觸發 extraction → 沒有 memory flush。可能有重要決策在短對話中做出但沒被記錄。

**防禦：**
- **Session 結束時的 daily summary（`write_daily_summary()`）已經存在** — 這個覆蓋了短對話場景
- 不需要額外處理 — extraction 是壓縮的附屬品，短對話直接靠 daily summary

#### EC-5: Memory 檔案損壞（disk full、寫入中斷、encoding error）

**問題：** 寫入 `memory/YYYY-MM-DD.md` 或 `entities.json` 失敗。

**防禦：**
```python
def _flush_facts_to_file(memory_dir, facts):
    try:
        memory_dir.mkdir(parents=True, exist_ok=True)
        path = memory_dir / f"{datetime.now().strftime('%Y-%m-%d')}.md"
        # Append mode — 不覆蓋既有內容
        with open(path, "a", encoding="utf-8") as f:
            f.write(...)
    except Exception as exc:
        logger.warning("Failed to flush facts to %s: %s", path, exc)
        # 靜默失敗 — 對話繼續
```

- 用 append mode，不用 read-modify-write
- 任何 IO 錯誤 → log warning → 繼續

#### EC-6: LLM 回傳垃圾（不是 fact 格式、回傳 code block、幻覺事實）

**問題：** Prompt 要求一行一個 fact，但 LLM 可能回傳 markdown code block、長篇大論、或純幻覺。

**防禦：**
- 只保留 `- [DECISION]`、`- [ACTION]`、`- [FINDING]`、`- [PREFERENCE]` 開頭的行
- 其他行全部丟棄
- 單行超過 200 字 → 截斷

```python
def _parse_facts(raw: str) -> list[str]:
    valid_prefixes = ("- [DECISION]", "- [ACTION]", "- [FINDING]", "- [PREFERENCE]")
    facts = []
    for line in raw.strip().splitlines():
        line = line.strip()
        if line.startswith(valid_prefixes):
            facts.append(line[:200])  # 截斷過長的
    return facts
```

- 如果解析後空列表 → 不寫檔案

#### EC-7: Entity extraction 回傳無效 JSON

**問題：** LLM 回傳的不是合法 JSON。

**防禦：**
```python
def _parse_entities(raw: str) -> dict:
    # 嘗試提取 JSON block
    import re
    m = re.search(r'\{[^{}]+\}', raw, re.DOTALL)
    if not m:
        return {}
    try:
        data = json.loads(m.group())
        # 只保留 str → str 的 entries
        return {k: str(v)[:200] for k, v in data.items() if isinstance(k, str)}
    except json.JSONDecodeError:
        return {}
```

#### EC-8: 去重判斷錯誤（把新 fact 誤判為重複）

**問題：** 簡單字串比對可能把「決定用 Python」和「決定用 Python 3.12」判為重複。

**防禦：**
- **Phase 1 不做去重** — 先求不漏
- 重複 facts 在 memory 檔案裡不會造成嚴重問題（只是冗餘）
- 未來再加語義去重（Phase 4 向量記憶時）

#### EC-9: build_prompt 注入記憶太多，擠壓 history 空間

**問題：** 3 天的 facts + entities 可能很長，擠壓了實際 history 的 token 預算。

**防禦：**
- **硬限 token budget** — facts 最多注入 500 字，entities 最多 300 字
- 超過就只載最近 1 天

```python
def _load_recent_facts(memory_dir, max_chars=500):
    # 從最新的開始載，累積到 max_chars 為止
    ...
```

#### EC-10: Session resume（斷線重連）後 extraction 重複執行

**問題：** WS 斷線重連時，`compress_history()` 會重新跑，可能重複 extract 已經 extract 過的訊息。

**防禦：**
- **Extraction 跟 compression 共用 cache 機制** — 在 `summary.json` 裡記錄 `facts_extracted_count`
- 只 extract `overflow_count - facts_extracted_count` 的新訊息
- 或更簡單：extraction 是 append mode，重複幾個 facts 不會壞事（EC-8 的延伸）

### 防禦設計總結

```
compress_history() 呼叫
  │
  ├── overflow check（現有）
  │   └── 沒有 overflow → return（不做任何 extraction）
  │
  ├── cache check（現有）
  │   └── cache 新鮮 → return（不做任何 extraction）
  │
  ├── Step 1: Fact Extraction（新增，background task）
  │   ├── try/except 包全部
  │   ├── LLM 呼叫失敗 → log + 跳過
  │   ├── 回傳解析失敗 → log + 跳過
  │   ├── 檔案寫入失敗 → log + 跳過
  │   └── 任何異常都不影響 Step 2
  │
  └── Step 2: Compression（現有，不等 Step 1）
      └── 原本的邏輯完全不變
```

**一句話：extraction 是 best-effort 的附加品，所有路徑都有 fallback 到「不做」。**

## 修訂後的實作步驟

### Phase 1: Fact Extraction（最小可行）
1. `history_manager.py` 加 `_safe_extract_facts()` — try/except 包全部
2. `_parse_facts()` — 嚴格格式驗證，丟棄不合格的行
3. `_flush_facts_to_file()` — append mode 寫入
4. `compress_history()` 在 cache miss 時觸發 background extraction
5. 測試：正常路徑 + LLM 失敗 + 解析失敗 + IO 失敗

### Phase 2: Entity Extraction
1. `_safe_extract_entities()` — try/except 包全部
2. `_parse_entities()` — 容錯 JSON 解析
3. merge 邏輯（新覆蓋舊）
4. 測試

### Phase 3: Memory Injection
1. `core/prompt.py` 加 `_load_recent_facts(max_chars=500)` + `_load_entities(max_chars=300)`
2. `build_prompt()` 注入 — 有 budget 限制
3. 測試

### Phase 4: 觀察 & 調整
1. 觀察實際 extraction 品質
2. 調整 prompt
3. 視需要加去重
4. 視需要加 entities 過期機制

## 風險與考量

| 風險 | 緩解 |
|------|------|
| LLM extraction 成本 | 用便宜 model，只在壓縮時觸發（不是每輪） |
| 事實品質差 | 嚴格格式驗證 + NONE 選項 |
| 記憶膨脹 | 硬限注入字數，每日一個檔案 |
| Entity 衝突 | 新覆蓋舊，以最新為準 |
| 延遲 | Background task，不阻塞 compression |
| 主流程中斷 | **全路徑 try/except，所有失敗靜默降級** |
| 記憶錯亂 | Append mode，嚴格格式過濾，不做危險的 read-modify-write |
| 重複 extraction | Cache flag 或容忍少量重複（不會壞事） |

## 與 TODO.md 的關係

| TODO 項目 | 關聯 |
|-----------|------|
| Changedoc/決策追蹤 | facts 的 `[DECISION]` 覆蓋此需求 |
| 跨 Session 向量記憶 | entities.json + facts 是向量化的來源 |
| Substantive Gate | 可用於判斷 fact 是否值得存 |
| Quality Gate | facts 可記錄 session 的完成狀態 |
| Session 機器可讀狀態 | entities.json 是結構化的 session 知識 |
