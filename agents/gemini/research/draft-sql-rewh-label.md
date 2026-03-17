# Draft: REWH Label 重構 SQL (V2)

**目標**: 修正 V1 中的公式錯誤，確保權重乘在觀看時間上，並符合 REWH v1.0 規範。

## 關鍵修改點 (Based on Claude's Feedback)

1. **修正計算公式**：從「基礎分 + 事件加成」改為 `watched_minutes * weight`。
2. **PL1 權重修正**：付費房觀看權重設為 `1.0`。
3. **FL2/FL3 簡化處理**：V1 階段針對有送禮的 Session 統一採用 `0.65`（FL2 與 FL3 的平均值）。

## SQL 邏輯預覽

```sql
rewh_calculation as (
    select
        *,
        -- 核心 REWH 計算邏輯 (V2 修正版)
        (duration / 60.0) * (
            case 
                when pay_count > 0 then 1.0    -- PL1/OL1/LS1: 付費觀看
                when gift_count > 0 then 0.65  -- FL2/FL3: 互動觀看 (平均權重)
                else 0.1                       -- FL1: 純免費觀看
            end
        ) as rewh_score
    from session_engagement
)

select
    user_id,
    creator_id,
    user_session_start,
    rewh_score / (1 + rewh_score) as label -- Sigmoid 歸一化 [0, 1]
from rewh_calculation
```
