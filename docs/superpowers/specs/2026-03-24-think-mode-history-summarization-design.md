# Think Mode Model Switching + History Summarization 設計

> Date: 2026-03-24
> Status: Draft
> Scope: Feature 1 (Think Mode model_tiers) + Feature 2 (History Summarization Phase 2) + TODO cleanup

---

## 背景

### 現狀

**Think Mode：** Claude 的 `--effort max` flag 已正確實作，`agents/claude/config.json` 已有 `supports_thinking: true`。但 Gemini 的 `supports_thinking: false`，UI toggle 無效果。Gemini 的 thinking 模式需要換 model（`gemini-2.5-pro`），非 flag 方式。

**History：** 已有兩層 filter：
1. `apply_sliding_window()` — 保留最近 30 輪訊息（`max_history_rounds`）
2. `truncate_history()` — 字元截斷 80KB（`max_history_chars`），加 `[... 較早對話已省略 ...]`

問題：截斷後舊對話直接消失，agent 失去早期上下文。TODO 要求 Phase 2 用輕量 model 將舊段落壓縮為摘要快照。

### 參考

- MassGen `ContextCompressor`：獨立 memory module，pre-injection 壓縮，pluggable 策略
- TODO.md line 88-93：閾值與策略可在 session 設定或全域 config 控制
- TODO.md line 142-147：多層 Model 路由 `model_tiers: { default, thinking, arbiter }`

---

## Feature 1: Think Mode — model_tiers + 通知

### Agent Config 變更

```json
// agents/gemini/config.json
{
  "model": "gemini",
  "supports_thinking": true,
  "model_tiers": { "default": "gemini", "thinking": "gemini-2.5-pro" }
}
```

```json
// agents/claude/config.json — 不需要 model_tiers，用 --effort max flag
{
  "model": "claude",
  "supports_thinking": true
}
```

`model_tiers` 是 optional dict。key 是場景名，value 是 `config.json` models 裡的 model key。目前支援 `thinking`，未來可擴展 `arbiter` 等。

### Backend 邏輯（`stream_cli_agent`）

優先級：
1. `mode == "think"` + `model_tiers.thinking` 存在 → 查 `config.json` models 取 thinking model 的 `cmd`、`idle_timeout` 等，用它跑 subprocess
2. `mode == "think"` + 無 `model_tiers` + `supports_thinking: true` → 走現有 `--effort max` 路徑
3. 其他 → 正常 chat mode

Thinking model 找不到（key 不在 models 裡）→ fallback 原 model + log warning，不 crash。

### WS 通知

Think mode 切換時，送 system message 到聊天室：

```json
{"type": "system", "text": "🧠 Gemini 已切換至思考模式 (gemini-2.5-pro)"}
{"type": "system", "text": "💬 Gemini 已切換至對話模式"}
```

只在使用 `model_tiers` 切換（真的換了 model）時通知。Claude 的 `--effort max` 不需通知（同 model，只是加 flag）。

### Settings UI

AgentsTab 編輯 agent 時：
- `supports_thinking` checkbox
- 若 `supports_thinking: true`，顯示 "思考模式 Model" 下拉選單（從 models list 拉）
- 選擇後存入 `model_tiers.thinking`

### 測試重點

- `model_tiers.thinking` 存在時，subprocess 用 thinking model 的 cmd
- `model_tiers.thinking` 不存在 + `supports_thinking` → `--effort max`
- thinking model key 不在 models → fallback + warning
- WS system message 只在 model_tiers 切換時送出
- Settings UI 正確讀寫 model_tiers

---

## Feature 2: History Summarization（Phase 2）

### 全域 Config

```json
// config.json
{
  "summarization_model": "haiku",
  "summary_trigger_threshold": 10
}
```

- `summarization_model`：必填，未設定則不啟用 summarization（退回現有 truncation）
- `summary_trigger_threshold`：新溢出訊息數超過此值才觸發重新壓縮（預設 10）

Settings UI 提示使用者必須選一個 model 才能啟用。

### Per-Session 覆寫

```json
// history/{session_id}/session_config.json
{
  "max_history_rounds": 50,
  "summary_trigger_threshold": 5
}
```

讀取優先級：session_config > 全域 config > hard default。

### Cache 格式

```json
// history/{session_id}/summary.json
{
  "summary_text": "摘要內容...",
  "covered_message_count": 45,
  "total_message_count": 75,
  "updated_at": "2026-03-24T10:00:00"
}
```

