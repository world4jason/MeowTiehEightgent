# Survey: Pre-Compaction Memory Flush 方案比較

**Date:** 2026-03-29
**Purpose:** 調研各框架的 agent 長期記憶管理機制，為 MeowTiehEightgent 設計 pre-compaction fact extraction 功能。

---

## 1. MemGPT / Letta（UC Berkeley）

**核心概念：** 模仿 OS 的虛擬記憶體，用分層記憶管理突破 context window 限制。

### 記憶層級

| 層級 | 用途 | 位置 | 大小 |
|------|------|------|------|
| **Core Memory** | 關鍵事實（人物資訊、偏好） | 常駐 context window | 小（~2K tokens） |
| **Recall Memory** | 對話歷史搜索 | DB（外部） | 無限 |
| **Archival Memory** | 長期知識儲存 | DB（外部） | 無限 |

### 記憶操作（Agent 主動呼叫）

- `core_memory_append(label, content)` — 追加核心記憶
- `core_memory_replace(label, old, new)` — 修改核心記憶
- `archival_memory_insert(content)` — 存入長期記憶
- `archival_memory_search(query)` — 搜索長期記憶
- `conversation_search(query)` — 搜索對話歷史

### 關鍵設計

- **Agent 自主管理記憶** — 不是系統自動抽取，而是 agent 透過 tool call 主動決定什麼值得記住
- **System prompt 指導** — 告訴 agent「你的記憶有限，重要的事情要主動存到 archival」
- **心跳機制** — agent 可以呼叫 `heartbeat` 獲得額外思考步驟，用於記憶整理
- **Context eviction** — 舊對話被移出 context 前，系統提供機會讓 agent 先存重要資訊

### 適用性評估

- 優點：agent 自主性高，記憶品質好
- 缺點：依賴 agent 能力，需要 tool call 支援，增加 API 成本
- **對 Meow 的啟發：** 可以在 `build_prompt` 裡加入記憶管理指令，但 Meow 的 agent 是 subprocess（CLI），不支援 tool call，需要用不同方式實現

---

## 2. CrewAI

**核心概念：** 統一 Memory class，自動抽取 + 向量搜索 + 重要性評分。

### 記憶機制

| 機制 | 說明 |
|------|------|
| **extract_memories()** | 將原始文本拆分為離散事實（fact statements） |
| **remember()** | 儲存記憶，LLM 自動推斷 scope/category/importance |
| **recall()** | 複合評分檢索：語義相似度 + 時間衰減 + 重要性 |
| **forget()** | 刪除記憶 |

### 自動化

- **任務完成時** — 自動從 output 抽取事實
- **任務開始前** — 自動 recall 相關記憶注入 prompt
- 去重：相似度 > 0.85 自動合併
- 背景執行緒非阻塞儲存

### 儲存

- 預設 LanceDB（向量 DB），存在 `.crewai/memory/`
- 支持自定義 backend

### 適用性評估

- 優點：全自動，不需 agent 主動操作
- 缺點：依賴向量 DB，增加基礎設施複雜度
- **對 Meow 的啟發：** `extract_memories()` 的概念最直接可用 — 在壓縮前用 LLM 抽取 fact statements

---

## 3. Microsoft AutoGen

**核心概念：** Memory protocol + 向量 DB 整合，但沒有 pre-compaction 機制。

### 記憶系統

- `ListMemory` — 簡單按時間排列
- `ChromaDBVectorMemory` — 語義搜索
- `RedisMemory` — 分散式向量 DB
- `Mem0Memory` — 第三方持久記憶

### 注入方式

- 檢索的記憶作為 system message 追加到 agent context
- 格式：`"Relevant memory content (in chronological order): [numbered list]"`

### 適用性評估

- **沒有 pre-compaction fact extraction** — 記憶是手動 add 的，不是自動從對話抽取
- **對 Meow 的啟發：** 記憶注入格式可參考，但機制不適用

---

## 4. LangChain

**核心概念：** 多種 Memory class，ConversationSummaryBufferMemory 最接近 pre-compaction。

### 相關 Memory 類型

| 類型 | 機制 |
|------|------|
| `ConversationBufferMemory` | 全量保留（會爆） |
| `ConversationSummaryMemory` | 全部摘要化 |
| `ConversationSummaryBufferMemory` | **混合：最近 N 條保留原文，舊的摘要化** |
| `ConversationEntityMemory` | 抽取實體（人名、概念）及其資訊 |
| `ConversationKGMemory` | 抽取知識圖譜三元組 |

### ConversationEntityMemory 的 Fact Extraction

- 使用 LLM prompt：「從這段對話中，提取關於 {entity} 的新資訊」
- 儲存為 key-value：entity → description
- 每輪對話後自動更新

