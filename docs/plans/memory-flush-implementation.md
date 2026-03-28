# Plan: Pre-Compaction Memory Flush + Entity Extraction (v3 — Post-Review)

**Date:** 2026-03-29 (v3)
**Status:** APPROVED WITH CHANGES — 三方 review 完成，已整合修改
**Survey:** [docs/specs/memory-flush-survey.md](../specs/memory-flush-survey.md)

---

## 設計脈絡

### 問題

MeowTiehEightgent 是多 agent 聊天室。Agent 是 CLI subprocess（claude/gemini/codex），每次呼叫都是無狀態的 — agent 不記得上一個 session 的事。目前有兩個記憶機制：

1. **compress_history()** — 對話超過 30 輪時摘要壓縮，但摘要是「概括性的」，重要決策會被稀釋
2. **append_memory() + write_daily_summary()** — 每輪追加、session 結束寫日記，但是全文 dump，沒有結構化

結果：agent 在新 session 裡不知道上次做了什麼決定、用戶偏好什麼、哪些問題已經解決。

### 調研過程

調研了 7 個框架/產品的記憶管理：

- **MemGPT/Letta**（學術）— agent 自主管理三層記憶，但需要 tool call（Meow 不支援）
- **CrewAI** — 自動 `extract_memories()`，但需要向量 DB
- **LangChain** — Entity Memory + SummaryBufferMemory，概念好但太 framework-heavy
- **AutoGen**（Microsoft）— 沒有自動 extraction，只有手動 add
- **OpenClaw context-engine**（開源）— `compact()` + `afterTurn()` lifecycle，但 memory flush 邏輯在 Pi runtime（閉源）
- **OpenClaw Memory Stack**（商業產品 $49）— **最完整的參考**：5 引擎搜索 + RRF rank fusion + L0/L1/L2 token 控制 + 3-stage distillation + 8 種 fact 類型 + supersede 機制 + heuristic fallback
- **mem0** — 簡潔 API（`add/search`），適合未來向量記憶整合

### 為什麼這樣合併

**取捨原則：最大效果、最小複雜度、零風險。**

| 我們採用的 | 來源 | 原因 |
|-----------|------|------|
| 雙時機觸發（pre-compaction + post-session） | OpenClaw 設計理念 + Memory Stack | 「壓縮前先存重要事實」+ 「session 結束後完整蒸餾」，兩者互補 |
| Heuristic extraction（regex） | OpenClaw Memory Stack `_extract_heuristic()` | 零 LLM 成本、< 10ms、不阻塞對話 |
| 3-stage distillation（triage → extract → store） | OpenClaw Memory Stack `distill.sh` | Triage 先過濾低價值 session，省 LLM 成本 |
| Importance scoring（1-10） | OpenClaw Memory Stack | 只存 ≥ 4 的 facts，控制記憶膨脹 |
| Supersede 機制 | OpenClaw Memory Stack `facts_insert_structured()` | 舊 fact 不刪除而是存檔，保留 audit trail |
| Entity extraction | LangChain ConversationEntityMemory | 結構化的實體知識比純 facts 更持久 |
| Heuristic fallback | OpenClaw Memory Stack | LLM 不可用時不完全失敗 |
| 記憶注入 budget 限制 | OpenClaw L0/L1/L2 概念 | 避免記憶擠壓 history 的 token 空間 |

**我們不採用的：**

| 不採用 | 來源 | 原因 |
|--------|------|------|
| 5 引擎並行搜索 + RRF | OpenClaw Memory Stack | 過度工程 — Meow 的記憶量不大，簡單 grep 夠用 |
| SQLite FTS5 | OpenClaw Memory Stack | 多一個依賴，Markdown 檔案更簡單 |
| 向量搜索 | OpenClaw / mem0 | Phase 4 再考慮，先用檔案 |
| DAG 壓縮 + PageRank 知識圖譜 | OpenClaw Memory Stack | 複雜度太高，效益不明確 |
| Agent tool call 記憶管理 | MemGPT/Letta | Meow agent 是 subprocess，不支援 |
| mem0 整合 | mem0 | 未來 Phase 4 向量記憶時再評估 |

**一句話：借鏡 OpenClaw 的蒸餾管線和防禦機制，搭配 LangChain 的 entity extraction 概念，用最輕量的方式（regex + background LLM）實現跨 session 記憶。**

---

## 目標

