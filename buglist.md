# Bug List

## 修復中

### B5 — Prompt bloat: Skill 全文注入導致每輪 24K chars
**現象：** Claude 回應變慢，每輪 prompt 24K chars，其中 85%（~21K）是 3 個 skill 的 SKILL.md 全文。Session 越長越慢，接近 context limit。
**原因：** `build_prompt()` 把 agent 所有 skills 的全文直接塞進 prompt，每輪都送。
**修法：** Skill lazy-load — 預設只注入 skill 名稱+一句描述（~100 chars），agent 用 `/skill-name` 指令時才載入全文。類似 OpenClaw L0/L1/L2 tiered loading。
**影響：** 24K → ~4K chars，回應速度和 token 成本大幅改善。

## 已修復

- **B1** — `@mention` regex 吃掉中文助詞 → 改用已知 agent list 精確匹配
- **B2** — Agents 不知道 `@name` convention → `_default/AGENT.md` + claude/gemini AGENT.md 加說明
- **B3** — 新 agent 加入時 history 沒有 join event → `handle_member_event` 插入 `[System]: X joined`
- **B4** — Agent 名稱不支援中文 → 放寬 `POST /agents` 驗證，改為禁 `/\\.\s` 而非白名單

---

## 待修

### B1 — `@mention` regex 吃掉中文助詞
**現象：** `@小黑的意見如何` 匹配到 `小黑的意見` 而非 `小黑`。
**原因：** `\w+` 在 Python 會匹配連續中文字，把後面的助詞也吃進去。
**修法：** `extract_mention` 改成對照已知 agent name list 做精確匹配（最長優先）。

### B2 — Agents 不知道 `@name` tagging convention
**現象：** AGENT.md 沒有說明如何 tag 其他 agent，agent 可能不會用 `@小白` 格式。
**修法：** `_default/AGENT.md` 加說明：用 `@AgentName` tag 特定對象。

### B3 — 新 agent 加入時 history_text 沒有 join event
**現象：** 小綠加入後，其他 agent 的 participants header 會更新，但 history 裡沒有顯示「小綠剛加入」，對話脈絡斷裂。
**修法：** `handle_member_event` 裡 `add_agent` 成功後，在 `history_text` 插入 `[System]: 小綠 joined the conversation`。

### B4 — Agent 名稱不支援中文（建立時被 regex 擋掉）
**現象：** `POST /agents` 驗證 `r'^[a-zA-Z0-9_-]+$'`，小黑、小白等中文名無法建立。
**修法：** 放寬驗證到允許 Unicode 字母，同時對路徑做安全處理（禁 `/`、`.`、空白）。
