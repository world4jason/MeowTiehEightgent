# Mth 研究資料夾

> 研究對象：https://github.com/meowtieheightgent/paperclip
> 本地 clone：/Users/jasonyeh/code_ground/paperclip
> 研究日期：2026-03-20

---

## 索引

| 文件 | 內容 |
|------|------|
| [01-overview.md](01-overview.md) | Mth 是什麼、定位、tech stack、核心原則 |
| [02-hierarchy-comparison.md](02-hierarchy-comparison.md) | 層次結構完整對比（你的 vs Mth）|
| [03-cli-token-tracking.md](03-cli-token-tracking.md) | CLI token 追蹤機制深挖（Claude / Gemini / Codex）|
| [04-ui-design.md](04-ui-design.md) | UI 設計模式與借鑑方向 |
| [05-feature-comparison.md](05-feature-comparison.md) | 完整功能對比表 |
| [ROADMAP.md](ROADMAP.md) | 整合 Mth 啟發的完整開發路線圖 |

---

## 核心結論（TL;DR）

Mth 跟你的專案**不是競品**，是互補的：
- 你的專案 = Sprint Planning（討論、腦力激盪、決策）
- Mth = Sprint Execution（agents 實際去做事）

最值得借鑑的三件事：
1. **CLI `--output-format stream-json`** → 馬上可以拿到 token 追蹤
2. **Issue（異步任務票）** → 讓討論結論有地方落地，橋接討論與實作
3. **Agent Task Session 持久化** → CLI session_id 存下來，下次可以 resume