建立雙時機記憶抽取系統：
1. **壓縮前**（pre-compaction）— 輕量 heuristic 快速抓取，不阻塞對話
2. **Session 結束後**（post-session）— 完整 LLM distillation，背景執行

確保跨 session 的記憶乾淨、結構化，且**絕對不影響主對話流程**。

## 調研來源整合

| 來源 | 機制 | 我們採用的部分 |
|------|------|--------------|
| **OpenClaw context-engine** | `compact()` + `afterTurn()` lifecycle + `customInstructions` 參數 | afterTurn 概念 — 每輪結束可做記憶操作；customInstructions 暗示壓縮時可帶自定義指令做 fact extraction |
| **OpenClaw Memory Stack** | 3-stage distill pipeline（triage → extract → store）+ 8 種 fact 類型 + SQLite FTS5 + supersede 機制 + L0/L1/L2 token 控制 + heuristic fallback | **Triage 評分**、**importance scoring**、**supersede 不刪除**、**heuristic fallback**、**post-session hook** |
| **OpenClaw 設計理念** | 上下文快滿前先靜默寫入 Markdown，再做摘要壓縮 | **壓縮前先存重要事實的模式** — Meow 已有壓縮機制，加這一步讓跨 session 記憶更乾淨 |
| MemGPT/Letta | Agent 自主 tool call 管理三層記憶（core/recall/archival） | 記憶分層概念（但 Meow agent 是 subprocess，不支援 tool call） |
| CrewAI | `extract_memories()` 自動拆分 facts + 向量去重 + composite scoring | **fact extraction prompt 設計** |
| LangChain | `ConversationEntityMemory` 每輪抽取實體資訊 | **entity extraction 概念** |
| LangChain | `ConversationSummaryBufferMemory` token 超限觸發 | 已有（compress_history） |
| MassGen | Workspace snapshots + Substantive Gate | **Substantive Gate 判斷是否值得記** |
| mem0 | `memory.add()` / `memory.search()` + LLM 自動 fact extraction + 向量搜索 | 未來 Phase 4 向量記憶的候選方案 |

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
                     │ 雙時機抽取
                     ▼
┌─────────────────────────────────────────┐
│ Layer 3: Long-Term Memory（跨 session）  │
│ - agents/{name}/memory/YYYY-MM-DD.md    │
│ - 事實 + 實體 + 決策                     │
│ - 注入方式：build_prompt() 載入最近 N 天  │
└─────────────────────────────────────────┘
```

### 雙時機觸發設計

```
時機 A: Pre-Compaction（壓縮前，同步，輕量）
─────────────────────────────────────────
compress_history() 偵測到 cache miss（需要重新壓縮）
  ↓
Heuristic extraction（不呼叫 LLM，用 regex）
  ↓
寫入 memory/YYYY-MM-DD.md（append）
  ↓
正常壓縮（不受影響）

時機 B: Post-Session（session 結束後，背景，完整）
─────────────────────────────────────────
WS 連線關閉 or stop 指令
  ↓
asyncio.create_task(distill_session(...))
  ↓
Stage 1: Triage — LLM 評分，低分跳過（借鏡 OpenClaw）
  ↓
Stage 2: Extract — LLM 抽取 facts + entities（帶 importance scoring）
  ↓
Stage 3: Store — 寫入 memory/ + entities.json（supersede 機制）
  ↓
完全背景，不阻塞任何東西
```

### 為什麼兩個時機都要？

| | Pre-Compaction (A) | Post-Session (B) |
|---|---|---|
| 觸發時機 | 壓縮時（對話中） | Session 結束後 |
| 方法 | Regex heuristic | LLM distillation |
| LLM 成本 | 零 | 1 次呼叫 |
| 延遲影響 | 零（regex < 10ms） | 零（background task） |
| 品質 | 中等（抓得到明確的 decided/chose 等） | 高（LLM 理解語義） |
| 覆蓋場景 | 長對話中間壓縮時 | 任何 session 結束 |
| 失敗影響 | 靜默跳過 | 靜默跳過 |

## 實作細節

### 1. Pre-Compaction Heuristic Extraction（時機 A）

**位置：** `history_manager.py` 的 `compress_history()` 裡

借鏡 OpenClaw `_extract_heuristic()`，用 regex 抓明確的決策/偏好/問題模式：

```python
FACT_PATTERNS = [
    (r'(?i)(decided|chose|choosing|picked|selected|went with|確定|決定|選擇)\s+(.{10,200})', 'DECISION'),
    (r'(?i)(remember|note|important|always|never|must|prefer|偏好|注意|記住)\s*:?\s*(.{10,200})', 'PREFERENCE'),
    (r'(?i)(bug|issue|problem|cause|root cause|fix|原因|問題|修正)\s*:?\s*(.{10,200})', 'FINDING'),
    (r'(?i)(todo|action|task|need to|should|待辦|要做)\s*:?\s*(.{10,200})', 'ACTION'),
]

