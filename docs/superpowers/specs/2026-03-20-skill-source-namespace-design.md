# Skill Source / Namespace System

**Date:** 2026-03-20
**Status:** Approved

## Goal

讓每個 skill 可以標注來源（source），在 UI 上以 `source:name` 格式顯示（例如 `/gstack:review`）。gstack 是第一個使用者，未來開放所有人貼標籤。

## Architecture

### Frontmatter 欄位

任何 SKILL.md 都可以聲明：

```yaml
---
name: review
source: gstack
source_url: https://github.com/garrytan/gstack
source_version: 0.9.0
description: ...
---
```

`source_url` 和 `source_version` 可選，方便追蹤更新來源。

### Auto-detect for gstack

gstack 的 SKILL.md 是 auto-generated，不改 template。
改為：backend 偵測 skill 目錄是否為 symlink 且目標路徑包含 `gstack/`，若是則：
- `source` = `"gstack"`
- `source_url` = `"https://github.com/garrytan/gstack"`
- `source_version` = 讀取 `skills/gstack/VERSION` 檔

優先順序：frontmatter `source:` > symlink auto-detect。

### Backend changes (`app.py`)

1. **`parse_skill(skill_file, slug_dir)`** — 加入 source 相關欄位：
   - 讀 frontmatter 中的 `source:`、`source_url:`、`source_version:`
   - 若無 source，檢查 `slug_dir` 是否為 symlink 且 `os.readlink()` 包含 `gstack/`，若是：
     - `source = "gstack"`
     - `source_url = "https://github.com/garrytan/gstack"`
     - `source_version` = 讀 `gstack/VERSION`
   - 回傳 dict 包含 `source`、`source_url`、`source_version` 欄位

2. **`list_skills()` 回傳格式** — 每個 skill object 加上 `source`、`source_url`、`source_version`

3. **Skill 呼叫解析** (`resolve_human_text`) — 使用者輸入 `/gstack:review` 時：
   - 先直接查 `skills/gstack:review/`（若 symlink 以此命名）
   - 若無，strip prefix，查 `skills/review/` 並驗證 source 匹配
   - Fallback：查 `skills/gstack/review/SKILL.md`

4. **顯示 name** — `display_name = f"{source}:{slug}"` if source else slug

### UI changes (`static/index.html`)

1. **Skill picker** (`/` 觸發的下拉) — 顯示 `/{source}:{name}` 或 `/{name}`
2. **Settings panel skill list** — skill chip 和 checklist 顯示帶 source 的 name
3. **輸入補全** — 輸入 `/gstack:` 可篩出所有 gstack skills

## Data Flow

```
User types "/gstack:review"
  → resolve_human_text strips prefix
  → finds skills/review/ (symlink → gstack/review)
  → validates source == "gstack"
  → loads SKILL.md, injects into conversation
```

```
GET /skills
  → list_skills() scans skills/
  → parse_skill() detects symlinks → adds source field
  → returns [{slug, name, description, source}, ...]
```

## Future

- Settings panel 加 UI 讓使用者手動設定任意 skill 的 source
- 支援 `superpowers:brainstorming`、`myteam:deploy` 等其他 namespace
- 可加 `tags:` 欄位做更細的分類
