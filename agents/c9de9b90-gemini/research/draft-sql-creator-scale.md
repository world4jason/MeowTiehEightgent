# Draft: Creator Revenue Scale 補強 SQL (V1)

**目標**: 修正 `creator_transaction.sqlx`，在保留比例特徵的同時，暴露絕對營收規模特徵。

## 關鍵修改點

1. **保留 `total_amount`**：不再在最終輸出中排除絕對金額。
2. **新增 Scale 特徵**：暴露 `total_1day`, `total_7day`, `total_30day` 等指標。

## SQL 邏輯預覽

```sql
-- 修改 windowed 後的 select 邏輯
select
    user_id as creator_id,
    event_date,
    -- 絕對規模 (New)
    total_1day as creator_revenue_scale_1day,
    total_7day as creator_revenue_scale_7day,
    total_30day as creator_revenue_scale_30day,
    -- 原有的比例特徵 (Keep)
    ${
        diamond_type_periods.map(({_type, _period})=> 
            `${_type}_${_period}day / total_${_period}day as ${_type}_pct_${_period}day`
        ).join(',\n    ')
    }
from windowed
where user_id in (select user_id from creators)
```

## 預期 Uplift
- 模型能夠區分「高營收創作者」與「低營收創作者」，解決目前的「比例相同但價值不同」問題。
- 對於高價值用戶 (Whale)，系統會更傾向於推薦已經被驗證過具有高變現規模的創作者。