def _heuristic_extract_facts(messages: list) -> list[dict]:
    """Fast regex-based fact extraction — no LLM, < 10ms."""
    facts = []
    seen = set()
    for m in messages:
        if m.get("type") != "message":
            continue
        text = m.get("text", "")
        for pattern, fact_type in FACT_PATTERNS:
            for match in re.finditer(pattern, text):
                fact_text = match.group(0)[:200].strip()
                if fact_text not in seen:
                    seen.add(fact_text)
                    facts.append({"type": fact_type, "text": fact_text, "agent": m.get("agent", "?")})
    return facts
```

**整合點：** 在 `compress_history()` 的 cache miss 路徑，壓縮前呼叫：

```python
# In compress_history(), before calling LLM for summarization:
if new_overflow >= trigger_threshold:
    heuristic_facts = _heuristic_extract_facts(overflow)
    if heuristic_facts:
        _flush_facts_to_memory(session_id, heuristic_facts, agent_workspaces)
    # Then proceed with normal compression...
```

### 2. Post-Session LLM Distillation（時機 B）

**位置：** `routes/ws.py` 的 session 結束時

借鏡 OpenClaw 的三階段 pipeline：

```python
async def distill_session(session_id: str, messages: list, agent_workspaces: dict):
    """Post-session fact distillation. Runs as background task."""
    try:
        # Stage 1: Triage — 是否值得蒸餾？
        score = await _triage_session(messages)
        if score < 4:  # 借鏡 OpenClaw 的 DISTILL_MIN_SCORE
            return

        # Stage 2: Extract — LLM 抽取 facts + entities
        facts = await _llm_extract_facts(messages)
        entities = await _llm_extract_entities(messages)

        # Stage 3: Store — 寫入 memory/
        for agent_name, workspace in agent_workspaces.items():
            _flush_facts_to_memory(session_id, facts, {agent_name: workspace})
            _flush_entities(workspace, entities)
    except Exception as exc:
        logger.warning("Session distillation failed for %s: %s", session_id, exc)
        # 完全靜默 — 不影響任何東西
```

**Triage Prompt：**（借鏡 OpenClaw，但簡化）
```
Rate this conversation 1-10 for durable knowledge content.
Consider: decisions, preferences, architectural choices, bug fixes, action items.
Respond with ONLY a single integer.

Conversation (last 3000 chars):
{tail_of_messages}
```

**Fact Extraction Prompt：**（借鏡 OpenClaw 的 8 類，簡化為 4+4）
```
Extract durable facts from this conversation as a JSON array.
Each fact: {"type": "...", "text": "...", "importance": 1-10, "entities": ["..."]}

Types:
- DECISION: choices made, directions agreed upon
- ACTION: tasks assigned, commitments, deadlines
- FINDING: technical discoveries, bug causes, conclusions
- PREFERENCE: user preferences, constraints, requirements
- WORKFLOW: processes established, patterns agreed
- RELATIONSHIP: who does what, team structure
- CORRECTION: mistakes identified, "do NOT do X"
- CONFIG: configuration details, environment specifics

Rules:
- Each fact must be self-contained and understandable without context
- Skip greetings, small talk, meta-discussion
- Maximum 20 facts
- importance 8-10: critical decisions, hard-won insights
- importance 5-7: useful patterns, preferences
- importance 1-4: minor details (will be filtered out)
- Preserve negations exactly: "We will NOT use MongoDB"
- If nothing worth remembering, return []

Conversation:
{messages_text}
```

**Entity Extraction Prompt：**
```
Extract key entities from this conversation as JSON:
{"entity_name": "description of what we know about this entity"}

Focus on: people, projects, tools, preferences, constraints.
Skip generic terms. Only include entities useful in future conversations.

