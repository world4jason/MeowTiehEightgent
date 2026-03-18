# 綜合比較：Multi-Agent 工具全景

> 撰寫時間：2026-03-17（MassGen 補入：2026-03-18）
> 詳細報告：compare-aionui.md、compare-crewai.md、compare-autogen.md、compare-librechat.md、compare-chatmeld.md、massgen-analysis.md、massgen-vs-this-system.md

---

## 一、七個產品定位一句話

| 產品 | 一句話定位 | 目標用戶 |
|------|-----------|---------|
| **AionUi** | CLI agent 的漂亮 GUI wrapper，讓你不用開 terminal | 一般用戶、開發者 |
| **CrewAI** | 工程師定義 agent 任務流程，自動化複雜工作 | Python 工程師 |
| **AutoGen** | 工程師搭建多 agent 協作管道，有 GroupChat 概念 | 工程師、研究人員 |
| **LibreChat** | 開源 ChatGPT 替代品，支援幾乎所有 LLM 供應商 | 一般用戶（重視隱私/自架）|
| **ChatMeld** | 瀏覽器端多模型對話遊樂場，快速實驗 AI-to-AI 對話 | AI 愛好者、研究人員 |
| **MassGen** | 多 LLM 平行冗餘 + 投票共識，生出最佳單一答案 | 開發者、研究人員 |
| **你的專案** | 有個性、有記憶的多 agent 即時討論室，不需寫程式 | 任何人 |

---

## 二、多 Agent 架構矩陣

| 面向 | AionUi | CrewAI | AutoGen | LibreChat | ChatMeld | MassGen | 你的專案 |
|------|--------|--------|---------|-----------|----------|---------|---------|
| Agent 看到彼此發言？ | ❌ | △任務結果 | ✅ | ❌ | ✅ | △投票後 | ✅ |
| 自由對話 vs 任務導向 | N/A | 任務導向 | 可配置 | N/A | 自由對話 | 任務導向 | 自由對話 |
| 輪流機制 | 無 | Sequential/Hierarchical | RoundRobin/Graph | 無 | Auto/Manual | 平行同步 | round-robin+打斷 |
| 人類隨時介入？ | 各自獨立 | human-in-loop 節點 | ✅ | 一對一 | ✅手動指定 | ❌輪次結束後 | ✅任何時刻 |
| End-user UI？ | ✅精緻 | ❌ | △Studio | ✅完整 | ✅輕量 | △本地Web | ✅ |
| 不需寫程式？ | ✅ | ❌ | △ | ✅ | ✅ | △YAML | ✅ |

---

## 三、功能對比

| 功能 | AionUi | CrewAI | AutoGen | LibreChat | ChatMeld | MassGen | 你的專案 |
|------|--------|--------|---------|-----------|----------|---------|---------|
| 多 agent 同室討論 | ❌ | △ | ✅ | ❌ | ✅(max 4) | ✅(平行) | ✅(無上限) |
| Human-as-moderator UX | ❌ | ❌ | ❌ | ❌ | △手動指定 | ❌ | ✅ |
| Agent 個性系統 | △prompt | △backstory | △prompt | △prompt | △prompt | ❌functional | ✅三層md |
| 每日記憶/跨session | ❌ | ✅semantic | 需自建 | ❌ | ❌ | △session內 | ✅ |
| Marketplace 模板 | △15 preset | ❌ | ❌ | △社群agent | ❌ | ❌ | ✅ |
| Streaming 回應 | ✅ | 視LLM | ✅ | ✅ | 視API | ✅TUI | ❌ |
| Tool use | ✅ | ✅40+ | ✅MCP | ✅code+search | ❌ | △per-agent | ❌ |
| 直接 API（不需CLI）| ✅ | ✅ | ✅ | ✅ | ✅ | ✅10+ | ❌（需CLI/Ollama）|
| 跨 provider 混用 | ❌ | △ | △ | ❌ | ❌ | ✅核心賣點 | ❌ |
| 投票/共識機制 | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| @mention 路由 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| IM 整合 | ✅Telegram/Lark | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 本地模型（Ollama）| △ | ✅ | ✅ | ✅ | ❌ | ✅vLLM/LMStudio | ✅ |
| 多用戶系統 | ❌ | ❌ | ❌ | ✅OAuth2 | ❌ | ❌ | ❌ |
| Session 下載 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅JSON/MD/PDF |
| /skill 語法注入 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| 輕量部署 | ❌Electron | ✅pip | ✅pip | △Docker | ✅靜態 | ✅pip | ✅pip |