### ConversationSummaryBufferMemory

- 當 token 數超過 `max_token_limit` 時觸發
- 將最舊的訊息摘要化，保留最新的
- 摘要 prompt：「Progressively summarize the conversation, adding onto the previous summary」

### 適用性評估

- **ConversationEntityMemory 的實體抽取** 很接近 fact extraction
- **SummaryBufferMemory 的漸進式摘要** 跟 Meow 現有的 `compress_history` 很像
- **對 Meow 的啟發：** 在 compress 前先跑一次 entity/fact extraction，存入 agent memory

---

## 5. OpenClaw Memory Stack 0.5.7（實際 source code 分析）

**來源：** `openclaw-memory-stack-0.5.7`（商業產品，$49 one-time，proprietary license）
**核心概念：** 5 引擎並行搜索 + 3-stage distillation + L0/L1/L2 token 控制

### 架構總覽

```
┌─ SEARCH PIPELINE（每輪對話觸發）─────────────────┐
│  E1: Full-text (FTS5)                            │
│  E2: Vector (QMD)                                │
│  E3: DAG 壓縮歷史                                │
│  E4: Fact Store (SQLite structured)              │
│  E5: Markdown 掃描                               │
│        → RRF Rank Fusion → Reranking             │
│        → L0 (~100t) / L1 (~800t) / L2 (full)    │
└──────────────────────────────────────────────────┘
┌─ CAPTURE（每輪/session 結束後）───────────────────┐
│  Fact Extraction (8 types, importance 1-10)       │
│  Entity Tracking (queryable)                     │
│  Dedup & Supersede (3-level)                     │
└──────────────────────────────────────────────────┘
```

### 3-Stage Distillation Pipeline（`lib/distill.sh`）

**Stage 1: Triage** — 先評估 session 是否值得蒸餾
- LLM 評分 1-10（model: `qwen2.5:7b`，本地 Ollama）
- 低於閾值（預設 4）直接跳過
- LLM 不可用時有 **heuristic fallback**：用 regex 找 `decided/chose/prefer/bug/config` 等關鍵字 + 行數加分

**Stage 2: Extract** — LLM 抽取原子事實
- 輸出格式：`[{fact, importance: 1-10, tags: [...]}]`
- 最多 20 個 facts
- 截斷到 12000 chars
- LLM 不可用時有 **heuristic fallback**：regex 抓 decision/preference/bugfix/config 模式
- 結果驗證：JSON 解析 + 結構校驗（必須有 `fact` 欄位）

**Stage 3: Store** — 寫入 Total Recall 或 daily markdown
- 每個 fact 一個 slug 檔案
- 格式：Markdown（`# Distilled Fact\n\n{fact}\n\nTags: {tags}\nExtracted: {timestamp}`）

### Structured Facts SQLite（`lib/facts.sh`）

- **DB 路徑：** `~/.openclaw/memory/facts.sqlite`
- **Schema：** `id, type, content, key, value, scope, confidence, entities, timestamp`
- **FTS5 全文搜索**：`facts_fts` 表
- **8 種 fact 類型：** decisions, deadlines, requirements, entities, preferences, workflows, relationships, corrections
- **Supersede 機制：** 同 `type+key` 的新 fact 會把舊的存入 `facts_archive`（保留 audit trail），再插入新的
- **去重：** exact value match → 跳過；different value → archive + replace

### L0/L1/L2 Tiered Loading（`lib/tiered-loading.sh`）

| Tier | Token 預算 | 內容 | 取得方式 |
|------|-----------|------|---------|
| L0 | ~100 | 一句話摘要 | Heuristic（首行非空/非標題文字）或 LLM |
| L1 | ~2000 | 概要（~500 字） | Heuristic（前 N chars 截斷到段落邊界）或 LLM |
| L2 | 完整 | 原文 | grep 搜索 |

- Sidecar 檔案：`.abstract`（L0）、`.overview`（L1）存在同目錄
- Auto-expand：L0 相關度 score ≥ threshold → 自動升級到 L1/L2
- LLM 生成 tier 時有 heuristic fallback

### 其他設計

- **Cross-agent sharing：** CLI API（`query/add/recent`）+ Drop zone（`~/.openclaw/memory/external/`）
- **Self-healing：** 24h maintenance cycle，自動重建 index、archive stale facts
- **License：** 7 天 re-verify，10 天 offline grace period
- **LLM：** 優先本地（Ollama/MLX），fallback 到 OpenAI API（可選）

### 適用性評估

- **我們採用的：**
  - 3-stage distillation pipeline 結構（triage → extract → store）
  - Heuristic fallback（LLM 不可用時 regex 降級）
  - Importance scoring（1-10，低於 4 不存）
  - Supersede 概念（新覆蓋舊，不刪除）
  - Post-session hook 觸發時機（不阻塞對話）
  - 截斷輸入到 LLM（12000→8000 chars）