Conversation:
{messages_text}
```

### 3. 儲存機制

#### Facts 儲存（Markdown append）

```python
def _flush_facts_to_memory(session_id: str, facts: list[dict], agent_workspaces: dict):
    """Write extracted facts to each agent's daily memory file."""
    if not facts:
        return
    today = datetime.now().strftime("%Y-%m-%d")
    timestamp = datetime.now().strftime("%H:%M")
    # Format facts as markdown
    lines = [f"\n## {today} {timestamp} — Session Extract\n"]
    for f in facts:
        importance = f.get("importance", 5)
        if importance < 4:  # 借鏡 OpenClaw DISTILL_MIN_SCORE
            continue
        lines.append(f"- [{f['type']}] {f['text']}")
    if len(lines) <= 1:  # Only header, no facts worth keeping
        return
    content = "\n".join(lines) + "\n"
    # Write to each agent's memory
    for name, workspace in agent_workspaces.items():
        try:
            memory_dir = Path(workspace) / "memory"
            memory_dir.mkdir(parents=True, exist_ok=True)
            path = memory_dir / f"{today}.md"
            with open(path, "a", encoding="utf-8") as f:
                f.write(content)
        except Exception as exc:
            logger.warning("Failed to flush facts for %s: %s", name, exc)
```

#### Entity 儲存（JSON merge + supersede）

借鏡 OpenClaw 的 supersede 機制：新 value 覆蓋舊的，但舊的不刪除（存在 `_archived` key 下）：

```python
def _flush_entities(workspace: str, entities: dict):
    """Merge new entities into entities.json. Supersede, don't delete."""
    if not entities:
        return
    try:
        path = Path(workspace) / "memory" / "entities.json"
        existing = {}
        if path.exists():
            existing = json.loads(path.read_text())
        # Archive superseded values
        archived = existing.pop("_archived", [])
        for key, new_val in entities.items():
            if key in existing and existing[key] != new_val:
                archived.append({"entity": key, "old_value": existing[key],
                                 "superseded_at": datetime.now().isoformat()})
            existing[key] = str(new_val)[:200]
        existing["_archived"] = archived[-50:]  # Keep last 50 archived entries
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(existing, ensure_ascii=False, indent=2))
    except Exception as exc:
        logger.warning("Failed to flush entities: %s", exc)
```

### 4. Memory Injection（build_prompt 修改）

在 `core/prompt.py` 的 `build_prompt()` 中，agent identity 載入後注入：

```python
# Long-term memory injection (budget-limited)
memory_dir = agent["workspace"] / "memory"
if memory_dir.exists():
    # Load recent facts (max 500 chars, most recent first)
    recent_facts = _load_recent_facts(memory_dir, max_chars=500)
    if recent_facts:
        parts.append(f"## Recent Memory\n\n{recent_facts}")

    # Load entity knowledge (max 300 chars)
    entities = _load_entities(memory_dir, max_chars=300)
    if entities:
        parts.append(f"## Known Entities\n\n{entities}")
```

### 5. WS Handler 整合

在 `routes/ws.py` 的 session 結束時觸發 distillation：

```python
# In the finally block of websocket_endpoint():
finally:
    # ... existing cleanup ...
    # Post-session distillation (background, non-blocking)
    if messages and len(messages) > 5:  # Skip trivially short sessions
        agent_ws = {a["name"]: str(a["workspace"]) for a in active_agents}
        asyncio.create_task(_safe_distill(session_id, messages, agent_ws))
