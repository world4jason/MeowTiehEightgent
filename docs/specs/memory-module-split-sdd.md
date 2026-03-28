# SDD: core/memory.py 模組拆分

**Date:** 2026-03-29
**Status:** Draft — 待架構師 + CTO review
**Current:** `core/memory.py` 906 行，混合 Session Record + Agent Memory + 共用工具

---

## 問題

`core/memory.py` 違反 SRP（Single Responsibility Principle）：
1. **Session-level** 的全局 fact/entity extraction + persistence
2. **Agent-level** 的第一人稱記憶 extraction + storage + injection + consolidation
3. **共用工具** — message 格式化、LLM response parsing、fact 去重

這三個職責混在 906 行裡，導致：
- 改 agent memory 邏輯可能影響 session persistence
- 測試無法獨立跑（session 和 agent 的 test 互相依賴）
- 未來加 agent-scoped extraction 會讓檔案更臃腫

## 拆分方案

```
core/
├── memory_utils.py      ← 共用工具（純函數，無副作用）
├── session_memory.py    ← Session Record（全局，第三人稱）
└── agent_memory.py      ← Agent Memory（per-agent，第一人稱）
```

刪除 `core/memory.py`，由以上三個取代。

### core/memory_utils.py（~150 行）

**職責：** 純工具函數，無 IO、無 LLM 呼叫、無副作用。

```python
# 從 memory.py 搬入：
_format_fact_line()           # fact → markdown 格式
_flatten_message_texts()      # messages → text list
_sample_messages_text()       # begin+mid+end sampling
_truncate_messages_text()     # 截斷到 max chars
_parse_llm_facts_response()   # JSON response → validated facts list
_triage_heuristic()           # keyword + line count scoring

# 常數：
FACT_PATTERNS                 # regex patterns
_TYPE_IMPORTANCE              # type → importance mapping
_MAX_FACT_TEXT_LEN, _MAX_FACT_TYPE_LEN, etc.
_MIN_IMPORTANCE_THRESHOLD
_TRIAGE_KEYWORDS
```

**不依賴：** 不 import app、不做 IO、不呼叫 LLM。純 CPU 計算。

### core/session_memory.py（~200 行）

**職責：** Session-level 記錄（全局，第三人稱）。寫入 `history/{session_id}/`。

```python
# 從 memory.py 搬入：
_triage_session()             # LLM triage + heuristic fallback
_llm_extract_facts()          # 多輪全局 fact extraction
_llm_extract_entities()       # 全局 entity extraction
_cross_validate_facts()       # 幻覺交叉驗證
_persist_session_memory()     # 寫入 history/{session_id}/facts.json + entities.json

# Pipeline:
distill_session()             # 全局 pipeline（triage → extract → validate → persist）
safe_distill()                # semaphore + timeout + dedup wrapper
_distill_semaphore            # module-level state
_distilling_sessions          # module-level state
```

**依賴：** `memory_utils`（parsing）、`app`（call_agent, load_config, HISTORY_DIR）

### core/agent_memory.py（~250 行）

**職責：** Agent 第一人稱記憶。寫入/讀取 `agents/{name}/memory/`。

```python
# 從 memory.py 搬入：
heuristic_extract_facts()     # regex extraction（pre-compaction）
flush_facts_to_memory()       # append to memory/YYYY-MM-DD.md
load_recent_facts()           # importance-weighted loading
flush_entities()              # entities.json merge
load_entities()               # entities.json reading
_consolidate_agent_memory()   # LLM consolidation → consolidated-*.md
_update_memory_index()        # MEMORY.md index update
CONSOLIDATE_PROMPT            # prompt template
MEMORY_INDEX_SECTION          # section header constant

# 新增（未來）：
_agent_scoped_extract()       # 第一人稱 extraction（帶 agent identity）
```

**依賴：** `memory_utils`（parsing, constants）、`app`（call_agent, AGENTS_DIR）

## 依賴關係

```
memory_utils.py  ← 純函數，不依賴任何東西
     ↑
     ├── session_memory.py  ← import memory_utils
     └── agent_memory.py    ← import memory_utils
```

不允許 `session_memory` 和 `agent_memory` 互相 import。

## distill_session 拆分

目前 `distill_session()` 同時做 session 和 agent 的工作。拆分後：

```python
# core/session_memory.py
async def distill_session(session_id, messages, agent_workspaces, model_config):
    # Stage 1: Triage
    # Stage 2: Global fact + entity extraction
    # Stage 2.5: Cross-validation
    # Stage 3: Persist to Session Record
    # Stage 4: Delegate to agent memory
    from core.agent_memory import process_agent_memories
    await process_agent_memories(messages, agent_workspaces, global_facts, global_entities, model_config)

# core/agent_memory.py
async def process_agent_memories(messages, agent_workspaces, global_facts, global_entities, model_config):
    for agent_name, ws in agent_workspaces.items():
        # Per-agent: flush facts, flush entities, consolidate MEMORY.md
        # 未來：agent-scoped extraction
```

## app.py re-export 策略

```python
# app.py — 維持向後相容
from core.session_memory import distill_session, safe_distill, ...
from core.agent_memory import heuristic_extract_facts, flush_facts_to_memory, load_recent_facts, ...
from core.memory_utils import FACT_PATTERNS, _parse_llm_facts_response, ...
```

所有 test 的 `import app as a; a.xxx` 不需要改。

## Test 拆分

```
test_api.py 裡的 memory tests → 拆出到：
├── tests/test_memory_utils.py      ← 純函數測試
├── tests/test_session_memory.py    ← session pipeline 測試
└── tests/test_agent_memory.py      ← agent memory 測試
```

保留 `test_api.py` 裡的 integration tests 不動（它測 compress_history + build_prompt 的整合）。

## 實作順序

1. 建 `core/memory_utils.py` — 搬純函數 + 常數
2. 建 `core/session_memory.py` — 搬 session 相關
3. 建 `core/agent_memory.py` — 搬 agent 相關
4. 更新 `app.py` re-exports
5. 跑 390 tests 確認全 pass
6. 建 `tests/test_memory_utils.py` — 搬純函數測試
7. 建 `tests/test_session_memory.py` — 搬 session 測試
8. 建 `tests/test_agent_memory.py` — 搬 agent 測試
9. 跑全部 tests 確認
10. 刪除 `core/memory.py`

## SOLID 原則檢查

| 原則 | 檢查 |
|------|------|
| **S**ingle Responsibility | ✅ 每個模組一個職責 |
| **O**pen/Closed | ✅ agent_memory 可擴展（加 agent-scoped extract）不影響 session |
| **L**iskov Substitution | N/A |
| **I**nterface Segregation | ✅ 消費者只 import 需要的模組 |
| **D**ependency Inversion | ✅ memory_utils 是純函數，session/agent 都依賴它而不是互相依賴 |
