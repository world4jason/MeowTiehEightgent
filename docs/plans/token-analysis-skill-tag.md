# Plan: Token 深度分析面板 + Skill Validated Tag

**Date:** 2026-03-30
**Status:** Draft — 待 CTO + Backend review

---

## Feature 1: Token 消耗深度分析

### 問題

Token 面板目前只顯示 per-agent 的 input/output token 總數。使用者不知道 token 花在哪 — prompt 裡多少是 identity、多少是 history、多少是 skills、多少是 memory。B5 修掉後 skill 從 21K 降到 300 chars，但使用者看不到這個改善。

### 設計

在 Token 面板加一個 prompt breakdown，顯示最近一次 prompt 的組成：

```
Prompt 組成（最近一輪）
──────────────────
Agent Identity    1.2K  ████████  28%
History           2.1K  ██████████████  48%
Skills (summary)  0.3K  ██  7%
Memory            0.5K  ███  11%
Other             0.3K  ██  6%
──────────────────
Total             4.4K
```

### 後端改動

`build_prompt()` 在組裝 prompt 時記錄每個 section 的字元數，回傳一個 breakdown dict：

```python
# core/prompt.py
def build_prompt(...) -> str:
    # 現有邏輯不變，但追蹤每段長度
    ...
    # 在 prompt 組裝完後，存 breakdown 到 agent dict（暫存）
    agent["_prompt_breakdown"] = {
        "identity": len_identity,
        "history": len_history,
        "skills": len_skills,
        "memory": len_memory,
        "other": len_other,
        "total": len(context),
    }
    return context
```

WS handler 在 `message_end` 時把 breakdown 一起送：

```python
# routes/ws.py — message_end 時
_msg_end["prompt_breakdown"] = agent.get("_prompt_breakdown")
```

### 前端改動

Token 面板（`renderRunsPanel`）加一個 breakdown section，從最近的 `message_end` 的 `prompt_breakdown` 讀取並渲染為 bar chart。

### 實作步驟

1. `build_prompt()` 追蹤每段長度，存到 `agent["_prompt_breakdown"]`
2. `routes/ws.py` 在 `message_end` 附上 `prompt_breakdown`
3. 前端 `handleMessage` 的 `message_end` handler 存 breakdown
4. `renderRunsPanel()` 加 breakdown bar chart
5. 測試

---

## Feature 2: Skill Validated Tag

### 問題

任何人可以在 `skills/` 放 SKILL.md，但沒有機制標記哪些 skill 經過驗證（品質、安全性、正確性）。使用者不知道哪些 skill 可信。

### 設計

在 SKILL.md frontmatter 加 `validated` 欄位：

```yaml
---
name: brainstorming
description: Creative brainstorming framework
validated: true
validated_by: Jason
validated_at: 2026-03-30
---
```

- `validated: true` — 標示 ✅ 已驗證
- `validated: false` 或未設定 — 標示 ⚠️ 未驗證
- Settings 技能 tab 和 prompt 注入時顯示 tag

### 後端改動

`parse_skill()` 已經解析 frontmatter，只需要把 `validated` 欄位加入回傳的 dict：

```python
# core/skills.py — parse_skill()
# frontmatter 已經被解析，加入 validated 欄位
result["validated"] = meta.get("validated", False)
result["validated_by"] = meta.get("validated_by", "")
result["validated_at"] = meta.get("validated_at", "")
```

`GET /skills` 和 `GET /skills/{slug}` 回傳時包含 `validated` 欄位。

`build_prompt()` 的 skill summary 加 validated 標記：

```
- **/brainstorming** ✅ — Creative brainstorming framework
- **/my-custom-skill** ⚠️ — Untested custom skill
```

### 前端改動

Settings 技能 tab 的卡片加 validated badge：
- ✅ 綠色 badge（validated: true）
- ⚠️ 黃色 badge（未驗證）

### 實作步驟

1. `core/skills.py` parse_skill() 加 `validated` 欄位
2. `core/prompt.py` skill summary 加 ✅/⚠️ 標記
3. `GET /skills` 回傳 validated
4. 前端技能 tab 加 badge
5. 測試

---

## 風險

| 風險 | 緩解 |
|------|------|
| prompt_breakdown 增加 message_end payload | 只多 ~100 bytes JSON |
| _prompt_breakdown 存在 agent dict（暫存） | 每輪覆蓋，不累積 |
| validated tag 需要手動標記 | 初始值 false，不影響現有 skill |
