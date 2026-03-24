# Swag 直播推薦系統 — Codebase 研究報告

**Author**: Claude
**Date**: 2026-03-16
**Scope**: /Users/jasonyeh/code_ground 底下所有相關專案

---

## 一、整體資料流架構

```
analytics_raw (BigQuery)
    ↓
[Lexicon] dbt staging models
    → analytics_staging.base_swaglive__event_*
    ↓
[Data-Feature-Store] Dataform definitions
    → feast_offline.* (batch features)
    → ds_training_dataset.* (training labels)
    ↓                            ↓
[Data-Dataflow]           [Muse] Training Pipeline
Real-time event               → XGBoost model
processing                    → Vertex AI deployment
    ↓                            ↓
feast_online (AlloyDB)    Vertex AI Endpoint
    ↓                            ↓
         [Data-API] FastAPI
         → /livestream/v1/recommendation/{user_id}
         → 後端呼叫
```

---

## 二、各專案詳細說明

### 1. Lexicon — 原始資料轉換層

**路徑**: `/Users/jasonyeh/code_ground/lexicon/lexicon_bq/`
**工具**: dbt (data build tool)
**目的地**: BigQuery `analytics_staging`

**角色**: 把 Mixpanel/產品端的 raw event 表清洗成結構化 staging 表，命名格式為 `base_swaglive__event_*`。

**與 Livestream 相關的關鍵 staging 表**:

| Staging 表 | Raw 來源 | 用途 |
|-----------|---------|------|
| `base_swaglive__event_session_viewers_updated` | event_session_viewers_updated | viewer_count, preview/sd |
| `base_swaglive__event_session_rating_updated` | event_session_rating_updated | rating, rating_count |
| `base_swaglive__event_session_tags_updated` | event_session_tags_updated | stream_tags |
| `base_swaglive__event_gift_sent` | event_gift_sent | gift/karaoke 互動 |
| `base_swaglive__event_livestream_chat_sent` | event_livestream_chat_sent | 聊天 |
| `base_swaglive__event_session_started/ended` | 對應 event | room_status 推導 |
| `base_swaglive__event_show_goal_*` | 對應 event | show/funding 狀態 |
| `base_swaglive__event_payment_succeeded` | event_payment_succeeded | 付費事件 |
| `base_swaglive__event_points_deposited/withdrawn` | 對應 event | 鑽石消耗 |
| `base_swaglive__event_user_followed/unfollowed` | 對應 event | follow 關係 |
| `base_swaglive__event_v2_view_closed` | event_v2_view_closed | 觀看時長 |

---

### 2. Data-Feature-Store — 特徵工廠

**路徑**: `/Users/jasonyeh/code_ground/data-feature-store/`
**工具**: Dataform (SQLX) + Feast (Python)

**子系統分工**:

```
definitions/   → 用 SQLX 計算特徵，寫入 BigQuery
data_feast/    → 用 Feast 定義特徵語意，驅動訓練/上線讀取
```

#### 2.1 Definitions — 重要 SQLX 檔案

**Training Label**:
- `definitions/outputs/training/livestream_label.sqlx`
  - 產出 `ds_training_dataset.livestream_label`
  - 欄位：`(user_id, creator_id, user_session_start, duration)`
  - 正樣本：`user_session_creator_livestream`
  - 負樣本：`user_livestream_impression`

**Creator Features**:
- `intermediate/creator/creator_status.sqlx` — creator profile (language, country, hashtags, badges)
- `intermediate/creator/creator_livestream_room_status.sqlx` — room_status 推導 (public/private/show/show_funding/exclusive)
- `intermediate/creator/creator_livestream_10minute.sqlx` — 10分鐘 rolling momentum
- `intermediate/creator/creator_transaction.sqlx` — creator 變現結構 (pct by type)

