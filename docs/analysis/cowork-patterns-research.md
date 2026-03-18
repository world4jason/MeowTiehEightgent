# Cowork Pattern 調研報告

> 日期：2026-03-18
> 來源：AutoGen、CrewAI、LangGraph、OpenAI Swarm/Agents SDK、學術論文

---

## 摘要

四個協作模式（Arbiter、Blackboard、Pipeline、Swarm）在現有框架中均有實作，但各有明顯缺陷。本系統（subprocess CLI + flat text history + WebSocket interrupt）有天然優勢也有特定限制，以下按優先序提出借鑒建議。

---

## Pattern 1：Arbiter / Reviewer

### 各框架作法

**LangGraph（Reflection Agent）**
最乾淨的實作。`generate` node 產出 → `reflect` node 評審 → conditional edge 決定繼續或結束。終止條件是 message count（每輪 2 則），不靠語意判斷。

**AutoGen（MagenticOne Orchestrator）**
雙層迴圈：外層 Task Ledger（整體計畫）、內層 Progress Ledger（逐步評估）。Orchestrator 評估每個 worker 的輸出再決定下一步。失敗點：Ledger 是從 LLM 輸出解析 JSON，格式錯誤直接 crash。

**CrewAI（Hierarchical Process）**
Manager agent 有 `Delegate` 和 `Ask Question` 兩個工具。理論上是 arbiter，實際上因底層仍按定義順序跑（bug #4783），manager 的路由決策很多時候是虛的。

### 優缺點

| 優點 | 缺點 |
|------|------|
| 不用人工 verify 每一步 | Over-rejection bias：arbiter 常挑剔好的輸出 |
| 自然阻斷錯誤傳播 | Token 成本是 N 倍（每輪多一次 LLM call）|
| Count-based 終止簡單可靠 | 振盪迴圈：A 改了 X，arbiter 接受，但 Y 被弄壞 |
| Multi-arbiter panel 減少單一偏見 | Arbiter 本身也會幻覺 |

### 失效模式
- 振盪迴圈：generator 修 A → arbiter 拒 → generator 修 B → A 的問題回來 → 無限循環
- Arbiter JSON 格式錯誤 → hard crash
- Positional sycophancy：arbiter 傾向 approve 最新版本，不管品質

### 本系統實作建議

1. 每 N 輪後 invoke 一次 arbiter subprocess，系統 prompt 帶評審 rubric
2. Arbiter 輸出 JSON：`{ "verdict": "accept" | "revise" | "needs_human", "feedback": "..." }`
3. **一定要解析驗證**，不能直接用 "APPROVED" 字串比對
4. 硬限最多 3 輪修訂，防止振盪
5. Arbiter 用便宜 model（如 haiku），只評不生成

---

## Pattern 2：Blackboard

### 各框架作法

**LangGraph**
整個架構本質上就是 blackboard。`State` TypedDict 是共享黑板，每個 node 讀取並寫回。`MemorySaver` 讓 blackboard 在 interrupt 後可以恢復。Reducer 控制並發寫入的合併邏輯。

**學術論文（LbMAS, arxiv 2510.01285 / Advanced LLM Blackboard, arxiv 2507.01701）**
中央 agent 把任務貼上黑板，subordinate agents 根據自己的專長自主決定是否回應。比 master-slave 和 RAG 有 13-57% 的任務成功率提升。

Blackboard 資料結構：
```json
{
  "task": "原始任務",
  "rounds": [
    { "round": 1, "agent": "researcher", "contribution": "...", "timestamp": "..." }
  ],
  "consensus": null,
  "current_focus": "control unit 想讓下輪解決什麼"
}
```

**AutoGen / CrewAI**
沒有原生 blackboard primitive。AutoGen 用 `context_variables`（shared dict）近似；CrewAI 用 task `context` 參數線性傳遞。

### 優缺點

| 優點 | 缺點 |
|------|------|
| Agents 只需知道 blackboard schema，不需知道彼此 | 並發寫入衝突（last write wins）|
| 自然 audit trail | Schema drift（agent 寫到其他 agent 不認識的欄位）|
| 新 agent 可以無縫加入 | Context overflow（黑板越來越大）|
| 天然支援 async | 無自然終止信號 |

### 失效模式
- Memory poisoning：一個 agent 寫了錯誤資訊，後續 agents 全部信以為真
- 無限 "需要更多資訊" 迴圈
- Context overflow：黑板太大，後期 agents 根本讀不完

### 本系統實作建議

你的 flat history **已經是原始黑板**，只差結構化。

