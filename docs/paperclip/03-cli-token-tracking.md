# CLI Token 追蹤機制深挖

> 問題：Paperclip 怎麼知道 CLI agent 用了多少 token？
> 答案：每個 CLI 都有 JSON output flag，Paperclip parse stdout 的 JSONL event stream。

---

## 核心流程

```
Paperclip heartbeat service
  → 呼叫 CLI（帶 --output-format stream-json）
  → CLI 輸出 JSONL event stream 到 stdout
  → Paperclip 的 adapter parse.ts 解析每一行
  → 從 result / turn.completed event 抓 usage 欄位
  → heartbeat.ts 呼叫 costService.createEvent() 寫入 DB
```

---

## 三個 CLI 的詳細機制

### Claude CLI

**呼叫方式：**
```bash
claude --print - --output-format stream-json --verbose
```

**輸出格式（JSONL，每行一個 JSON）：**
```jsonl
{"type":"system","subtype":"init","session_id":"abc123","model":"claude-opus-4-5"}
{"type":"assistant","message":{"content":[{"type":"text","text":"..."}]},"session_id":"abc123"}
{"type":"result","session_id":"abc123","usage":{"input_tokens":14,"cache_read_input_tokens":1900000,"output_tokens":3421},"total_cost_usd":0.0012,"result":"..."}
```

**Token 來源：** 最後一行 `type=result` event
```ts
// packages/adapters/claude-local/src/server/parse.ts
const usageObj = parseObject(finalResult.usage);
const usage: UsageSummary = {
  inputTokens: asNumber(usageObj.input_tokens, 0),
  cachedInputTokens: asNumber(usageObj.cache_read_input_tokens, 0),
  outputTokens: asNumber(usageObj.output_tokens, 0),
};
const costUsd = finalResult.total_cost_usd;  // 有！
```

**特點：**
- 有 `total_cost_usd`（直接告訴你花了多少錢）
- `cache_read_input_tokens` 可能非常大（prompt caching）
- session_id 從 `system init` event 取得，可供下次 resume

---

### Gemini CLI

**呼叫方式：**
```bash
gemini --output-format stream-json [其他參數]
```

**輸出格式（JSONL）：**
```jsonl
{"type":"assistant","message":{"content":[...]}}
{"type":"step_finish","usage":{"usageMetadata":{"promptTokenCount":45,"candidatesTokenCount":312,"cachedContentTokenCount":0}}}
{"type":"result","usage":{"usageMetadata":{...}},"total_cost_usd":0.0005}
```

**Token 來源：** 多個 event 都有 usage，必須**累加**
```ts
// packages/adapters/gemini-local/src/server/parse.ts
function accumulateUsage(target, usageRaw) {
  const usageMetadata = parseObject(usage.usageMetadata);
  const source = Object.keys(usageMetadata).length > 0 ? usageMetadata : usage;
  target.inputTokens += asNumber(source.input_tokens,
    asNumber(source.inputTokens, asNumber(source.promptTokenCount, 0)));
  target.cachedInputTokens += asNumber(source.cached_input_tokens,
    asNumber(source.cachedInputTokens, asNumber(source.cachedContentTokenCount, 0)));
  target.outputTokens += asNumber(source.output_tokens,
    asNumber(source.outputTokens, asNumber(source.candidatesTokenCount, 0)));
}

// 在 result 和 step_finish 兩種 event 都會呼叫 accumulateUsage
```

**特點：**
- Gemini 用 `usageMetadata` 而非 `usage`（欄位命名不同）
- 欄位名是 `promptTokenCount` / `candidatesTokenCount`（不是 `input_tokens`）
- 需要累加多個 event，不只看最後一行
- `step_finish` event 也有 usage（multi-turn 場景）
- 也有 `total_cost_usd`

---

### Codex CLI（OpenAI）

**呼叫方式：**
```bash
codex exec --json [其他參數]
```

**輸出格式（JSONL）：**
```jsonl
{"type":"thread.started","thread_id":"thread_abc"}
{"type":"item.completed","item":{"type":"agent_message","text":"..."}}
{"type":"turn.completed","usage":{"input_tokens":45,"cached_input_tokens":0,"output_tokens":289}}
```