**User Features**:
- `intermediate/user/user_status.sqlx` — user profile + last_payment_time
- `intermediate/user/user_30day.sqlx` — 30天消費量
- `intermediate/user/user_transaction.sqlx` — user 消費結構 (pct by type)
- `intermediate/user/user_engagement_features_daily.sqlx` — 探索行為、活躍天數
- `intermediate/user/user_creator_follow_changelog.sqlx` — follow 關係
- **`intermediate/user/user_session_signals.sqlx`** — ⚠️ 已計算但未接入 Feast v3
  - `last_watch_duration_seconds`
  - `last_watch_age_min`
  - `engaged_in_session`

**預處理**:
- `outputs/user/livestream_preprocess_v2.sqlx` — 舊版 (有接 session signals)
- `outputs/user/livestream_preprocess_v3.sqlx` — 現版 (沒有 session signals)

#### 2.2 Feast Layer — 特徵合約

**Services**:
- `data_feast/services.py` — 定義 `livestream_recommendation_v3` FeatureService

**Creator Views** (`data_feast/creator/views.py`):
- `creator_status_fv` — profile, hashtags, badges
- `creator_livestream_*_fv` — is_alive, rating, room_status, viewer_count
- `creator_livestream_10minute_fv` — momentum
- `creator_livestream_settings_fv` — stream_tags, has_lovense
- `creator_snapshot_fv` — 256-d visual embedding
- `creator_transaction_fv` — monetization mix

**User Views** (`data_feast/user/views.py`):
- `user_status_fv` + ODFV `user_status_age` — profile, last_payment_age
- `user_30day_fv` — 30天消費
- `user_transaction_fv` — 消費結構
- `user_engagement_features_fv` — 探索行為
- `user_creator_follow_fv` — is_following

**Online Store**: AlloyDB (`feast_online`)
**Offline Store**: BigQuery (`feast_offline`)

---

### 3. Data-Dataflow — 即時事件處理

**路徑**: `/Users/jasonyeh/code_ground/data-dataflow/data_dataflow/pipelines/livestream/`
**工具**: Google Cloud Dataflow (Apache Beam)

**主要檔案**:
- `main.py` — pipeline 入口
- `transform.py` — 事件轉換邏輯
- `snapshot_transform.py` — 直播縮圖處理
- `snapshot_storage.py` — 縮圖存儲 (→ GCS → Vertex multimodal embedding)
- `schema.py` — 資料結構定義
- `options.py` — pipeline 參數

**角色**: 接收 Pub/Sub 的即時事件，處理後寫入 Feast PushSource，讓 online store 保持即時更新 (room_status, viewer_count, rating 等 Family B features)。

---

### 4. Muse — 模型訓練與推理端點

**路徑**: `/Users/jasonyeh/code_ground/muse/muse/`

#### 4.1 訓練 Pipeline

**路徑**: `pipeline/livestream_recommendation/`

**核心檔案**:

| 檔案 | 用途 |
|------|------|
| `pipeline.py` | Vertex AI Pipeline 定義（完整 DAG） |
| `src/feast_featurize_component.py` | 從 Feast historical join 取特徵，計算 duration_norm，做 PCA/KMeans |
| `src/train_file_transformation_component.py` | categorical encoding，產生 X/y/w .npy |
| `xgboost_trainer/trainer/task.py` | XGBoost 訓練，objective=multi:softprob，eval_metric=auc |
| `src/direct_evaluation_component.py` | 算 ROC AUC, NDCG@20, NDCG@50（但被塞進 auPrc/logLoss 欄位） |
| `src/model_compare_component.py` | 用 auRoc 決定 challenger vs blessed |

**訓練流程**:
```
1. livestream_label procedure (BigQuery)
   → entity parquet (user_id, creator_id, user_session_start, duration)
2. feast_featurize_component
   → get_historical_features(livestream_recommendation_v3)
   → duration → duration_norm → embedding PCA/KMeans
   → featurized1 parquet
3. train_file_transformation_component
   → categorical mapping
   → y_discrete = 1 if duration_norm > 0.5
   → sample_weight = duration_norm (if y=1) or 1-duration_norm (if y=0)
   → X/y/w .npy
4. xgboost_trainer
   → ExtMemQuantileDMatrix
   → objective: multi:softprob, num_class=2
   → eval_metric: auc
5. direct_evaluation_component
   → auRoc (ROC AUC)
   → auPrc (實為 NDCG@20)
   → logLoss (實為 NDCG@50)
6. model_compare_component
   → 以 auRoc 決定部署
```