```

## Edge Cases & 防禦設計

### 核心原則

**Memory flush 絕對不能影響主對話流程。** 所有路徑都有 fallback 到「不做」。

### Edge Case 完整表

| # | 問題 | 防禦 |
|---|------|------|
| EC-1 | LLM distillation 失敗 | try/except → log warning → 跳過。Pre-compaction heuristic 不依賴 LLM |
| EC-2 | Extraction 阻塞主流程 | Pre-compaction 用 regex（< 10ms）；post-session 用 background task |
| EC-3 | 多 agent 同時寫檔 | Pre-compaction 只在 cache miss 時觸發一次；post-session 在 finally 只呼叫一次 |
| EC-4 | 短對話沒觸發壓縮 | Post-session distillation 覆蓋（session 結束就觸發） + 現有 daily summary |
| EC-5 | 檔案寫入失敗 | Append mode + try/except → log → 繼續 |
| EC-6 | LLM 回傳垃圾 | JSON regex 抽取 + 結構驗證 + importance ≥ 4 過濾 |
| EC-7 | Entity JSON 無效 | Regex 抽取 JSON block + json.loads fallback → 空 dict |
| EC-8 | Fact 重複 | Pre-compaction: seen set 去重；Post-session: 容忍少量重複（append mode 不會壞） |
| EC-9 | 記憶注入太多 | 硬限 facts 500 字 + entities 300 字 |
| EC-10 | 斷線重連後重複 extract | Pre-compaction 跟 compression cache 綁定；Post-session 只在 finally 觸發一次 |
| EC-11 | Triage LLM 不可用 | Heuristic fallback：行數 + 關鍵字計分（借鏡 OpenClaw `_triage_heuristic`） |
| EC-12 | Entity supersede 衝突 | 新覆蓋舊 + 舊值存檔到 `_archived`（borrowing OpenClaw supersede 機制） |

## 三方 Review 結果摘要

### AI Engineer — APPROVE WITH CHANGES
- **必做**：釐清跟現有 `append_memory`/`write_daily_summary` 的關係
- **必做**：`_load_recent_facts` 用 importance-weighted selection
- **必做**：Heuristic regex 加 importance scoring + 收緊 pattern
- 建議：Triage 取 begin+mid+end 不只 tail；entity extraction 要 agent-scoped

### LLMOps — APPROVE WITH CHANGES
- **必做**：distillation 加 60s timeout
- **必做**：加 concurrency semaphore (max 3)
- **必做**：加 structured logging
- **必做**：extraction prompt 截斷輸入 (max 8000 chars)
- 建議：合併 triage+extraction 為 1-2 次 LLM 呼叫；`distillation_model` config key

### CTO — APPROVE WITH CHANGES
- **必做**：Phase 重排 — injection 提前到 Phase 1.5
- **必做**：新模組 `core/memory.py`，不塞 `history_manager.py`
- 建議：Phase 2 拆成 2a/2b；用現有 `call_agent` 不另建 LLM 路徑；砍掉 `_archived`

## Review 後的修改

### 修改 1：跟現有記憶系統的關係（AI Engineer R2）

現有 `agents/{name}/memory/YYYY-MM-DD.md` 有四個 writer：
1. `append_memory()` — 每輪 raw dump
2. `write_daily_summary()` — session 結束時 LLM 摘要
3. 新增：heuristic extraction — 壓縮時 regex 抓取
4. 新增：LLM distillation — session 結束時 LLM 抽取

**決定**：
- `append_memory()` 的 raw dump 移到 `memory/raw/YYYY-MM-DD.md`（分開檔案，不混入結構化 facts）
- `write_daily_summary()` 在 LLM distillation 實作後**降級為 fallback** — 只在 distillation 失敗時才寫
- 結構化 facts 寫入 `memory/YYYY-MM-DD.md`（乾淨、只有 `- [TYPE] text` 格式）

### 修改 2：新模組 core/memory.py（CTO 建議 3）

所有記憶相關邏輯放 `core/memory.py`，不塞 `history_manager.py`：
- `heuristic_extract_facts()`
- `flush_facts_to_memory()`
- `distill_session()`
- `load_recent_facts()`
- `load_entities()`
- `flush_entities()`

`history_manager.py` 只在 `compress_history()` 中呼叫 `core.memory` 的函數。

### 修改 3：Heuristic 加 importance + 收緊 regex（AI Engineer R1）

```python
FACT_PATTERNS = [
    # 要求 keyword 後接 verb+object 結構，避免 "I must consider" 之類的噪音
    (r'(?i)(?:we |team |已)\s*(decided|chose|確定|決定)\s+(?:to\s+)?(.{10,200})', 'DECISION', 7),
    (r'(?i)(?:user |使用者\s*)(prefer|偏好|要求)\s*:?\s*(.{10,200})', 'PREFERENCE', 6),
    (r'(?i)(?:root cause|原因|bug)\s*(?:is|was|：|:)\s*(.{10,200})', 'FINDING', 6),
    (r'(?i)(?:todo|action item|待辦)\s*:?\s*(.{10,200})', 'ACTION', 5),
]
```

### 修改 4：Importance-weighted selection（AI Engineer R3）

```python
def load_recent_facts(memory_dir, max_chars=500):
    # 1. 讀取最近 3 天的 facts
    # 2. 解析每行的 [TYPE] → 推斷 importance（DECISION=7, FINDING=6, etc.）
    # 3. 按 importance DESC, recency DESC 排序
    # 4. 累積到 max_chars 為止
    # 5. Read-time dedup: hash(normalized text) → 跳過重複
