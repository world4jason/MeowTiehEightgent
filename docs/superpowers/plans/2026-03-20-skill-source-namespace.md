# Skill Source / Namespace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Skills 可以帶 source 標籤，gstack 來的 skill 在 UI 顯示為 `gstack:review`，透過 symlink 自動偵測，未來任何 skill 都可在 frontmatter 宣告來源。

**Architecture:** Backend `parse_skill()` 偵測 symlink 指向 `gstack/` 自動補 source 欄位，也支援 frontmatter 手動宣告。`/skills` API 回傳 `display_name = "{source}:{slug}"`，前端的 skill picker 和 chip 直接顯示。技能呼叫時若輸入 `/gstack:review`，backend 解析 source prefix 後找對應 slug。

**Tech Stack:** Python 3 / FastAPI (`app.py`), vanilla JS (`static/index.html`), pytest (`test_api.py`)

---

## File Map

- **Modify:** `app.py:1281-1299` — `parse_skill()` 加 source 偵測
- **Modify:** `app.py:1302-1315` — `list_skills()` 傳 slug_dir、expose source 欄位
- **Modify:** `app.py:387-394` — `resolve_human_text()` 處理 `gstack:review` 格式
- **Modify:** `static/index.html:3009-3018` — `renderSkillChips()` 顯示 display_name
- **Modify:** `static/index.html:3838-3847` — `showSkillPicker()` 使用 display_name
- **Modify:** `test_api.py` — 加 source / symlink 偵測的測試

---

## Task 1: Backend — `parse_skill()` 加 source 偵測

**Files:**
- Modify: `app.py:1281-1299`
- Test: `test_api.py` (class `TestParseSkill` 或加到現有)

- [ ] **Step 1: 寫失敗測試 — frontmatter source 欄位**

```python
class TestParseSkillSource:
    def test_reads_source_from_frontmatter(self, tmp_path):
        from app import parse_skill
        f = tmp_path / "SKILL.md"
        f.write_text("---\nname: review\nsource: gstack\nsource_url: https://github.com/garrytan/gstack\nsource_version: 0.9.0\ndescription: Code review\n---\n\nBody here")
        s = parse_skill(f)
        assert s["source"] == "gstack"
        assert s["source_url"] == "https://github.com/garrytan/gstack"
        assert s["source_version"] == "0.9.0"

    def test_source_defaults_empty_when_absent(self, tmp_path):
        from app import parse_skill
        f = tmp_path / "SKILL.md"
        f.write_text("---\nname: brainstorm\ndescription: Think\n---\n\nBody")
        s = parse_skill(f)
        assert s["source"] == ""
        assert s["source_url"] == ""
        assert s["source_version"] == ""

    def test_autodetects_gstack_symlink(self, tmp_path):
        from app import parse_skill
        # Set up: skills/gstack/review/SKILL.md
        gstack_dir = tmp_path / "gstack" / "review"
        gstack_dir.mkdir(parents=True)
        skill_file = gstack_dir / "SKILL.md"
        skill_file.write_text("---\nname: review\ndescription: Review\n---\n\nBody")
        # Create VERSION file
        (tmp_path / "gstack" / "VERSION").write_text("0.9.0")
        # Create symlink: skills/review -> gstack/review
        link_dir = tmp_path / "review"
        link_dir.symlink_to(gstack_dir)
        s = parse_skill(link_dir / "SKILL.md", slug_dir=link_dir)
        assert s["source"] == "gstack"
        assert s["source_url"] == "https://github.com/garrytan/gstack"
        assert s["source_version"] == "0.9.0"
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
python3 -m pytest test_api.py::TestParseSkillSource -v
```
Expected: FAIL（`parse_skill` 沒有 source 欄位、簽名不接受 `slug_dir`）

- [ ] **Step 3: 實作 `parse_skill()`**

在 `app.py` 找到 `def parse_skill(skill_file: Path) -> dict:` (~1281)，改為：

```python
def parse_skill(skill_file: Path, slug_dir: Path | None = None) -> dict:
    raw = skill_file.read_text().strip()
    name = skill_file.parent.name
    description = ""
    source = ""
    source_url = ""
    source_version = ""
    body = raw
    if raw.startswith("---"):
        end = raw.find("---", 3)
        if end != -1:
            fm = raw[3:end].strip()
            body = raw[end + 3:].strip()
            for line in fm.splitlines():
                if line.startswith("name:"):
                    name = line[5:].strip()
                elif line.startswith("description:"):
                    description = line[12:].strip()
                elif line.startswith("source:"):
                    source = line[7:].strip()
                elif line.startswith("source_url:"):
                    source_url = line[11:].strip()
                elif line.startswith("source_version:"):
                    source_version = line[15:].strip()
    if not description:
        lines = [l for l in body.splitlines() if l.strip() and not l.startswith("#")]
        description = lines[0].strip() if lines else ""
    # Auto-detect gstack via symlink
    if not source and slug_dir and slug_dir.is_symlink():
        target = os.readlink(slug_dir)
        if "gstack" in target:
            source = "gstack"
            source_url = "https://github.com/garrytan/gstack"
            # Try to read VERSION from gstack dir
            version_file = slug_dir.resolve().parent.parent / "VERSION"
            if not version_file.exists():
                version_file = slug_dir.resolve().parent / "VERSION"
            if version_file.exists():
                source_version = version_file.read_text().strip()
    return {
        "name": name,
        "description": description,
        "body": body,
        "source": source,
        "source_url": source_url,
        "source_version": source_version,
    }
```