### 獨立函數（MassGen ContextCompressor 風格）

```python
async def compress_history(
    session_id: str,
    messages: list,
    window_size: int,
    summary_model: str,
    trigger_threshold: int,
) -> tuple[str, list]:
    """
    回傳 (summary_prefix, windowed_messages)
    - summary_prefix: 壓縮摘要文字（或空字串）
    - windowed_messages: sliding window 內的訊息
    """
```

呼叫點在 `build_prompt` 之前，取代現在分散的 `apply_sliding_window()` + `truncate_history()` 呼叫。`truncate_history()` 保留作為硬上限 fallback（雙保險）。

### 觸發流程

```
每輪開始
  → compress_history(session_id, messages, window_size, summary_model, threshold)
    → sliding_window 分出 window 內 + window 外
    → window 外 == 0 → 回傳 ("", windowed)
    → 讀 summary.json
      → 存在且 (total_message_count - covered_message_count) < threshold
        → 沿用舊摘要
      → 不存在 or 新溢出 >= threshold
        → 呼叫 summarization_model 壓縮 window 外全部 → 寫入 summary.json
    → 回傳 (summary_text, windowed)

  → history_text = summary_prefix + format(windowed_messages)
  → truncate_history(history_text, max_history_chars)  ← 硬上限 fallback
```

### 壓縮 Prompt

```
請閱讀以下多人對話，先判斷對話性質，再據此摘要。

如果是任務導向對話（有明確目標、計畫、技術討論）：
  → 保留關鍵決策、結論、每位參與者的主要觀點、未解決問題

如果是自由閒聊：
  → 忠實摘要對話脈絡，保留每位參與者的語氣和立場

用自然敘述，控制在 500 字以內。

{overflow_messages_text}
```

LLM 自行判斷對話性質，無需 metadata 驅動。

### Subprocess 呼叫

複用現有 `stream_cli_agent` 邏輯，用 `summarization_model` 的 cmd 執行。同步等待完整結果（不需要 streaming UI）。若壓縮 subprocess 失敗 → 退回 truncation 行為，不阻塞主流程。

### 效能考量

- 大部分輪次直接讀 summary.json cache，不呼叫 model
- 壓縮用便宜 model，預估延遲 2-5 秒
- 若 summary.json 存在且未達 threshold，零額外成本
- 壓縮失敗不阻塞 — fallback 到現有 truncation

### 測試重點

- window 外 == 0 → 不觸發壓縮
- 新溢出 < threshold → 沿用舊 summary.json
- 新溢出 >= threshold → 呼叫 model 壓縮、更新 summary.json
- 壓縮 subprocess 失敗 → fallback truncation
- per-session config 覆寫全域
- summary_prefix 正確插入 history_text 開頭
- truncate_history 仍在最後作為硬上限
- summarization_model 未設定 → 不啟用，退回 truncation

---

## Feature 3: TODO.md 清理

### 移入已完成

- Line 38 Bug（Think mode flag）— `--effort max` 已正確、`supports_thinking: true` 已在 claude config
- Line 42-44 History Phase 1 — `apply_sliding_window()` + `truncate_history()` 已實作
- Line 46-49 Agent 發言傾向 — 2/3 已完成（`--effort max` 修好、claude config 已有），只留 Gemini model 切換（本次實作）
- Line 95-99 Subprocess 斷線復原 — 與 line 24 重複
- Line 126-129 Protected Paths — 與 line 26 重複
- Line 131-133 圖片 --add-file — 與 line 25 重複

### 合併

- Line 42-44 + 88-93 合併為一條，Phase 1 標完成，Phase 2 改為本次實作

---

## 異動檔案預估

| 檔案 | 變更 |
|------|------|
| `app.py` | `stream_cli_agent` model_tiers 邏輯、`compress_history` 函數、WS system message |
| `agents/gemini/config.json` | `supports_thinking: true`、`model_tiers` |
| `config.json` | `summarization_model`、`summary_trigger_threshold` |
| `ui/src/chat/settings/AgentsTab.tsx` | thinking model 下拉選單 |
| `ui/src/chat/hooks/useSettingsApi.ts` | model_tiers 讀寫 |
| `test_api.py` | compress_history 測試、model_tiers 測試 |
| `TODO.md` | 清理重複/過時項目 |