---

## 四、市場定位圖

```
                  需要寫程式/API key              不需要寫程式
                  ┌──────────────────────────────────────────────┐
 Agent 互相看到   │  CrewAI（任務傳遞）                           │
 彼此的發言       │  AutoGen（GroupChat）                        │  ChatMeld（遊樂場）
                  │  MassGen（平行投票，收斂答案）                │  你的專案（完整平台）← 唯一自由對話
                  ├──────────────────────────────────────────────┤
 Agent 各自獨立   │                                              │  AionUi
                  │                                              │  LibreChat
                  └──────────────────────────────────────────────┘
```

**關鍵分野：收斂 vs 發散**
- MassGen = 在右上角但目標相反——多 agent 協作是為了收斂出一個最佳答案
- 你的專案 = 多 agent 對話是為了發散、探索、對話本身就是價值
- ChatMeld = 同樣在右上角，但只是遊樂場，無持久化、無記憶、無角色個性

---

## 五、各產品護城河

| 產品 | 核心護城河 |
|------|-----------|
| AionUi | 多 CLI agent 自動偵測 + IM 整合（Telegram/Lark/DingTalk）+ 精緻 Electron UI |
| CrewAI | 生態系廣（40+ 工具、10 萬+開發者）+ 企業支援 |
| AutoGen | Microsoft 背書 + Python/.NET 雙語言 + 最靈活的 GroupChat 架構 |
| LibreChat | 功能最完整的 ChatGPT 替代品（code interpreter、多模態、多用戶） |
| ChatMeld | 最輕量（純靜態）、最快開始的多模型 AI 對話實驗工具 |
| MassGen | 跨 provider 平行冗餘 + voting consensus，答案品質最高 |
| **你的專案** | **唯一有 agent 個性/記憶/marketplace 的 end-user 多 agent 討論室** |

---

## 六、最接近的競品分析

### 概念最接近：ChatMeld + AutoGen GroupChat

- **ChatMeld**：同樣是多模型同室 + auto/manual 模式 + 不需寫程式，但是遊樂場級別，無持久化、無個性系統
- **AutoGen GroupChat**：技術架構最相似（shared context + round-robin），但需要寫 Python

### 補充說明：MassGen 的定位誤解

MassGen 的核心是**質量保證**，不是對話。它的多 agent 是「多個版本互相評審以產出最佳答案」，而非「多個角色共處一室進行討論」。詳見 [massgen-vs-this-system.md](massgen-vs-this-system.md)。

### 補充說明：LibreChat 的誤解

其他 LLM 可能會說「LibreChat 的對話分支讓你切換說話的 agent」——這是**錯誤的**。LibreChat 的 conversation branching 是訊息樹分叉（探索不同走向），不是多 agent 輪流對話。

---

## 七、建議優先投資方向

根據競品分析，補足以下差距 ROI 最高：

### 短期（提升基礎體驗）
1. **Streaming 回應** — 對標所有競品，UX 差異最明顯
2. **直接 API 支援（Anthropic / OpenAI）** — 對標 ChatMeld，不需裝 CLI 就能用

### 中期（拉開差距）
3. **對話倒帶 / 編輯** — 借鑑 ChatMeld，讓使用者可以修改某個 agent 的回應
4. **Tool use** — 對標 CrewAI / AutoGen，讓 agent 在討論中能查資料

### 長期
5. **Marketplace 開放投稿** — 讓社群貢獻 agent 模板（你已有基礎架構）
6. **Mobile / PWA** — 對標 LibreChat 的多裝置支援