**Token 來源：** `type=turn.completed` event
```ts
// packages/adapters/codex-local/src/server/parse.ts
if (type === "turn.completed") {
  const usageObj = parseObject(event.usage);
  usage.inputTokens = asNumber(usageObj.input_tokens, usage.inputTokens);
  usage.cachedInputTokens = asNumber(usageObj.cached_input_tokens, usage.cachedInputTokens);
  usage.outputTokens = asNumber(usageObj.output_tokens, usage.outputTokens);
}
```

**特點：**
- `thread_id` 是 Codex 的 session 概念
- **沒有 `total_cost_usd`**，費用要自己用 token 數 × 定價計算
- 欄位名是 `input_tokens` / `cached_input_tokens`（和 Claude 相同）

---

## 彙整對比表

| | Claude | Gemini | Codex |
|---|---|---|---|
| **JSON Flag** | `--output-format stream-json` | `--output-format stream-json` | `exec --json` |
| **Token 來自哪個 event** | `result` | `result` + `step_finish`（累加）| `turn.completed` |
| **input 欄位名** | `input_tokens` | `promptTokenCount` | `input_tokens` |
| **cache 欄位名** | `cache_read_input_tokens` | `cachedContentTokenCount` | `cached_input_tokens` |
| **output 欄位名** | `output_tokens` | `candidatesTokenCount` | `output_tokens` |
| **有 cost_usd？** | 有（`total_cost_usd`）| 有（`total_cost_usd`）| **沒有** |
| **session 欄位** | `session_id`（init event）| `session_id` / `checkpoint_id` / `thread_id` | `thread_id` |

---

## Cost Event 寫入流程（heartbeat.ts）

```
adapterResult.usage
  → normalizeUsageTotals()（統一欄位名稱）
  → resolveNormalizedUsageForSession()
      （如果是 session 累計 token，做 delta 計算）
  → 只有 tokens > 0 或 costCents > 0 才寫入
  → costService.createEvent()
      → 更新 agent.spentMonthlyCents
      → 更新 company.spentMonthlyCents
      → 評估是否觸發 budget 警告/硬停
```

還有另一個入口：**agents 可以主動 POST `/companies/:id/cost-events`** 回報自己的費用（只能回報自己的，403 if agentId 不符）。

---

## 對你的專案：如何實作

你的 `run_agent()` 目前拿到純文字。改動很小：

**Claude（最簡單）：**
```python
# 在呼叫 claude CLI 時加 flag
args = ["claude", "--print", "-", "--output-format", "stream-json", "--verbose"]

# parse 最後一行 type=result 的 JSON
for line in stdout.split('\n'):
    event = json.loads(line)
    if event.get('type') == 'result':
        usage = event.get('usage', {})
        input_tokens = usage.get('input_tokens', 0)
        cached_tokens = usage.get('cache_read_input_tokens', 0)
        output_tokens = usage.get('output_tokens', 0)
        cost_usd = event.get('total_cost_usd', 0)
```

**Gemini：**
```python
# 累加所有有 usage 欄位的 event
total_input = total_cached = total_output = 0
for line in stdout.split('\n'):
    event = json.loads(line)
    metadata = event.get('usage', {}).get('usageMetadata', event.get('usage', {}))
    total_input += metadata.get('promptTokenCount', 0)
    total_cached += metadata.get('cachedContentTokenCount', 0)
    total_output += metadata.get('candidatesTokenCount', 0)
```

**Codex：**
```python
# 找 turn.completed event
for line in stdout.split('\n'):
    event = json.loads(line)
    if event.get('type') == 'turn.completed':
        usage = event.get('usage', {})
        input_tokens = usage.get('input_tokens', 0)
        # 無 cost_usd，需自己計算
```

> 注意：加了 `--output-format stream-json` 後，你的 streaming 顯示邏輯要改從 `type=assistant` event 的 `message.content` 取文字，而不是直接顯示 raw stdout。