**Label 轉換細節**:
```python
# feast_featurize_component.py
if duration > 1800:
    duration_norm = 1.0
else:
    duration_norm = (duration / 60) / (1 + duration / 60)

# train_file_transformation_component.py
y_discrete = 1 if duration_norm > 0.5 else 0  # ≈ duration > 60s
sample_weight = duration_norm if y_discrete == 1 else 1 - duration_norm
```

**Artifacts 產出**:
- `feature_schema.joblib`
- `categorical_column_mapping.joblib`
- `embedding_transformers.joblib` (StandardScaler + IncrementalPCA(32) + MiniBatchKMeans(7))

#### 4.2 推理端點

**路徑**: `model_endpoint/livestream_recommendation/`

**核心檔案**:
- `predictor.py` — serving 邏輯，接收 Feast online features，執行 XGBoost 推理
- `utils.py` — 工具函數
- `thread_storage.py` — thread-local 存儲

---

### 5. Data-API — FastAPI 服務層

**路徑**: `/Users/jasonyeh/code_ground/data-api/app/livestream/`

**核心檔案**:
- `router.py` — API 端點定義
- `service.py` — 業務邏輯
- `database.py` — DB 操作 (AlloyDB)
- `utils.py` — 工具函數

**Livestream 相關 API 端點**:

| Method | Path | 說明 |
|--------|------|------|
| GET | `/livestream/v0/recommendation/{user_id}` | V0 推薦（不走 Feast） |
| GET | `/livestream/v1/recommendation/{user_id}` | **V1 推薦（Feast + XGBoost）** |
| GET | `/livestream/v0/rank` | 熱度排行（rule-based，依 viewer_count 等） |
| GET | `/livestream/v1/rank` | V1 排行 |
| GET | `/livestream/v0/{user_id}/features` | 取 user features |
| GET | `/livestream/v1/{user_id}/features` | 取 user features (Feast) |
| GET | `/livestream/v0/status/{creator_id}` | creator 直播狀態 |
| POST | `/livestream/v0/status/{creator_id}` | 更新 creator 直播狀態 |

**V1 服務層** (`service.py`):
- `livestream_recommendation_v1()` — 主推薦邏輯
  1. 取 online creators（AlloyDB）
  2. 從 Feast online store 取 features
  3. 呼叫 Vertex AI Endpoint (predictor.py)
  4. 回傳排序結果

---

## 三、Feature 完整清單（218 features）

> **說明：Feature Family 是什麼？**
>
> XGBoost 模型吃進 218 個 feature，這些 feature 來自不同的資料源與計算邏輯。
> AI 筆記（`Final Input Feature Dictionary.md`、`Junior Engineer Onboarding Report.md`）為了方便溝通，
> 依照「來源與商業語意」把它們分成 10 個 **Feature Family**，用 A~J 標記。
>
> 這不是 code 裡的正式命名，是 AI 筆記為了整理 feature 而自定的分組標籤。
> Code 裡的實際命名格式是 `creator_status__*`、`user_transaction__*` 這類前綴。

### Feature Family A — Creator Identity/Profile (51 features)
- `creator_status__signed_by/is_signed/is_beta/is_hidden/is_banned/is_viewer`
- `creator_status__country/language/gender`
- `creator_status_age__creator_signed_age` (ODFV, request-time)
- `creator_status_array_features__hashtags_count/badges_count/has_verified_badge`
- `creator_hashtags_multi_hot__*` (top-36 hashtags + has_others)
- `creator_badges_multi_hot__*` (top-5 badges + has_others)

### Feature Family B — Creator Real-time Livestream State (4 features)
- `creator_livestream_is_session_alive__is_session_alive`
- `creator_livestream_rating__rating`
- `creator_livestream_room_status__room_status` (public/private/show/show_funding/exclusive)
- `creator_livestream_viewer_count__viewer_count`

