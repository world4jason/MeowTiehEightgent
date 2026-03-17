# Swag 直播推薦系統優化建議報告 — Gemini 版

**Date**: 2026-03-16
**Objective**: 從「觀看導向」轉向「變現導向 (REWH)」，優化供給不足環境下的排序效率。

---

## 1. 核心邏輯：從 Relevance 到 Monetization Efficiency

目前模型最大的問題在於 **Objective Misalignment**。
在候選集僅 50~200 個房間的小規模池子裡，「推薦準確率」的邊際收益遞減。
我們應該將排序邏輯從「猜用戶愛看什麼」轉向「在用戶有興趣的前提下，誰最有變現效率」。

### 三大改進支柱：
1.  **Metric Alignment**: 用 REWH 取代單一的 60s watch-time label。
2.  **Contextual Intent**: 捕捉用戶「此刻」的付費意圖。
3.  **Adaptive Policy**: 針對不同用戶受眾（Whale vs Newbie）採用不同的多目標加權比例。

---

## 2. 階段性計畫 (Phased Roadmap)

### Phase 0: 評估與數據基礎 (Months 1-2)
- **REWH 數據管線**: 建立精確的 REWH score 計算逻辑。
  - *挑戰*: 需要即時 join 觀看日誌與交易事件。
- **Shadow Evaluation (平行評估)**: 
  - 在不改變現有模型的情況下，觀察其在 REWH@K 指標上的表現。
  - 建立基於 `room_type` 與 `user_segment` 的切片看板，找出當前模型的「變現盲區」。

### Phase 1: 特徵工程與意圖建模 (Months 3-4)
- **Session-level Intent Features**:
  - `last_payment_recency`: 距離上次付費的時間。
  - `last_rooms_entered_30m`: 最近 30 分鐘進過的房型分佈。
  - `current_session_monetization`: 本次進站是否已產生付費行為。
- **Creator Monetization Style**:
  - 將創作者分群為：禮物型、私房轉化型、Show 型、高流量引流型。
  - 建立 `User_Segment` x `Creator_Style` 的交叉特徵。

### Phase 2: 模型演進與多目標優化 (Months 5-8)
- **Label 轉型**: 
  - 從 Binary Classification 轉向 **Regression on Normalized REWH**。
  - 採用 `y = log(1 + REWH_score)` 作為 regression target，平衡極端值。
- **Multi-Task Learning (MTL)**:
  - 底層共享 embedding，上層分支出 `p_long_watch` 與 `p_monetize`。
  - 根據用戶分群動態調整權重（例如：對 Whale 用戶給予 `p_monetize` 更高權重，對 New User 給予 `p_long_watch` 更高權重以留存）。

### Phase 3: 重排序與多樣化策略 (Ongoing)
- **Dynamic MMR (Maximal Marginal Relevance)**:
  - 針對 50~200 的小規模候選集，動態調整多樣化係數，避免頭部效應過強。
- **Exploration Gating (流量扶持)**: 
  - 預留 5-10% 的流量給新主播或冷啟動房間，確保生態長期健康。

---

## 3. 針對 Claude 疑慮的 Gemini 觀點

| Claude 的疑慮 | Gemini 的對策 |
| --- | --- |
| **Supply bottleneck (50-200 房)** | 在小規模池子下，更應強化 **Monetization Efficiency**。當大家都「愛看」時，推薦「更愛買」的房間是提升 RPI 的關鍵。 |
| **REWH Label 工程難度** | 建議先實施「輕量級 REWH」（僅包含付費行為與前後觀看），再逐步迭代至完整版。 |
| **Real-time Infra 需求** | 不需要完整的 Real-time Feature Store，初期可利用 Serving 端的本地緩存 (Local Cache/Redis) 儲存 session 特徵。 |
| **Multi-Objective 權重校準** | 透過 Offline NDCG 分層回測 (Replay Buffer) 來尋找最佳權重起始值，避免線上「盲測」。 |
| **Offline/Online 相關性** | 透過建立 **Evaluation Loop**，每兩週同步一次 offline 改進與 online A/B 指標，滾動修正規範。 |

---

## 4. 總結：現階段重點

目前的優先序應完全放在 **XGBoost 框架下的 Feature 與 Objective 補強**。
在解決了「語意斷層」與「Label 偏差」後，系統效能預計會有顯著提升。未來若要考慮進一步的模型架構升級（如 Neural MTL），也應在 P1/P2 的特徵基礎紮實後再行評估。

