# 2026-03-11 技術策略筆記 (備份)

此筆記摘錄自 `/Users/jasonyeh/notes/Swag/daily/2026-03-11.md`，為直播個人化排序系統的策略轉捩點。

## 1. 核心目標轉向
從單純的「預測看超過 60 秒」轉向「直播入口分發 + 付費轉化前置排序」。

## 2. 成功目標的三層定義 (The 3-Tier Goals)
排序系統不應只預測單一結果，應考量以下階段轉換：

### A. Entrance Quality (入口品質)
- CTR (impression -> enter)
- Bounce-free enter
- Watch > 10s

### B. Engagement Quality (互動品質)
- Watch > 60s / 180s
- Chat (需付費資格)
- Gift / Command / Lovense 觸發
- Game participation

### C. Monetization Quality (變現品質)
- Private paid entry
- Show funding participation
- Show paid unlock
- Exclusive/private spending
- Higher ARPU proxy

## 3. 調整脈絡 (Adjustment Map)
- **Watch-time-first -> Monetization-aware ranking**
- **Generic live features -> Room-mechanism-aware features**
- **Long-term preference -> Session monetization intent**
- **Single global score -> Room-status / Policy-aware ranking**

## 4. 關鍵建議 (Phased Priority)
- **P0**: 對齊產品成功定義，升級 Offline Evaluation (NDCG + Sliced Business Metrics)。
- **P1**: 補齊 Session-level Monetization Intent 與 User x Room_status Cross Features。
- **P2**: 多目標預估 (MTL) 與 Business Score Reranking。