確認頂端有 `import os`（app.py 應已有，若無則加在 imports 區）。

- [ ] **Step 4: 執行測試確認通過**

```bash
python3 -m pytest test_api.py::TestParseSkillSource -v
```
Expected: 3 PASS

- [ ] **Step 5: 確認舊測試不壞**

```bash
python3 -m pytest test_api.py -v -x
```
Expected: 全部 PASS

- [ ] **Step 6: Commit**

```bash
git add app.py test_api.py
git commit -m "feat(skills): parse_skill detects source from frontmatter and gstack symlink"
```

---

## Task 2: Backend — `list_skills()` expose display_name + source

**Files:**
- Modify: `app.py:1302-1315`
- Test: `test_api.py`

- [ ] **Step 1: 寫失敗測試**

```python
class TestListSkillsSource:
    def _make_skill(self, root, slug, source="", name=None):
        d = root / "skills" / slug
        d.mkdir(parents=True, exist_ok=True)
        n = name or slug
        fm = f"name: {n}\n"
        if source:
            fm += f"source: {source}\n"
        (d / "SKILL.md").write_text(f"---\n{fm}---\n\nBody")

    def test_list_includes_source_fields(self, client, tmp_project):
        self._make_skill(tmp_project, "my-review", source="gstack", name="review")
        r = client.get("/skills")
        assert r.status_code == 200
        item = next(x for x in r.json() if x["slug"] == "my-review")
        assert item["source"] == "gstack"
        assert "source_url" in item
        assert "source_version" in item

    def test_list_display_name_with_source(self, client, tmp_project):
        self._make_skill(tmp_project, "my-review", source="gstack", name="review")
        r = client.get("/skills")
        item = next(x for x in r.json() if x["slug"] == "my-review")
        assert item["name"] == "gstack:review"

    def test_list_display_name_without_source(self, client, tmp_project):
        self._make_skill(tmp_project, "brainstorm", name="brainstorm")
        r = client.get("/skills")
        item = next(x for x in r.json() if x["slug"] == "brainstorm")
        assert item["name"] == "brainstorm"
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
python3 -m pytest test_api.py::TestListSkillsSource -v
```
Expected: FAIL

- [ ] **Step 3: 實作 `list_skills()`**

找到 `@app.get("/skills")` (~1302)，改為：

```python
@app.get("/skills")
async def list_skills():
    skills_dir = PROJECT_DIR / "skills"
    result = []
    for slug_dir in sorted(skills_dir.iterdir()):
        if not slug_dir.is_dir():
            continue
        sf = find_skill_file(slug_dir)
        if sf:
            s = parse_skill(sf, slug_dir=slug_dir)
            display_name = f"{s['source']}:{s['name']}" if s.get("source") else s["name"]
            result.append({
                "slug": slug_dir.name,
                "name": display_name,
                "description": s["description"],
                "source": s.get("source", ""),
                "source_url": s.get("source_url", ""),
                "source_version": s.get("source_version", ""),
                "missing": False,
            })
        else:
            result.append({"slug": slug_dir.name, "name": slug_dir.name, "description": "", "source": "", "source_url": "", "source_version": "", "missing": True})
    return result
```

- [ ] **Step 4: 執行測試確認通過**

```bash
python3 -m pytest test_api.py::TestListSkillsSource -v
```
Expected: 3 PASS

- [ ] **Step 5: 跑全套測試**

```bash
python3 -m pytest test_api.py -v -x
```
Expected: 全部 PASS

- [ ] **Step 6: Commit**

```bash
git add app.py test_api.py
git commit -m "feat(skills): list_skills returns display_name with source prefix and source metadata"
```

---

## Task 3: Backend — `resolve_human_text()` 支援 `gstack:review` 格式

**Files:**
- Modify: `app.py:387-394`
- Test: `test_api.py`

- [ ] **Step 1: 寫失敗測試**

```python
class TestResolveSkillWithSource:
    def _make_gstack_skill(self, root, slug):
        gstack = root / "skills" / "gstack" / slug
        gstack.mkdir(parents=True, exist_ok=True)
        (gstack / "SKILL.md").write_text(f"---\nname: {slug}\ndescription: Gstack {slug}\n---\n\nSkill body for {slug}")
        link = root / "skills" / slug
        if not link.exists():
            link.symlink_to(gstack)

    def test_resolve_with_source_prefix(self, tmp_project):
        import app as a
        self._make_gstack_skill(tmp_project, "review")
        text, skill_name = a.resolve_human_text("/gstack:review")
        assert skill_name is not None
        assert "review" in skill_name.lower()
        assert "Skill body for review" in text

    def test_resolve_without_source_prefix_still_works(self, tmp_project):
        import app as a
        self._make_gstack_skill(tmp_project, "review")
        text, skill_name = a.resolve_human_text("/review")
        assert skill_name is not None
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
python3 -m pytest test_api.py::TestResolveSkillWithSource -v
```
Expected: FAIL（`/gstack:review` 找不到 skill）

