# Draft: User-Creator Affinity 深度特徵 SQL (V2)

**目標**: 修正 V1 中的 Data Leakage 問題，並補強付費親密度訊號。

## 關鍵修改點 (Based on Claude's Feedback)

1. **防止 Data Leakage**：移除 `current_timestamp`，改用相對基準。
2. **補強付費訊號**：整合該 $(user, creator)$ 歷史累計的送禮行為。

## SQL 邏輯預覽

```sql
with affinity_base as (
  select
    user_id,
    creator_id,
    max(day_start) as last_watch_time,
    count(distinct day_start) as watch_days_count,
    sum(watch_seconds_sum) as total_watch_seconds
  from ${ref('user_creator_watch_daily')}
  group by 1,2
),

monetization_affinity as (
  select
    distinct_id as user_id,
    creator_id, -- 假設 gift_sent 有帶 creator_id，若無則需透過 session join
    sum(diamonds__amount) as total_gift_to_creator,
    count(distinct timestamp_trunc(event_time, day)) as gift_days_to_creator
  from ${ref('base_swaglive__event_gift_sent')}
  group by 1,2
)

select
  a.user_id,
  a.creator_id,
  a.total_watch_seconds,
  a.watch_days_count,
  -- 預留 label_date 欄位由上層傳入，避免 leakage
  -- timestamp_diff(label_date, last_watch_time, day) as days_since_last_watch,
  coalesce(m.total_gift_to_creator, 0) as total_gift_to_creator,
  coalesce(m.gift_days_to_creator, 0) as gift_days_to_creator
from affinity_base a
left join monetization_affinity m
  on a.user_id = m.user_id
  and a.creator_id = m.creator_id
```