1. History 開頭加結構化 header：
   ```
   [SHARED STATE]
   current_plan: ...
   key_decisions: ...
   open_questions: ...
   [/SHARED STATE]
   ```
2. 每個 agent 只能寫自己負責的欄位，防止衝突
3. 傳給 subprocess 的內容 = `header + 最近 N 輪`，不傳全部（解決 overflow）
4. Orchestrator 讀 header 決定下一個 agent

---

## Pattern 3：Pipeline

### 各框架作法

**CrewAI（Sequential Process，預設模式）**
最成熟的 pipeline 實作。每個 task 的輸出自動加入下一個 task 的 context。Multi-crew pipeline：`Pipeline(stages=[crew_a, crew_b, crew_c])`，每個 stage 的輸出成為下一個的 `inputs`。

**AutoGen（Handoffs）**
沒有原生 pipeline primitive。用 Swarm 限制每個 agent 只有一個 handoff target，形成固定序列。或直接 chain `run()` calls，但這樣 B 只看到 A 的輸出，看不到 A 的推理過程。

**LangGraph（Linear Graph）**
用無 conditional edge 的線性圖。優點是可以加 checkpointing，失敗可從最後成功的節點恢復。

### 優缺點

| 優點 | 缺點 |
|------|------|
| 執行順序完全可預測 | **Compound reliability decay**：A×B×C 成功率 = 三者相乘 |
| 單一 stage 失敗，後續不跑 | 錯誤傳播：A 的錯誤 B 繼續建在上面 |
| 每個 stage 可獨立測試 | Latency 相乘：5 個 500ms stage = 2.5 秒純 overhead |
| 結果確定性高 | 末端 stages context 過大（每個 stage 都累積）|

### 失效模式
- 成功率公式：每加一個 stage 就乘以該 stage 的成功率，5 個 90% 的 stage = 59% 整體成功率
- Silent failure：A 輸出看起來合理但細節錯誤，B 接受並往下傳，沒有 error signal
- Context overflow at tail：最後幾個 stage 收到的 context 已超過 context window

### 本系統實作建議

1. Subprocess 間用結構化 JSON 交接：
   ```json
   { "stage": "researcher", "output": "...", "status": "ok" | "failed", "failure_reason": "..." }
   ```
2. Orchestrator 在每個 subprocess 回來後檢查 `status`，failed 就停止或路由到人
3. **鏈的長度控制在 5 以內**（每加一個 stage 都在降低整體成功率）
4. Subprocess 間是天然的 human interrupt 插入點：subprocess 結束後、下一個開始前，check WebSocket queue

---

## Pattern 4：Swarm / Selector

### 各框架作法

**AutoGen（SelectorGroupChat）**
每輪結束後，selector LLM 收到 `agent names + descriptions + conversation history`，輸出下一個 agent 的名字。

關鍵：routing 依據是 **agent description**（不是 system_message）。Description 越具體，routing 越準。

Default selector prompt：
```
You are in a role play game. The following roles are available:
{roles}
Read the following conversation. Then select the next role from {participants} to play. Only return the role.
{history}
```

`candidate_func` 可以先過濾候選 agents，再讓 LLM 從縮小後的集合選，提升準確度和速度。

**AutoGen（Swarm）**
去中心化。每個 agent 自己決定 handoff target（呼叫 handoff tool）。接收 agent 繼承完整 conversation context。Human 是另一個合法的 handoff target。

**重要：必須設 `parallel_tool_calls=False`**，否則 agent 同時 emit 兩個 handoff，造成狀態不明。

**LangGraph（Supervisor with Conditional Edges）**
Supervisor node 讀取狀態，輸出 routing decision，conditional edge 分發到對應 agent。Worker nodes 全部 route 回 supervisor。

`output_mode="last_message"` vs `"full_history"` 控制 worker 輸出對後續 context 的影響。

**OpenAI Agents SDK（2025/03 發布，Swarm 的繼任者）**
Handoffs 是 first-class 物件，有 guardrails 和 input/output validation hooks，有內建 tracing。機制與 Swarm 相同，API 更成熟。

### 優缺點

**SelectorGroupChat：**

| 優點 | 缺點 |
|------|------|
| Agent description 好的話 routing 非常準 | Selector 本身 LLM call 增加每輪 latency |
| 自適應，不需要預設序列 | Selector 常回傳大小寫不一致的名字（需驗證）|
| 可用 candidate_func 縮小選擇空間 | Selector 沒有跨輪記憶（不知道誰講太多了）|