### Feature Family \1 — Creator 10-minute Momentum (7 features)
- `creator_livestream_10minute__viewer_count_delta_10minute`
- `creator_livestream_10minute__karaoke_count_10minute`
- `creator_livestream_10minute__karaoke_user_count_10minute`
- `creator_livestream_10minute__gift_count_10minute`
- `creator_livestream_10minute__gift_user_count_10minute`
- `creator_livestream_10minute__chat_count_10minute`
- `creator_livestream_10minute__chat_user_count_10minute`

### Feature Family \1 — Creator Livestream Stream Tags (37 features)
- `creator_livestream_settings__has_lovense`
- `creator_livestream_settings_array_features__stream_tags_count`
- `creator_stream_tags_multi_hot__category_*` (14 categories)
- `creator_stream_tags_multi_hot__country_*` (6 countries)
- `creator_stream_tags_multi_hot__device_*`

### Feature Family \1 — Creator Snapshot Visual (44 features)
- `creator_snapshot_embedding_stats__*` (mean/std/l2_norm/max/min)
- `creator_embedding_pca_0..31` (PCA 32D)
- `creator_embedding_kmeans_0..6` (KMeans 7 clusters)
- 來源：Vertex `multimodalembedding@001` (256D → scaled → PCA → KMeans)
- ⚠️ null embedding → 全 0 向量，新主播 cold start 問題

### Feature Family \1 — User Status (6 features)
- `user_status__country/language`
- `user_status__last_livestream_transaction_type`
- `user_status_age__user_last_payment_age` (ODFV, request-time)
- `user_30day__registered_age_day` (cap 30)
- `user_30day__diamonds_consumed_30day`

### Feature Family \1 — User Transaction Mix (25 features)
- `user_transaction__livestream_[karaoke/gift/private/show/exclusive]_pct_[1/7/14/30/90]day`

### Feature Family \1 — User Engagement (22 features)
- `user_engagement_features__unique_creators_[7/14/30]d`
- `user_engagement_features__active_days_[7/14/30]d`
- `user_engagement_features__total_watch_seconds_[7/14/30]d`
- `user_engagement_features__avg_watch_seconds_per_session_[7/14/30]d`
- `user_engagement_features__pct_sessions_with_interaction_[7/14/30]d`
- `user_engagement_features__recency_of_exploration_min_30d`
- `user_engagement_features__propensity_to_discover_[7/14/30]d`
- `user_engagement_features__[top/second/third/fourth/fifth]_category_30d`

### Feature Family \1 — User-Creator Affinity (1 feature)
- `user_creator_follow__is_following`
- ⚠️ 只有 follow/unfollow，沒有互動深度、消費歷史、觀看頻率

### Feature Family \1 — Creator Monetization Mix (25 features)
- `creator_transaction__livestream_[karaoke/gift/private/show/exclusive]_pct_[1/7/14/30/90]day`
- ⚠️ 全是比例，沒有絕對量級（大小主播無法區分）

---

## 四、已知問題與改進機會

### 🔴 高優先

| 問題 | 位置 | 影響 |
|------|------|------|
| **Objective Misalignment** | `task.py`: objective=multi:softprob, label=duration>60s | model 優化目標≠REWH 北極星 |
| **Evaluation 指標被埋** | `direct_evaluation_component.py`: NDCG 塞進 auPrc/logLoss | 無法正確比較模型，以 auRoc 決策 |
| **Session signals 未接入 Feast v3** | `user_session_signals.sqlx` 已算，但沒進 v3 | 缺少 session-level intent features |
| **Family I 只有 is_following** | `user_creator_follow_fv` | 無互動深度，affinity signal 太弱 |
| **Family J 只有比例無量級** | `creator_transaction_fv` | 大小主播無法區分變現能力 |

### 🟡 中優先

| 問題 | 位置 | 影響 |
|------|------|------|
| **Snapshot null → 全 0 cold start** | `feast_featurize_component.py` L254 | 新主播 embedding 空間位置異常 |
| **Position bias 未修正** | training data setup | model 學到曝光偏差，不是真實 quality |
| **room_status 只是 feature，不是 ranking strategy** | `train_file_transformation_component.py` | 不同房型商業邏輯差異未被利用 |
| **10min momentum 只有快照無趨勢** | Family C | 不知道是升溫還是降溫 |
| **AUC 作為主要 model selection metric** | `model_compare_component.py` | ranking 問題卻用 classification 指標選模 |

