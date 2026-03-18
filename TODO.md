# TODO

## 已完成

- [x] 聊天室 add-agent / remove-agent 指令（Members panel + sidebar 新增/移除）
- [x] `@AgentName` 提及功能（插隊優先回答，drop 當輪其餘人，下輪從被 @ 者開始）
- [x] 多人對話隨機 pass（人數少時強制輪，pass 後講話機率上升）
- [x] Workspace 長期情境（config、files、session 歸屬、context injection、settings UI）
- [x] WebSocket 自動重連（斷線 3 秒後 resume_from 重建）
- [x] Session pagination（/sessions limit/offset，sidebar 「載入更多」按鈕）
- [x] Session 圖片 lightbox（點縮圖開 overlay，ESC / 點外關閉）
- [x] FastAPI lifespan（取代 deprecated @app.on_event）
- [x] WebSocket rate limit（每 IP 最多 3 條連線）
- [x] Session 重命名（雙擊 sidebar inline 編輯）
- [x] Agent 發言統計（members panel 顯示 ×N）
- [x] 圖片附件 Vision（thumbnail chip、base64 WS 傳輸、--add-file CLI、session 持久化）
- [x] Streaming 輸出（逐字打字效果）
- [x] Session 搜尋（sidebar 即時 filter）
- [x] Message 複製按鈕
- [x] Export（Markdown / JSON / PDF）
- [x] Client-side message queue（Cursor-style，agent 思考中可繼續輸入、編輯、排序）
- [x] Model variant 選擇（--model flag per agent）
- [x] @filename 注入 workspace 文件全文

---

## 待辦

### 中優先

- [ ] **Scenario（短期情境模板）**
  開新對話選 scenario（辯論、brainstorming、創作…），自動填 system prompt + 建議 agents + 預設協作模式。
  welcome screen 三選項：workspace / scenario / 空白。

- [ ] **Agent 發言傾向（chat / think）**
  個體行為維度，per-agent 或全場切換。
  - 預設 chat 傾向：prompt 注入「回答限 2-3 句」，可搭配輕量 model。
  - think / analysis 模式：CLI 傳 `--extended-thinking` 或切換 model，不限字數。
  - 對話中 `/think` 切換全場，或個別 agent config 設定預設傾向。
  - agent config 加 `supports_thinking: bool`（claude 支援，gemini 待確認）。

- [ ] **群組協作模式（Cowork Pattern）**
  集體結構維度，與發言傾向正交可任意組合。調研報告：`docs/analysis/cowork-patterns-research.md`

  **Arbiter（先做）**
  - 每 N 輪後 invoke 一次 arbiter subprocess，帶評審 rubric
  - 輸出 JSON：`{ "verdict": "accept" | "revise" | "needs_human", "feedback": "..." }`
  - 硬限最多 3 輪修訂（防止振盪迴圈）
  - 用便宜 model（如 haiku），只評不生成
  - 一定要解析驗證 verdict，不能靠字串比對

  **Blackboard（第二）**
  - 現有 flat history 已是原始黑板，加結構化 header 即可：
    `[SHARED STATE] current_plan / key_decisions / open_questions [/SHARED STATE]`
  - 傳給 subprocess = header + 最近 N 輪（不傳全部，解決 overflow）
  - Orchestrator 讀 header 決定下一個 agent

  **Pipeline（第三）**
  - Subprocess 間用 JSON 交接：`{ "stage": "...", "output": "...", "status": "ok" | "failed" }`
  - Orchestrator 收到 failed 立即停止，不繼續往下傳
  - 鏈的長度控制在 5 以內（每加一個 stage 降低整體成功率）
  - Subprocess 結束後是天然 human interrupt 插入點

  **Swarm / Selector（最後）**
  - Subprocess 不支援 tool-calling，handoff 改成 output parsing：最後一行輸出 `HANDOFF: agent_name`
  - Selector LLM 只傳最近 3-5 則 + agent descriptions（不傳全部 history）
  - 保留現有 probabilistic silence 作為 selector 失敗時的 fallback
  - Agent description 欄位是 routing 關鍵（比 system_message 重要）

  **所有 Pattern 共用：無限迴圈防護**
  - 硬性 max round count（絕對上限）
  - 停滯偵測：連續兩輪同 agent 輸出相似 → 強制終止或路由到 human
  - 每 3-5 步插入 verification checkpoint（不是加更多 agents）

- [ ] **History 自動壓縮（Auto-Condensing）**
  Session 越長 history_text 線性增長，每輪 `-p` 傳輸量與延遲同步上升。
  - **Phase 1（Sliding Window）**：保留最近 N 輪完整訊息，超過閾值直接丟棄舊訊息。成本低，先止血。
  - **Phase 2（Summarization）**：超過閾值時用輕量 model 將舊段落壓縮成摘要快照，插在 history 開頭。
  閾值與策略可在 session 設定或全域 config 控制。

- [ ] **圖片 --add-file 相容性**
  codex 等不支援 --add-file 的 CLI 收到無用 args。
  agent/model config 加 `supports_image: bool`，只有支援的才傳。

### 低優先 / 探索中

- [ ] **直接 API 支援（Anthropic / OpenAI）**
  目前只走 CLI subprocess（claude/gemini/codex）。若改支援直接 API call，可省去 CLI 安裝需求，降低 latency，也讓非開發者更容易部署。
  - 參考 MassGen 的 LLMBackend 架構：每個 provider 一個 class，繼承統一介面。
  - 可先從 Anthropic SDK 開始，作為 claude CLI 的 fallback。

- [ ] **Telegram 整合**
  Bot token 管理 + message relay 到 WebSocket session。
