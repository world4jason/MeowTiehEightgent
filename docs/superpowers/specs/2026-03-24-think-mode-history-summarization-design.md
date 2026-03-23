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

### Backend 邏輯（`stream_agent` / `stream_cli_agent`）

**Model 解析時機：Runtime（在 `stream_agent` 入口）。** 不在 `get_agent_registry()` 預解析，因為 mode 是動態的。

流程：
1. `stream_agent(agent, prompt, mode)` 入口，若 `mode == "think"` 且 `agent.model_tiers.thinking` 存在：
   - 從 `load_config()["models"]` 查 thinking model key
   - 找到 → 用 thinking model 的 `cmd`、`idle_timeout`、`startup_timeout` 等覆蓋 agent dict（淺 copy，不改原 agent）
   - 找不到 → fallback 原 model + `logger.warning`，不 crash
2. `mode == "think"` + 無 `model_tiers` + `supports_thinking: true` → 走現有 `--effort max` 路徑
3. 其他 → 正常 chat mode

注意：若 thinking model 是 API type（如 Ollama），`stream_agent` 已有 CLI/API 路由，自動走 `stream_api_agent`。但 `stream_api_agent` 目前不支援 `mode` 參數，thinking flag 會被靜默忽略。本次 scope 只處理 CLI type 的 thinking model（Gemini CLI）。API type thinking 支援留待未來。

**前置條件：** `gemini-2.5-pro` 必須先在 `config.json` models 中註冊。Settings UI 的 thinking model 下拉選單只列現有 models，引導使用者先建 model 再選。

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

Settings UI 提示使用者必須選一個 model 才能啟用。`summarization_model` 的值必須是 `config.json` models 中已註冊的 key（與 `model_tiers` 相同前置條件）。

### Per-Session 覆寫

```json
// history/{session_id}/session_config.json
{
  "max_history_rounds": 50,
  "summary_trigger_threshold": 5
}
```

讀取優先級：session_config > 全域 config > hard default。

Per-session config 的 UI 編輯暫不實作（本次 scope 外）。Power user 可手動編輯 JSON。未來可在 Chat header 或 session settings 加 UI。

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

**呼叫點：** 在 WS 主迴圈的每輪 agent 回合（約 app.py line 2198 附近），`build_prompt` 之前。

**訊息來源：** 目前架構在每輪結束時把新訊息 append 到 `messages.json`。`compress_history` 需要完整訊息列表，因此每輪呼叫前先從 `messages.json` 重新載入（或維護 in-memory list 同步 append）。推薦做法：**在 session loop 維護 `all_messages: list` in-memory**，每次 append 新訊息同時寫檔，避免每輪重讀 IO。`compress_history` 直接接收這個 list。

`truncate_history()` 保留作為硬上限 fallback（雙保險）。

### 觸發流程

```
每輪 agent 回合
  → compress_history(session_id, all_messages, window_size, summary_model, threshold)
    → overflow = all_messages[:-window_size]  (window 外)
    → windowed = all_messages[-window_size:]  (window 內)
    → len(overflow) == 0 → 回傳 ("", windowed)
    → 讀 summary.json
      → 存在：new_overflow = len(overflow) - summary.covered_message_count
        → new_overflow < threshold → 沿用舊摘要，但更新 total_message_count
        → new_overflow >= threshold → 呼叫 summarization_model 壓縮 overflow → 寫入 summary.json
      → 不存在 → 呼叫 summarization_model 壓縮 overflow → 寫入 summary.json
    → 回傳 (summary_text, windowed)

  → 呼叫端格式化：
    history_text = summary_prefix + "\n".join(f"[{m['agent']}]: {m['text']}" for m in windowed)
  → truncate_history(history_text, max_history_chars)  ← 硬上限 fallback
```

**資料邊界：** `compress_history` 接收結構化 `messages: list[dict]`，回傳 `(summary_text: str, windowed_messages: list[dict])`。呼叫端負責將 `windowed_messages` 格式化為 `history_text` 字串（與現有 format 邏輯一致），再傳給 `build_prompt`。這保持 compress_history 只做壓縮邏輯，不碰格式化。

**注意：** 即使沿用舊摘要，也更新 `summary.json` 的 `total_message_count`，確保下次 threshold 判斷正確。

### 壓縮 Prompt

```
請閱讀以下多人對話，先判斷對話性質，再據此摘要。

如果是任務導向對話（有明確目標、計畫、技術討論）：
  → 保留關鍵決策、結論、每位參與者的主要觀點、未解決問題

如果是自由閒聊：
  → 忠實摘要對話脈絡，保留每位參與者的語氣和立場

用自然敘述，控制在 500 字以內。請用對話中的主要語言撰寫摘要。

{overflow_messages_text}
```

LLM 自行判斷對話性質，無需 metadata 驅動。

### Subprocess 呼叫

透過 `stream_agent()` dispatch（已有 CLI/API 路由），用 `summarization_model` 的設定執行。收集完整輸出後回傳（不需要 streaming UI）。若壓縮 subprocess 失敗（timeout / crash / empty output）→ 退回現有 truncation 行為，不阻塞主流程。

**並行安全：** 若多個 WS 連線同時觸發同一 session 的壓縮，採 last-write-wins。summary.json 是 cache 性質，不需要嚴格一致性。

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

- Line 38 Bug（Think mode flag）— `--effort max` 已正確、`supports_thinking: true` 已在 claude config。Gemini model 切換由本次 Feature 1 實作，完成後才可完全標完成
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
| `app.py` | `stream_agent` model_tiers runtime 解析、`compress_history` 函數、WS `set_mode` handler 加 system message |
| `agents/gemini/config.json` | `supports_thinking: true`、`model_tiers` |
| `config.json` | `summarization_model`、`summary_trigger_threshold` |
| `ui/src/chat/settings/AgentsTab.tsx` | thinking model 下拉選單 |
| `ui/src/chat/hooks/useSettingsApi.ts` | model_tiers 讀寫 |
| `test_api.py` | compress_history 測試、model_tiers 測試 |
| `TODO.md` | 清理重複/過時項目 |