**Swarm：**

| 優點 | 缺點 |
|------|------|
| 去中心化，無瓶頸 coordinator | 需要 tool-calling 支援（open-source models 常失敗）|
| Human 是天然的 handoff target | 無全域監控，局部決策可能全域次優 |
| Triage 場景自然 | 無限迴圈風險（A→B→A→B...）|

### 失效模式
- Selector 回傳不在名單裡的 agent 名字 → fallback 觸發 → 可能 echo chamber
- 空 context loop：model 沒有 emit tool call → 空 HandoffMessage → `MaxMessageTermination` 是唯一防護
- Swarm 無限迴圈：A routes to B，B routes to A，無終止條件

### 本系統實作建議

你的 subprocess 不支援 tool-calling，**Swarm handoff 改成 output parsing**：

1. 每個 subprocess 最後一行可以輸出 `HANDOFF: agent_name` 或 `HANDOFF: human`
2. Orchestrator 解析並驗證 target 在已知 agent list 裡
3. 升級現有 round-robin：在 selector call 時只傳最近 3-5 則 + agent descriptions（不傳全部 history，節省 tokens）
4. 保留現有 probabilistic silence 作為 selector LLM 失敗時的 fallback

---

## 跨 Pattern 的共同教訓

### Context Window / History Overflow

| 層級 | 做法 |
|------|------|
| 短期止血 | Sliding window：只傳最近 N 輪 |
| 中期 | 結構化 header + 最近 N 輪（Blackboard 方案）|
| 長期 | Auto-condensing：每 M 輪用輕量 model 壓縮舊段落 |

Claude Code subagents 透過 context isolation 讓每個 subagent 只處理 67% 的 tokens，這是設計目標而非偶然。

### 無限迴圈防護（所有 pattern 都必須）

三個根本原因佔 90%：
1. 沒有 max round count
2. 終止條件永遠不成立
3. Agent prompt 沒有明確的「完成」信號

**最小防護組合：**
- 硬性 max round count（絕對上限）
- Semantic 完成信號（agent 輸出特定 JSON field，非字串比對）
- 停滯偵測：連續兩輪同一個 agent 輸出相似內容 → 強制終止或路由到 human

### Error Amplification

MAST 研究（1,642 條 production traces）：multi-agent 系統的失敗率 41%-86.7%。沒有 verification checkpoint 的 flat 架構，錯誤放大 17x。

**解法：每 3-5 步插入一個 verification checkpoint**，不是加更多 agents。

### Human-in-the-Loop 各 Pattern 的插入點

| Pattern | 最自然的 interrupt 點 |
|---------|---------------------|
| Arbiter | Arbiter 輸出 `"verdict": "needs_human"` 後 |
| Blackboard | 每輪結束後，controller check WebSocket queue |
| Pipeline | 每個 subprocess 結束後，下一個開始前 |
| Swarm | Agent handoff to "user" target |

你的 WebSocket interrupt 模型天然對應 Pipeline 的插入點——這是你架構的優勢，不需要特別實作 interrupt 機制。

---

## 實作優先序建議

1. **Arbiter（先做）** — 最低成本，加一個 subprocess call，有明顯品質提升
2. **Blackboard header（第二）** — 改 history 格式，改善現有 round-robin，順手解決 context overflow
3. **Pipeline（第三）** — 特定任務場景，有了前兩個的基礎很容易加
4. **Swarm/Selector（最後）** — 最複雜，留到前三個穩定後再做

---

## 相關資料

- [AutoGen SelectorGroupChat](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/selector-group-chat.html)
- [AutoGen Swarm](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/swarm.html)
- [LangGraph Reflection Agents](https://blog.langchain.com/reflection-agents/)
- [LangGraph Supervisor](https://github.com/langchain-ai/langgraph-supervisor-py)
- [LbMAS Paper (arxiv 2510.01285)](https://arxiv.org/abs/2510.01285)
- [Advanced LLM Blackboard (arxiv 2507.01701)](https://arxiv.org/abs/2507.01701)
- [Why Multi-Agent Systems Fail (Galileo)](https://galileo.ai/blog/why-multi-agent-systems-fail)
- [17x Error Amplification](https://towardsdatascience.com/why-your-multi-agent-system-is-failing-escaping-the-17x-error-trap-of-the-bag-of-agents/)
- [Cognition: Don't Build Multi-Agents](https://cognition.ai/blog/dont-build-multi-agents)
- [MagenticOne Paper (arxiv 2411.04468)](https://arxiv.org/abs/2411.04468)
