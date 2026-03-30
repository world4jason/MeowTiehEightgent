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
- [x] Subprocess 斷線復原（partial_output 暫存、SubprocessCrashError / TimeoutError 結構化錯誤、自動 skip 並繼續）
- [x] `supports_image` flag（codex 預設 false，`_resolve_supports_image()` 優先級鏈，guard --add-file injection）
- [x] Protected Paths（PROTECTED_FILENAMES、validate_filename() 保護 config/AGENT.md 等核心檔案）
- [x] Scenario 模板（GET /scenarios、welcome screen 三選項、scenario_system_prompt 注入）
- [x] per-agent chat/think mode toggle UI（Members panel、WS set_mode / mode_update、/think /chat TUI 指令）
- [x] 3-way context mode toggle + scenario picker
- [x] Skill source namespace（parse_skill frontmatter source:、list_skills / get_skill expose display_name、resolve_human_text 支援 source:slug）
- [x] Think mode flag 修正（`--effort max` 已正確、`supports_thinking: true` 已在 claude config、Gemini model_tiers 已實作）
- [x] History 自動壓縮 Phase 1（`apply_sliding_window()` + `truncate_history()` 已實作）
- [x] Agent 發言傾向 backend fix（`--effort max` 修好、claude config 已有、Gemini model_tiers 已實作）
- [x] Subprocess 斷線復原（partial_output 暫存已完成，與 line 24 重複）
- [x] Protected Paths Workspace（validate_filename() 已完成，與 line 26 重複）
- [x] 圖片 --add-file 相容性（`supports_image` flag 已完成，與 line 25 重複）

### v0.10.0 (rebirth)
- [x] 回歸 Python 單後端（JS/Node.js 移至 deprecated/）
- [x] Scenario 選擇 UX 修正（onclick 引號 bug、綠框選中、解耦 agent）
- [x] Settings「情境」Tab（CRUD）
- [x] Mini Kanban 討論看板（drag & drop、agent 感知）
- [x] app.py 重構 2973 → 418 行（core/ + routes/ 模組化）
- [x] 踢人時中斷正在回應的 agent subprocess

### v0.11.0 (memory flush)
- [x] Pre-compaction heuristic extraction（regex，零 LLM 成本）
- [x] Post-session LLM distillation（3-stage: triage → extract → store）
- [x] 多輪 fact extraction（GraphRAG 風格，config: extraction_rounds）
- [x] 交叉驗證幻覺（用不同 model 逐條驗 facts）
- [x] Agent-scoped extraction（第一人稱記憶，帶 agent identity）
- [x] Entity extraction + JSON merge
- [x] Memory injection in build_prompt（500 chars facts + 300 chars entities）
- [x] Session Record 持久化（history/{id}/facts.json + entities.json）
- [x] MEMORY.md consolidation（索引更新，不覆蓋）
- [x] append_memory 路徑分離（memory/raw/）
- [x] write_daily_summary 降級為 distillation fallback
- [x] core/memory.py 拆分為 4 個 SOLID 模組（memory_utils + session_memory + agent_memory + memory_pipeline）
- [x] Pipeline 拆為 5 個獨立 stage function
- [x] 移除 DEFAULT_*_MD 硬編碼（agents/_default/ 為唯一 source of truth）

---

## 待辦

### 中優先

- [x] **History 自動壓縮 Phase 2（Summarization）**
  使用輕量 model 壓縮溢出訊息為摘要，cache 在 summary.json。含 model_tiers think mode、摘要卡片 UI、壓縮進度通知、手動重壓縮、think mode badge。
  Spec: `docs/superpowers/specs/2026-03-24-think-mode-history-summarization-design.md`
  Plan: `docs/superpowers/plans/2026-03-24-think-mode-history-summarization.md`

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
  - **Substantive Gate（增量漂移偵測）**：借鑑 MassGen。把輸出變動分三類：
    - Structural：解決核心邏輯或修復重大問題 → 繼續
    - Transformative：引入全新方法論 → 繼續
    - Incremental：只微調描述或格式 → 標記，累積太多輪強制終止
  - 停滯偵測：連續多輪只有 Incremental 變動 → 標記 `decision_space_exhausted`，強制終止或路由到 human
  - 每 3-5 步插入 verification checkpoint（不是加更多 agents）

- [ ] **Quality Gate（Success Contract）**
  Arbiter Pattern 的延伸：為特定 session 設定明確的「完成條件」，而非靠輪次限制。
  - 借鑑 MassGen 的 success contract：agent 在輸出中標記 `STATUS: done | needs_revision | blocked`。
  - Orchestrator 讀 STATUS：全部 done → session 可標記完成；有 blocked → 路由到 human。
  - 適用場景：任務型 session（如撰寫計畫書、程式碼審查），自由對話不需要。

- [~] **Changedoc / 決策追蹤（借鑑 MassGen）**
  **部分完成（v0.11.0）：** facts 的 `[DECISION]` 類別已覆蓋決策記錄。尚缺 `[RATIONALE]` 即時注入。
  - 最輕量做法：agent 在輸出末尾加可選的 `[RATIONALE]: ...` 區塊，orchestrator 解析並貼入下輪 prompt header。
  - 效果：讓投票/共識不只看表象（誰說了什麼），還看邏輯依據（為什麼這樣說）。
  - 適用場景：任務型 session，自由對話可能太重。