### 🟢 低優先

| 問題 | 位置 | 影響 |
|------|------|------|
| **全局 StandardScaler 對跨地區主播失真** | `feast_featurize_component.py` | 台灣/東南亞主播 viewer_count baseline 差距大 |
| **user_transaction 缺乏 total amount** | Family G | 只有比例，不知道消費規模 |
| **XGBRanker 尚未試用** | `task.py` | ranking 問題但用 classification objective |

---

## 五、建議進入點（修改路徑）

### 改 Label（P0 最重要）
1. `data-feature-store/definitions/outputs/training/livestream_label.sqlx`
   - 加入 gift/payment event join，計算 REWH state
2. `muse/muse/pipeline/livestream_recommendation/src/feast_featurize_component.py`
   - 改 duration_norm 計算邏輯 → REWH-weighted score
3. `muse/muse/pipeline/livestream_recommendation/src/train_file_transformation_component.py`
   - 移除 y_discrete，改用 REWH-normalized regression target
4. `muse/muse/pipeline/livestream_recommendation/xgboost_trainer/trainer/task.py`
   - objective: multi:softprob → reg:logistic

### 改 Evaluation（P0）
5. `muse/muse/pipeline/livestream_recommendation/src/direct_evaluation_component.py`
   - 加 REWH@K、room_type slice NDCG、user segment slice
   - 修正指標命名（不要塞進 auPrc/logLoss）
6. `muse/muse/pipeline/livestream_recommendation/src/model_compare_component.py`
   - 改用 NDCG@20 或 REWH@20 取代 auRoc

### 加 Session Intent Features（P1）
7. `data-feature-store/data_feast/user/views.py`
   - 把 `user_session_signals.sqlx` 的欄位接入 Feast v3
8. `data-feature-store/data_feast/services.py`
   - 更新 `livestream_recommendation_v3` FeatureService

### 加 User-Creator Affinity（P1）
9. `data-feature-store/definitions/intermediate/user/`
   - 新增 `user_creator_watch_history.sqlx`（from `user_creator_watch_daily`）
10. `data-feature-store/data_feast/user/views.py`
    - 新增 `user_creator_affinity_fv`

### 加 Creator Revenue Scale（P1）
11. `data-feature-store/definitions/intermediate/creator/creator_transaction.sqlx`
    - 加入 absolute amount + per-viewer efficiency 欄位
12. `data-feature-store/data_feast/creator/views.py`
    - 更新 `creator_transaction_fv`

---

## 六、關鍵程式碼位置速查表

| 想改什麼 | 檔案路徑 |
|---------|---------|
| Training label | `data-feature-store/definitions/outputs/training/livestream_label.sqlx` |
| Feature join & embedding transform | `muse/.../src/feast_featurize_component.py` |
| y / sample_weight 計算 | `muse/.../src/train_file_transformation_component.py` |
| XGBoost objective / hyperparams | `muse/.../xgboost_trainer/trainer/task.py` |
| Offline evaluation metrics | `muse/.../src/direct_evaluation_component.py` |
| Model selection logic | `muse/.../src/model_compare_component.py` |
| Feast feature service 定義 | `data-feature-store/data_feast/services.py` |
| Creator feature views | `data-feature-store/data_feast/creator/views.py` |
| User feature views | `data-feature-store/data_feast/user/views.py` |
| Serving predictor | `muse/muse/model_endpoint/livestream_recommendation/predictor.py` |
| API endpoints | `data-api/app/livestream/router.py` |
| API service logic | `data-api/app/livestream/service.py` |
| Session signals (未接入) | `data-feature-store/definitions/intermediate/user/user_session_signals.sqlx` |
| Creator room status logic | `data-feature-store/definitions/intermediate/creator/creator_livestream_room_status.sqlx` |