- **我們不採用的：**
  - 5 引擎並行 + RRF（過度工程，Meow 記憶量不大）
  - SQLite FTS5（多依賴，Markdown 檔案夠用）
  - L0/L1/L2 sidecar 檔案（未來 Phase 4 再考慮）
  - DAG 壓縮 + PageRank 知識圖譜（複雜度太高）
  - Cross-agent CLI API（Meow 的 agent 共用同一個 session，不需跨 agent 通訊記憶）

---

## 6. Claude Code

**核心概念：** 檔案式記憶，手動 + 自動觸發。

### 記憶機制

- `~/.claude/projects/{project}/memory/` — 專案級記憶
- MEMORY.md 索引 + 獨立記憶檔案
- 記憶類型：user、feedback、project、reference
- **觸發：** 使用者明確要求 or agent 觀察到值得記住的事

### 適用性評估

- 檔案格式（YAML frontmatter + Markdown body）值得參考
- 但沒有 pre-compaction 自動機制

---

## 比較矩陣

| 框架 | 自動抽取 | 抽取時機 | 儲存格式 | Agent 主動 | Pre-compaction |
|------|---------|---------|---------|-----------|---------------|
| MemGPT/Letta | ❌ | Agent tool call | DB | ✅ | ✅（agent 驅動） |
| CrewAI | ✅ | 任務完成時 | 向量 DB | ❌ | ❌ |
| AutoGen | ❌ | 手動 add | 向量 DB | ❌ | ❌ |
| LangChain Entity | ✅ | 每輪對話後 | Key-Value | ❌ | ❌ |
| LangChain Summary | ✅ | Token 超限 | Text | ❌ | ✅（隱含） |
| OpenClaw | ✅ | Context 將滿 | Markdown | ❌ | ✅ |
| Claude Code | ❌ | 手動/觀察 | Markdown | ✅ | ❌ |
| **Meow 現狀** | **✅（摘要）** | **訊息超過 N 輪** | **JSON** | **❌** | **❌** |

---

## 推薦方案：Meow Pre-Compaction Memory Flush

### 設計原則

1. **在壓縮前先抽取** — 不依賴 agent tool call（Meow 的 agent 是 subprocess）
2. **用 LLM 抽取** — 不用向量 DB，保持簡單
3. **寫入 Markdown** — 利用現有的 `agents/{name}/memory/` 結構
4. **增量式** — 每次只抽取新增對話的事實，不重複處理

### 流程

```
compress_history() 被觸發（訊息超過 max_rounds）
  ↓
Step 1: extract_facts()（新增）
  - 取得即將被壓縮的舊訊息
  - LLM prompt:「從以下對話中抽取重要事實、決策、待辦事項。
    只抽取值得跨 session 記住的資訊。」
  - 輸出格式：每行一個事實
  ↓
Step 2: flush_to_memory()（新增）
  - 將抽取的事實追加到 agents/{name}/memory/YYYY-MM-DD.md
  - 去重：跟現有記憶比對，跳過重複
  ↓
Step 3: compress（現有）
  - 執行原本的摘要壓縮
  - 摘要取代舊訊息
```

### Fact Extraction Prompt（草稿）

```
You are reviewing a multi-agent conversation segment that is about to be compressed.
Extract ONLY facts worth remembering across sessions:

- Key decisions made
- Important preferences or constraints discovered
- Action items or commitments
- Technical findings or conclusions
- Entity relationships (who does what, who wants what)

Output one fact per line, prefixed with "- ".
Skip small talk, greetings, and meta-discussion about the conversation itself.
If nothing is worth remembering, output "NONE".

Conversation segment:
{messages_to_compress}
```

### 記憶注入（build_prompt 修改）

在 `build_prompt()` 中，agent 的 `memory/` 檔案已經透過 AGENT.md 的指令被讀取。
額外可以主動注入最近的記憶摘要：

```python
# In build_prompt(), after loading AGENT.md:
memory_dir = agent["workspace"] / "memory"
if memory_dir.exists():
    recent_memories = load_recent_memories(memory_dir, max_files=3)
    if recent_memories:
        parts.append(f"## Recent Memory\n\n{recent_memories}")
```

### 實作步驟

1. 在 `history_manager.py` 加 `extract_facts(messages, model)` 函數
2. 在 `compress_history()` 裡，壓縮前先呼叫 `extract_facts()`
3. 將結果寫入 `agents/{speaker}/memory/YYYY-MM-DD.md`
4. 在 `build_prompt()` 加入 recent memory 注入
5. 加測試