- [ ] **Session 機器可讀狀態（status.json）**
  供外部監控 / automation 讀取的即時 JSON，每輪更新：
  - `phase`：當前輪次、哪個 agent 在說話
  - `agents`：per-agent 狀態（waiting / streaming / done / error）
  - `vote_distribution`：如果有 Arbiter 機制，顯示評審結果
  - 放在 `history/<session_id>/status.json`，WebSocket 也可以廣播。

- [ ] **Inject-and-Continue（注入繼續）**
  借鑑 MassGen：當 agent A 完成輸出後，不等整輪結束就立即把 A 的輸出注入 agent B 的下一輪 prompt。
  - 目前行為：每輪結束後才更新 history，B 要等下輪才看到 A 說了什麼。
  - 改善方向：A 輸出後立即更新 shared history，B 在同輪就能讀到 A，減少「資訊延遲」。
  - 注意：我們的架構是循序的，天然比 MassGen 更新鮮；但若多 agent 同時 streaming，這個機制更關鍵。

- [ ] **跨 Session 向量記憶（Memory MCP）**
  **v0.11.0 已鋪路：** facts + entities.json 是向量化的結構化來源。目前用 grep + 最近 3 天。
  - 候選方案：nano-graphrag（PoC）→ fast-graphrag（生產級）→ LightRAG（進階）
  - 或 mem0 SDK 做向量搜索
  - Survey: `docs/specs/memory-flush-survey.md`、`docs/devlog/2026-03-29.md` (Graph RAG 調研)
  - 實作路線：embedding + 本地向量庫（如 chromadb、faiss）+ 在 build_prompt 時查詢並注入。
  - 優先度：等 file-based 系統證明不足時再加。

- [~] **多層 Model 路由（Task-Tiered Model Selection）**
  **部分完成（v0.11.0）：** `distillation_model` config key 是第一個真正的 model routing 用例（distill 用便宜 model）。
  - 簡單驗證 / 判斷（如 Arbiter verdict）→ 用便宜 model（haiku、gemini-flash）
  - 核心推理 / 創作 → 用貴 model（opus、sonnet）
  - 與「Agent 發言傾向（chat / think）」正交：發言傾向控制長度，model 路由控制能力等級。
  - 實作：agent config 加 `model_tiers: { default, thinking, arbiter }`，不同場景自動切換。

- [ ] **Fairness Gate（發言公平門檻）**
  當多個 agent 並行輸出時（未來有直接 API 時最相關），防止回覆速度快的小 model 主導討論。
  - 借鑑 MassGen：強制等所有 model 完成輸出後才進行下一輪 aggregation。
  - 對目前循序 round-robin 影響小，但若改成平行架構這個機制是必要的。
  - 先記錄概念，有直接 API 後一起實作。

### UI 改善（v0.12.0 候選）

- [ ] **Token 消耗深度分析面板**
  聊天室內的 Token 面板加入 prompt 組成分析：多少是 agent identity、多少是 history、多少是 skills、多少是 memory injection。讓使用者看到 token 花在哪，做出調整。

- [ ] **Skill validated tag**
  每個 skill 可以標記是否經過驗證（validated: true/false）。未驗證的 skill 在列表和注入時標示警告。參考 Claude Code 的 skill 管理做法。

- [ ] **Agent Settings 記憶檢視器**
  用戶目前看不到 agent 記了什麼。在 Agent Settings tab 加 read-only 的記憶面板，顯示 `memory/YYYY-MM-DD.md` + `entities.json` 的內容。
  - P1 — 最大 UX gap（PM review 指出）

- [ ] **Distillation 完成通知**
  Session 結束後 distillation 在背景跑完時，送 WS event 通知前端「記憶已儲存」。
  - P1 — 用戶不知道記憶系統在運作

- [ ] **Settings 加 distillation_model 設定欄**
  目前 `distillation_model` 和 `distill_min_messages` 需手動編輯 config.json。加到 Settings UI。
  - P2

- [ ] **記憶修正 UI**
  讓用戶在 UI 裡編輯/刪除 individual facts 和 entities。目前只能手動改檔案。
  - P2 — 當 LLM 抽取錯誤時的修正機制

### 高優先（下一 phase）

- [ ] **Persistent CLI Session（pexpect 持久連線）**
  用 pexpect 保持 CLI session 活著，不用每次 spawn 新 process。Claude 6s→2s, Gemini 27s→3s。
  需要大改 build_prompt（啟動時設一次 identity，每輪只送新訊息）。
  Plan: `docs/plans/persistent-cli-session.md`

### 低優先 / 探索中

- [ ] **直接 API 支援（Anthropic / OpenAI）**
  目前只走 CLI subprocess（claude/gemini/codex）。若改支援直接 API call，可省去 CLI 安裝需求，降低 latency，也讓非開發者更容易部署。
  - 參考 MassGen 的 LLMBackend 架構：每個 provider 一個 class，繼承統一介面。
  - 可先從 Anthropic SDK 開始，作為 claude CLI 的 fallback。

- [ ] **Telegram 整合**
  Bot token 管理 + message relay 到 WebSocket session。

---

## 文件管理

- **廢棄計畫**存放於 `docs/superpowers/plans/_deprecated/`，每個檔案在 `_deprecated/README.md` 有說明。禁止調用。
