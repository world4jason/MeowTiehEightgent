# Session Records 設計文件

**Date:** 2026-03-29
**Scope:** 對話記錄系統 — 記錄每次 session 的完整歷史和結構化摘要

---

## 定義

Session Record 是一次對話的**全局紀錄**，不屬於任何單一 agent。它記錄「這場對話發生了什麼」。

## 與 Agent Memory 的區別

| | Session Record | Agent Memory |
|---|---|---|
| 視角 | 第三人稱、全局 | 第一人稱、agent 自己 |
| 歸屬 | `history/{session_id}/` | `agents/{name}/memory/` |
| 內容 | 所有人說了什麼、做了什麼決定 | 我學到什麼、我該記住什麼 |
| 用途 | 回顧、搜索、resume | 下次 session 的 context |
| 去重 | 不需要（每個 session 獨立） | 需要（跨 session 累積） |
| 更新 | Session 結束後寫入，不再修改 | 持續累積、定期整理 |

## 檔案結構

```
history/{session_id}/
├── messages.json      ← 原始訊息（已有）
├── summary.json       ← 壓縮摘要 cache（已有）
├── facts.json         ← session 內抽取的全局 facts（已實作）
├── entities.json      ← session 內抽取的 entities（已實作）
└── session.graph      ← 未來：session-level 知識圖譜
```

## facts.json 格式

```json
[
  {
    "type": "DECISION",
    "text": "決定從 v0.9.0 開出 rebirth branch",
    "importance": 7,
    "agent": "llm-distill"
  }
]
```

全局視角 — 不區分是誰提出的，只記錄「這場對話中做了什麼決定」。

## entities.json 格式

```json
{
  "rebirth": "從 v0.9.0 分支出來的 branch，回歸 Python 單後端",
  "FastAPI": "Python web framework，用於 Chat 後端"
}
```

全局視角 — 記錄這場對話中提到的所有重要實體。

## 抽取方法

**時機：** Session 結束後（`distill_session()` Stage 4: `_persist_session_memory()`）

**來源：** `_llm_extract_facts()` 和 `_llm_extract_entities()` 的結果直接寫入

**不做額外處理** — Session record 是原始的全局 extraction 結果，不做 agent-scoped filtering。

## 用途

1. **Resume session** — 重新開啟舊對話時，可載入 facts/entities 作為 context
2. **搜索** — 未來：跨 session 搜索特定決策或 entity
3. **報告** — 生成 session 摘要報告
4. **審計** — 追溯過去的決策和討論

## 未來擴展

- `session.graph` — session-level 知識圖譜，記錄 entity 之間的關係
- 跨 session 搜索（BM25 或向量搜索 `facts.json`）
- Session 比較（diff 兩次 session 的 facts）