- [ ] **Step 3: 實作 `resolve_human_text()` 的 source prefix 解析**

找到 `def resolve_human_text` (~387)，在 `find_skill_file` 找不到時加 fallback：

```python
def resolve_human_text(text: str, workspace_id: str | None = None) -> tuple[str, str | None]:
    if text.startswith("/"):
        skill_name = text[1:].strip().lower()
        skill_file = find_skill_file(PROJECT_DIR / "skills" / skill_name)
        # Fallback: handle "source:slug" format (e.g. "gstack:review")
        if not skill_file and ":" in skill_name:
            source_prefix, slug_part = skill_name.split(":", 1)
            # Try skills/{slug} (symlink from gstack setup)
            skill_file = find_skill_file(PROJECT_DIR / "skills" / slug_part)
            # Try skills/{source}/{slug} (direct subdirectory)
            if not skill_file:
                skill_file = find_skill_file(PROJECT_DIR / "skills" / source_prefix / slug_part)
        if skill_file:
            s = parse_skill(skill_file)
            display_name = f"{s['source']}:{s['name']}" if s.get("source") else s["name"]
            history_entry = f"[Skill invoked: {display_name}]\n\n{s['body']}\n\nAll agents: apply this skill now in your next response."
            return history_entry, display_name
    # ... rest of function unchanged
```

- [ ] **Step 4: 執行測試確認通過**

```bash
python3 -m pytest test_api.py::TestResolveSkillWithSource -v
```
Expected: 2 PASS

- [ ] **Step 5: 跑全套測試**

```bash
python3 -m pytest test_api.py -v -x
```
Expected: 全部 PASS

- [ ] **Step 6: Commit**

```bash
git add app.py test_api.py
git commit -m "feat(skills): resolve_human_text handles gstack:review source:slug format"
```

---

## Task 4: UI — Skill picker 顯示 source prefix

**Files:**
- Modify: `static/index.html:3838-3847` (`showSkillPicker`)
- Modify: `static/index.html:3009-3018` (`renderSkillChips`)

> Note: Skill picker (`showSkillPicker`) 已經用 `s.name` 顯示，後端改完後 `s.name` 就會是 `gstack:review`，**picker 本身不需改**。需改的是 chip display（目前顯示 slug 字串）。

- [ ] **Step 1: 改 `renderSkillChips()` 以顯示 display_name**

找到 `function renderSkillChips()` (~3009)，把 chip 的 slug 查表換成 display name：

```javascript
function renderSkillChips() {
  const chips = document.getElementById('pcfg-skill-chips');
  if (!chips) return;
  if (currentAgentSkills === null) {
    chips.innerHTML = `<span class="skill-chip-tag">全部技能</span>`;
  } else if (currentAgentSkills.length === 0) {
    chips.innerHTML = `<span class="skill-chip-none">未選擇任何技能</span>`;
  } else {
    chips.innerHTML = currentAgentSkills.map(slug => {
      const skill = skillData.find(s => s.slug === slug);
      const label = skill ? skill.name : slug;
      return `<span class="skill-chip-tag">${esc(label)}</span>`;
    }).join('');
  }
}
```

- [ ] **Step 2: 手動測試**

啟動 server：
```bash
python3 -m uvicorn app:app --reload
```
瀏覽器開 `http://localhost:8000`：
1. 輸入 `/` → picker 應顯示 `/gstack:review`, `/gstack:qa` 等
2. 輸入 `/gstack:` → 只顯示 gstack skills
3. 選擇一個 agent → settings → skill chips 顯示 `gstack:review` 而非 `review`
4. 在 input 輸入 `/gstack:review` 並送出 → skill 正確被觸發

- [ ] **Step 3: Commit**

```bash
git add static/index.html
git commit -m "feat(ui): skill chips show source-prefixed display name (gstack:review)"
```

---

## Task 5: Docs — 更新 devlog

- [ ] **Step 1: 寫 devlog**

在 `docs/devlog/` 找到或建立今日的 devlog 檔，加入：

```markdown
## Skill Source / Namespace System

- 安裝 gstack 到 `skills/gstack/`（symlinks 自動展開）
- Backend: `parse_skill()` 偵測 gstack symlink，自動補 `source`, `source_url`, `source_version`
- Frontmatter 支援手動宣告 `source:` 供任何 skill 使用
- `/skills` API 回傳 `display_name = "gstack:review"` 格式
- `resolve_human_text()` 支援 `/gstack:review` 格式呼叫
- UI: skill picker 和 chips 顯示帶來源的名稱
```

- [ ] **Step 2: Commit**

```bash
git add docs/
git commit -m "docs: skill source namespace system devlog"
```
