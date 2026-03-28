# Agent Memory 設計文件

**Date:** 2026-03-29
**Scope:** Agent 長期記憶系統 — 每個 agent 自己的跨 session 記憶

---

## 定義

Agent Memory 是每個 agent **自己的第一人稱記憶**。它記錄「我經歷了什麼、我學到了什麼、我不該再犯什麼錯」。

## 與 Session Record 的區別

| | Agent Memory | Session Record |
|---|---|---|
| 視角 | **第一人稱** — 跟我有關的 | 第三人稱 — 所有人的 |
| 歸屬 | `agents/{name}/memory/` | `history/{session_id}/` |
| 問題 | 「我下次該記得什麼？」 | 「這場對話發生了什麼？」 |
| 抽取 | **Agent-scoped** — 只抽跟這個 agent 有關的 | 全局 — 抽所有人的 |
| 注入 | 只給這個 agent 自己 | Resume 時給所有人 |
| 生命週期 | 持久累積，定期整理 | Session 結束後定型 |

## 檔案結構

```
agents/{name}/
├── MEMORY.md           ← 索引：指向記憶檔案的 links
├── memory/
│   ├── 2026-03-29.md   ← 當日 facts（heuristic + LLM distilled）
│   ├── consolidated-2026-03-29.md  ← LLM 彙整後的精煉記憶
│   ├── entities.json   ← 這個 agent 相關的實體知識
│   └── raw/
│       └── 2026-03-29.md  ← 每輪原始 append_memory dump
├── AGENT.md
├── IDENTITY.md
└── SOUL.md
```

## Agent-Scoped Extraction

### 核心差異：不是所有 facts 都跟每個 agent 有關

**Session facts（全局）：**
```
- [DECISION] 決定從 v0.9.0 開出 rebirth branch
- [FINDING] app.py 原本 2973 行
- [PREFERENCE] 使用者偏好 zh-TW 介面
- [CORRECTION] onclick 引號衝突 bug
```

**Claude agent 的 memory（第一人稱）：**
```
- [DECISION] 我們決定回歸 Python backend（我負責的部分）
- [CORRECTION] 我之前把 onclick 用雙引號包，造成 JSON.stringify 衝突，要用單引號
- [PREFERENCE] 使用者偏好 zh-TW，我回應時要用中文
```

**Gemini agent 的 memory（第一人稱）：**
```
- [DECISION] 團隊決定回歸 Python backend
- [PREFERENCE] 使用者偏好 zh-TW
```
（Gemini 不需要記 onclick bug，因為那不是它做的）

### 抽取 Prompt（Agent-Scoped）

```
You are {agent_name}. Review this conversation and extract facts
relevant to YOU specifically.

Focus on:
- Decisions that affect your work or responsibilities
- Feedback directed at you (things you should do differently)
- Mistakes YOU made that you should not repeat
- User preferences that affect how YOU should respond
- Knowledge about other agents that helps you collaborate

Do NOT extract:
- Facts about other agents' internal errors (not your concern)
- General project history that doesn't affect your behavior
- Things already in your AGENT.md or IDENTITY.md

Output as JSON array:
[{"type": "...", "text": "...", "importance": 1-10}]

Your identity:
{agent_identity}

Conversation:
{messages}
```

### Agent Memory 的特殊類別

除了通用的 8 種 fact type，Agent Memory 額外關注：

| 類別 | 說明 | 範例 |
|------|------|------|
| **SELF_CORRECTION** | 我犯的錯，下次不能再犯 | 「我把 onclick 用雙引號包導致 bug」 |
| **FEEDBACK** | 使用者或其他 agent 給我的反饋 | 「使用者說不要自動填入 textbox」 |
| **COLLABORATION** | 跟其他 agent 的互動模式 | 「Gemini 擅長做 research，我擅長寫 code」 |

## 抽取時機

```
Session 結束後（distill_session 內）
  ↓
全局 extraction（現有）→ facts → Session Record
  ↓
Per-agent extraction（新增）→ agent-scoped facts → Agent Memory
  ↓
Consolidation → MEMORY.md 索引更新
```

## 注入方式

在 `build_prompt()` 中，只注入**這個 agent 自己的**記憶：

```python
# 現有（不變）
memory_dir = agent["workspace"] / "memory"
recent_facts = load_recent_facts(memory_dir, max_chars=500)
entities = load_entities(memory_dir, max_chars=300)
```

每個 agent 的 `memory/` 只包含跟自己有關的 facts，所以注入自然是 scoped 的。

## 目前狀態 vs 目標

### 已實作（v0.11.0）
- ✅ facts 寫入 `memory/YYYY-MM-DD.md`
- ✅ entities 寫入 `memory/entities.json`
- ✅ `load_recent_facts()` importance-weighted injection
- ✅ MEMORY.md consolidation + 索引更新
- ⚠️ **但 facts 是全局的，沒有 agent-scoped filtering**

### 待實作
- [ ] Agent-scoped extraction prompt（per agent，帶 agent identity）
- [ ] `SELF_CORRECTION` / `FEEDBACK` / `COLLABORATION` 額外類別
- [ ] 每個 agent 的 entities.json 只包含跟自己相關的實體
- [ ] MEMORY.md 的 consolidation 用貴 model，帶 agent 第一人稱視角

## 未來擴展

- Agent-level knowledge graph（`memory/knowledge.graph`）
- 跨 session 語義搜索（用 agent 自己的記憶做 retrieval）
- Agent 自主記憶管理（MemGPT 風格，但不需 tool call）
- 記憶衝突解決（兩個 agent 對同一件事有不同記憶）