```

### 修改 5：Distillation 加 timeout + semaphore + logging（LLMOps C2/C4/C6）

```python
_distill_semaphore = asyncio.Semaphore(3)
_distilling_sessions: set[str] = set()

async def _safe_distill(session_id, messages, agent_ws):
    if session_id in _distilling_sessions:
        return  # 已在進行中
    async with _distill_semaphore:
        _distilling_sessions.add(session_id)
        try:
            await asyncio.wait_for(
                distill_session(session_id, messages, agent_ws),
                timeout=60,
            )
        except asyncio.TimeoutError:
            logger.warning("distill_timeout session=%s", session_id)
        except Exception as exc:
            logger.warning("distill_failed session=%s error=%s", session_id, exc)
        finally:
            _distilling_sessions.discard(session_id)
            logger.info("distill_complete session=%s", session_id)
```

### 修改 6：Extraction prompt 截斷（LLMOps C8）

Triage: 取 first 1000 + middle 1000 + last 1000 chars（AI Engineer R4）
Fact extraction: 截斷到 max 8000 chars
Entity extraction: 截斷到 max 8000 chars

### 修改 7：entities.json 去掉 _archived（CTO 建議 4）

v1 不做 archive，YAGNI。直接覆蓋。

### 修改 8：用現有 call_agent（CTO 建議 6）

Distillation 用 `call_agent()` 而不是新建 LLM 呼叫路徑，跟 `compress_history` 一致。

### 修改 9：distillation_model config（LLMOps C1）

`config.json` 新增 `distillation_model` key，預設 fallback 到 `summarization_model`。

### 修改 10：min_messages configurable（LLMOps C10）

`config.json` 新增 `distill_min_messages`，預設 5。

## 修訂後的實作步驟

### Phase 1: Pre-Compaction Heuristic + Minimal Injection
1. 新建 `core/memory.py`
2. `heuristic_extract_facts()` — 收緊的 regex + importance scoring
3. `flush_facts_to_memory()` — append 寫入 `memory/YYYY-MM-DD.md`
4. `compress_history()` 在 cache miss 時呼叫 heuristic extraction
5. `load_recent_facts()` — importance-weighted selection + read-time dedup
6. `build_prompt()` 注入 `## Recent Memory`（facts only）
7. 修改 `append_memory()` 寫入 `memory/raw/` 子目錄
8. 測試：regex 匹配 + 寫入 + 讀取 + 注入 + 失敗降級

### Phase 2a: Post-Session Triage + Fact Distillation
1. `core/memory.py` 加 `distill_session()` — triage + fact extraction
2. Triage: begin+mid+end sampling + LLM 評分 + heuristic fallback
3. Fact extraction: LLM + 截斷 8000 chars + 格式驗證
4. `routes/ws.py` finally 加 `_safe_distill()`（semaphore + timeout + logging）
5. `config.json` 加 `distillation_model` + `distill_min_messages`
6. 測試

### Phase 2b: Entity Extraction
1. Entity extraction prompt + 截斷
2. `flush_entities()` — JSON merge（無 archive）
3. `load_entities()` — budget-limited
4. `build_prompt()` 注入 `## Known Entities`
5. `write_daily_summary()` 降級為 distillation fallback
6. 測試

### Phase 3: 觀察 & 進階（未來）
- 觀察 extraction 品質，調整 prompt 和 regex patterns
- Token budget 實測（量測 prompt 各部分佔比）
- 考慮 mem0 或 chromadb 做向量記憶
- L0/L1/L2 tiered loading
- 跟 TODO.md 的 Changedoc/Substantive Gate 整合

## 與 TODO.md 的關係

| TODO 項目 | 關聯 |
|-----------|------|
| Changedoc/決策追蹤 | facts 的 `[DECISION]` 覆蓋此需求 |
| 跨 Session 向量記憶 | entities.json + facts 是向量化的來源；mem0 是候選方案 |
| Substantive Gate | Triage 評分機制是 Substantive Gate 的前身 |
| Quality Gate | facts 可記錄 session 的完成狀態 |
| Session 機器可讀狀態 | entities.json 是結構化的 session 知識 |
| 多層 Model 路由 | distillation 用便宜 model（haiku/qwen），不影響主 model 預算 |
