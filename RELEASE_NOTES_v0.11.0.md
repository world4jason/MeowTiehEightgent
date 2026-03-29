# v0.11.0 Release Notes — Memory Flush

**Release Date:** 2026-03-29
**Branch:** `rebirth`
**Previous:** v0.10.0

---

## Highlights

### Pre-Compaction Memory Flush

Agent 不再忘記過去的決策。在對話壓縮前，重要事實先被抽取並儲存。

**雙時機觸發：**
- **壓縮前（regex heuristic）** — 零 LLM 成本，< 10ms，不阻塞對話
- **Session 結束後（LLM distillation）** — 背景執行，3-stage pipeline

### Agent-Scoped Extraction（第一人稱記憶）

每個 agent 現在有自己的記憶，不再共享同一份 facts。

- Claude 記得：「我之前把 onclick 用雙引號包導致 bug，下次要用單引號」
- Gemini 記得：「團隊決定用 Python，我被分配做 research」
- 新 fact 類型：`SELF_CORRECTION`、`FEEDBACK`、`COLLABORATION`

### 多輪 Fact Extraction（GraphRAG 風格）

- Round 1：標準抽取
- Round 2+：「你漏了什麼？」— 補抓隱含決策、跨段落結論、否定式事實
- Config：`extraction_rounds`（預設 1，最多 3）

### 交叉驗證（Anti-Hallucination）

抽取後用不同 model 逐條驗證 facts 是否真的出現在對話中。幻覺 facts 被拒絕並 log。

### MEMORY.md Consolidation

Session 結束後自動把 daily facts 精煉成 consolidated 記憶檔，更新 MEMORY.md 索引。

---

## Architecture

### 記憶模組拆分（SOLID）

`core/memory.py`（1012 行）→ 4 個獨立模組：

```
core/memory_utils.py      (171 行) — 純函數，無副作用
core/session_memory.py    (341 行) — Session Record：triage、全局 extraction、persistence
core/agent_memory.py      (441 行) — Agent Memory：heuristic、scoped extraction、consolidation
core/memory_pipeline.py   (168 行) — 5 stage pipeline + safe_distill
```

### Pipeline Stages

```
distill_session():
  Stage 1: _stage_triage()           — 值不值得蒸餾？
  Stage 2: _stage_global_extract()   — 全局 facts + entities（Session Record）
  Stage 3: _stage_persist_session()  — 寫入 history/{session_id}/
  Stage 4: _stage_agent_memory()     — 每個 agent 第一人稱記憶
  Stage 5: _stage_consolidate()      — 更新 MEMORY.md
```

### Session Record vs Agent Memory

| | Session Record | Agent Memory |
|---|---|---|
| 視角 | 全局第三人稱 | 第一人稱 |
| 位置 | `history/{session_id}/` | `agents/{name}/memory/` |
| 用途 | 回顧、搜索 | 下次 session context |
| Spec | `docs/specs/session-records.md` | `docs/specs/agent-memory.md` |

### 防禦機制

- Semaphore(3) — 最多 3 個同時 distillation
- Timeout(60s) — 防 LLM hang
- Session dedup — 同 session 不重複蒸餾
- 全路徑 try/except — 失敗靜默降級
- Heuristic fallback — LLM 不可用時 regex 降級
- Importance ≥ 4 過濾 — 控制記憶膨脹

---

## 調研

分析了 7+ 個框架/產品的記憶管理：
- OpenClaw Memory Stack 0.5.7（3-stage distillation、supersede、L0/L1/L2）
- MemGPT/Letta（三層記憶）
- CrewAI（extract_memories）
- LangChain（Entity Memory + SummaryBufferMemory）
- fast-graphrag / nano-graphrag / LightRAG（Graph RAG）
- mem0 / cognee / nocturne_memory

Survey: `docs/specs/memory-flush-survey.md`

---

## Test Coverage

- **408 tests**, all passing
- 新增覆蓋：heuristic extraction, memory injection, distillation pipeline,
  cross-validation, multi-round extraction, agent-scoped extraction,
  session persistence, MEMORY.md consolidation, pipeline stages

---

## Configuration

| Key | Default | 說明 |
|-----|---------|------|
| `distillation_model` | fallback to `summarization_model` | Post-session distillation 用的 model |
| `distill_min_messages` | 5 | Session 低於此訊息數不觸發 distillation |
| `extraction_rounds` | 1 | 多輪 fact extraction 輪數（max 3） |

---

## What's Next (from TODO.md)

### 未做

| 項目 | 狀態 | 優先級 |
|------|------|--------|
| 群組協作模式（Arbiter → Blackboard → Pipeline → Swarm） | 未開始 | 中 |
| Quality Gate（Success Contract） | 未開始 | 中 |
| Session 機器可讀狀態（status.json） | 未開始 | 中 |
| Inject-and-Continue | 未開始 | 中 |
| Fairness Gate | 未開始 | 中（等直接 API） |
| 直接 API 支援（Anthropic / OpenAI） | 未開始 | 低 |
| Telegram 整合 | 未開始 | 低 |

### 部分完成

| 項目 | v0.11.0 做了什麼 | 還缺什麼 |
|------|-----------------|---------|
| Changedoc/決策追蹤 | `[DECISION]` facts 覆蓋記錄 | `[RATIONALE]` 即時注入 |
| 多層 Model 路由 | `distillation_model` 是第一個用例 | 通用的 per-task routing |
| 跨 Session 向量記憶 | facts + entities 是結構化來源 | 向量搜索（Graph RAG 或 mem0） |

### UI 改善（PM 建議）

1. Agent Settings 加記憶檢視器
2. Distillation 完成時 WS 通知
3. Settings UI 加 `distillation_model` 設定
4. 記憶修正 UI（編輯/刪除 facts）
