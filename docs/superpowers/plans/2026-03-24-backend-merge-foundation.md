# Backend Merge Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify agent config format, migrate to UUID folders, create adapter presets, and build startup sync — so the same agent identity works in both Chat and Cowork.

**Architecture:** File-first approach. `agents/{uuid}-{name}/config.json` is source of truth. Python Chat backend reads files directly. Node.js Mth backend syncs file → DB on startup. Global `config.json` gains `company` and `adapter_presets` sections replacing the old `models` table.

**Tech Stack:** Python (FastAPI), Node.js (Express + Drizzle ORM), PostgreSQL, React + TypeScript

**Spec:** `docs/superpowers/specs/2026-03-24-backend-merge-design.md`

---

## File Structure

### New Files
- `migrate_to_v1.py` — One-time migration script (config format + folder rename)
- `server/src/services/agent-file-sync.ts` — Startup sync service (file → DB)
- `tests/test_migration.py` — Migration script tests
- `tests/test_agent_registry.py` — Agent registry tests for new format

### Modified Files

**Config:**
- `config.json` — `models` → `adapter_presets`, add `company`

**Python Backend (`app.py`):**
- `load_models()` (L164-166) → `load_adapter_presets()`
- `get_agent_registry()` (L310-353) — UUID folder parsing, new config format
- `stream_cli_agent()` (L816-992) — Read from merged adapter config
- `stream_api_agent()` (L993-1074) — Read from merged adapter config
- `resolve_thinking_model()` (L1043-1072) — Use adapter presets
- Model CRUD endpoints (L1203-1251) → Adapter preset CRUD
- Agent CRUD endpoints (L1440-1568) — UUID folder awareness
- Marketplace install (L1379-1439) — Generate UUID folder on install

**DB Schema:**
- `packages/db/src/schema/agents.ts` — Add `fileKey`, `fileManaged` columns
- New migration: `packages/db/src/migrations/0017_agent_file_sync.sql`

**Node.js Backend:**
- `server/src/index.ts` — Hook sync into startup sequence

**UI:**
- `ui/src/chat/types.ts` — AgentInfo, ModelInfo type updates
- `ui/src/chat/hooks/useChatApi.ts` — Agent query key changes
- `ui/src/chat/settings/useSettingsApi.ts` — Model hooks → adapter preset hooks
- `ui/src/chat/settings/ModelsTab.tsx` → `AdapterPresetsTab.tsx`
- `ui/src/chat/settings/AgentsTab.tsx` — UUID + new fields

---

## Task 1: Migration Script — Config Format + Folder Rename

**Files:**
- Create: `migrate_to_v1.py`
- Create: `tests/test_migration.py`
- Modify: `agents/*/config.json` (all agent folders)
- Modify: `config.json` (root)

### Step-by-step

- [ ] **Step 1: Write test for config v1 migration**

```python
# tests/test_migration.py
import json, tempfile, shutil
from pathlib import Path

def make_agent_dir(base: Path, name: str, config: dict):
    d = base / name
    d.mkdir()
    (d / "config.json").write_text(json.dumps(config))
    (d / "AGENT.md").write_text(f"# {name}")
    return d

def test_migrate_agent_config_to_v1():
    """v0 agent config (model soft ref) → v1 (adapter + adapterConfig)"""
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        agents_dir = base / "agents"
        agents_dir.mkdir()

        # v0 config
        make_agent_dir(agents_dir, "claude", {
            "emoji": "🟣", "color": "#a78bfa",
            "description": "Claude agent", "model": "claude",
            "skills": ["brainstorming"], "enabled": True,
            "supports_thinking": True
        })

        # Global config with models
        (base / "config.json").write_text(json.dumps({
            "models": {
                "claude": {
                    "type": "cli", "cmd": ["claude", "--print"],
                    "color": "#a78bfa", "emoji": "🟣",
                    "idle_timeout_seconds": 120
                }
            }
        }))

        from migrate_to_v1 import migrate_agents, MODEL_TO_ADAPTER
        migrate_agents(agents_dir, base / "config.json")

        # Should have exactly one UUID-prefixed folder
        folders = [f for f in agents_dir.iterdir() if f.is_dir()]
        assert len(folders) == 1
        folder = folders[0]
        assert folder.name != "claude"  # renamed
        assert "-" in folder.name       # has UUID prefix

        config = json.loads((folder / "config.json").read_text())
        assert config["configVersion"] == 1
        assert config["adapter"] == "claude_local"
        assert config["name"] == "claude"
        assert "id" in config
        assert "model" not in config  # old field removed
        assert "supports_thinking" not in config  # derived from model_tiers
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/jasonyeh/code_ground/agent-cli-converation && python3 -m pytest tests/test_migration.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'migrate_to_v1'`

- [ ] **Step 3: Write migration script**

```python
# migrate_to_v1.py
"""One-time migration: agent configs v0 → v1, folder rename to {uuid}-{name}."""
import json, uuid, sys
from pathlib import Path

MODEL_TO_ADAPTER = {
    "claude": "claude_local",
    "gemini": "gemini_local",
    "ollama": "ollama_api",
    "codex": "codex_local",
    "gemini-2.5-pro": "gemini_local",
}

MODELS_TO_ADAPTER_PRESETS = {
    "claude": "claude_local",
    "gemini": "gemini_local",
    "ollama": "ollama_api",
    "codex": "codex_local",
    "gemini-2.5-pro": "gemini_local",
}

def migrate_agent_config(config: dict, agent_name: str, models: dict) -> dict:
    """Convert a single agent config from v0 to v1."""
    if config.get("configVersion") == 1:
        return config

    model_key = config.pop("model", "")
    adapter = MODEL_TO_ADAPTER.get(model_key, "claude_local")

    new_config = {
        "configVersion": 1,
        "id": str(uuid.uuid4()),
        "name": agent_name,
        "role": config.pop("role", "general"),
        "title": config.pop("title", None),
        "emoji": config.pop("emoji", "🤖"),
        "color": config.pop("color", "#888888"),
        "description": config.pop("description", ""),
        "enabled": config.pop("enabled", True),
        "adapter": adapter,
    }

    # Build adapterConfig from model info
    adapter_config = {}
    model_info = models.get(model_key, {})
    if model_info.get("apiModel"):
        adapter_config["model"] = model_info["apiModel"]
    elif model_key and model_key != adapter.replace("_local", "").replace("_api", ""):
        adapter_config["model"] = model_key
    if adapter_config:
        new_config["adapterConfig"] = adapter_config

    # model_tiers: convert model soft refs to model IDs
    old_tiers = config.pop("model_tiers", None)
    if old_tiers:
        new_tiers = {}
        for tier_key, tier_model in old_tiers.items():
            m = models.get(tier_model, {})
            if m.get("apiModel"):
                new_tiers[tier_key] = m["apiModel"]
            elif m.get("extra_flags"):
                # Extract model name from extra_flags like ["--model", "gemini-2.5-pro"]
                flags = m["extra_flags"]
                for i, f in enumerate(flags):
                    if f == "--model" and i + 1 < len(flags):
                        new_tiers[tier_key] = flags[i + 1]
                        break
                else:
                    new_tiers[tier_key] = tier_model
            else:
                new_tiers[tier_key] = tier_model
        new_config["model_tiers"] = new_tiers

    # supports_thinking → generate model_tiers if missing
    had_thinking = config.pop("supports_thinking", False)
    if had_thinking and not old_tiers:
        # Agent has supports_thinking but no model_tiers — generate default tiers
        THINKING_DEFAULTS = {
            "claude_local": {"default": "claude-sonnet-4-6", "thinking": "claude-opus-4-6"},
            "gemini_local": {"default": "gemini-2.5-flash", "thinking": "gemini-2.5-pro"},
        }
        if adapter in THINKING_DEFAULTS:
            new_config["model_tiers"] = THINKING_DEFAULTS[adapter]

    config.pop("type", None)  # derived from adapter

    # Pass through remaining fields
    skills = config.pop("skills", [])
    if skills:
        new_config["skills"] = skills

    # Cowork fields (defaults)
    new_config["reportsTo"] = config.pop("reportsTo", None)
    new_config["permissions"] = config.pop("permissions", {})
    new_config["budget"] = config.pop("budget", 0)
    new_config["heartbeat"] = config.pop("heartbeat", {
        "cooldownSec": 10,
        "intervalSec": 3600,
    })

    return new_config


def migrate_global_config(config_path: Path) -> dict:
    """Convert config.json: models → adapter_presets, add company."""
    config = json.loads(config_path.read_text())
    if "adapter_presets" in config:
        return config

    models = config.pop("models", {})
    presets = {}

    # Group model entries by adapter type
    for model_key, model_info in models.items():
        adapter_type = MODELS_TO_ADAPTER_PRESETS.get(model_key)
        if not adapter_type:
            continue
        if adapter_type in presets:
            continue  # Already have a preset for this adapter

        preset = {}
        if model_info.get("type") == "cli":
            cmd = model_info.get("cmd", [])
            if cmd:
                preset["command"] = cmd[0]
                preset["defaultArgs"] = cmd[1:]
            preset["timeoutSec"] = model_info.get("idle_timeout_seconds", 120)
            preset["startupTimeoutSec"] = model_info.get("startup_timeout_seconds", 120)
        elif model_info.get("type") == "api":
            preset["baseUrl"] = model_info.get("baseUrl", "")
            preset["timeoutSec"] = model_info.get("idle_timeout_seconds", 120)

        if model_info.get("apiModel"):
            preset["defaultModel"] = model_info["apiModel"]

        if model_info.get("supports_image") is not None:
            preset["supports_image"] = model_info["supports_image"]

        presets[adapter_type] = preset

    # Add company
    if "company" not in config:
        config["company"] = {
            "id": str(uuid.uuid4()),
            "name": "MeowTiehEightgent",
        }

    config["adapter_presets"] = presets
    config_path.write_text(json.dumps(config, indent=2, ensure_ascii=False) + "\n")
    return config


def migrate_agents(agents_dir: Path, config_path: Path):
    """Migrate all agent folders: config v0→v1, rename to {uuid}-{name}."""
    config = json.loads(config_path.read_text())
    models = config.get("models", {})

    for agent_dir in sorted(agents_dir.iterdir()):
        if not agent_dir.is_dir():
            continue
        if agent_dir.name.startswith("_") or agent_dir.name.startswith("Default_"):
            continue  # Skip _default/ and Default_* template instances

        config_file = agent_dir / "config.json"
        if not config_file.exists():
            continue

        agent_config = json.loads(config_file.read_text())
        if agent_config.get("configVersion") == 1:
            continue  # Already migrated

        agent_name = agent_dir.name
        new_config = migrate_agent_config(agent_config, agent_name, models)

        # Write updated config
        config_file.write_text(
            json.dumps(new_config, indent=2, ensure_ascii=False) + "\n"
        )

        # Rename folder: {name} → {short-uuid}-{name}
        short_uuid = new_config["id"][:8]
        new_name = f"{short_uuid}-{agent_name}"
        new_dir = agents_dir / new_name
        agent_dir.rename(new_dir)


if __name__ == "__main__":
    project_root = Path(__file__).parent
    agents_dir = project_root / "agents"
    config_path = project_root / "config.json"

    print("Migrating global config.json...")
    migrate_global_config(config_path)

    print("Migrating agent configs and folders...")
    migrate_agents(agents_dir, config_path)

    print("Done!")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m pytest tests/test_migration.py -v`
Expected: PASS

- [ ] **Step 5: Write test for global config migration**

```python
# tests/test_migration.py — append
def test_migrate_global_config():
    """models table → adapter_presets + company"""
    with tempfile.TemporaryDirectory() as tmp:
        config_path = Path(tmp) / "config.json"
        config_path.write_text(json.dumps({
            "summarization_model": "haiku",
            "models": {
                "claude": {
                    "type": "cli", "cmd": ["claude", "--print"],
                    "idle_timeout_seconds": 120, "supports_image": True
                },
                "ollama": {
                    "type": "api", "baseUrl": "http://127.0.0.1:11434",
                    "apiModel": "llama3.2"
                }
            }
        }))

        from migrate_to_v1 import migrate_global_config
        result = migrate_global_config(config_path)

        assert "adapter_presets" in result
        assert "models" not in result
        assert "company" in result
        assert result["company"]["name"] == "MeowTiehEightgent"
        assert "claude_local" in result["adapter_presets"]
        assert result["adapter_presets"]["claude_local"]["command"] == "claude"
        assert "ollama_api" in result["adapter_presets"]
        assert result["adapter_presets"]["ollama_api"]["defaultModel"] == "llama3.2"
        assert result["summarization_model"] == "haiku"  # preserved


def test_migrate_preserves_model_tiers():
    """model_tiers soft refs → actual model IDs"""
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        agents_dir = base / "agents"
        agents_dir.mkdir()

        make_agent_dir(agents_dir, "gemini", {
            "emoji": "🟢", "model": "gemini", "enabled": True,
            "model_tiers": {"default": "gemini", "thinking": "gemini-2.5-pro"}
        })

        (base / "config.json").write_text(json.dumps({
            "models": {
                "gemini": {"type": "cli", "cmd": ["gemini", "-p"]},
                "gemini-2.5-pro": {
                    "type": "cli", "cmd": ["gemini", "-p"],
                    "extra_flags": ["--model", "gemini-2.5-pro"]
                }
            }
        }))

        from migrate_to_v1 import migrate_agents
        migrate_agents(agents_dir, base / "config.json")

        folders = [f for f in agents_dir.iterdir() if f.is_dir()]
        config = json.loads((folders[0] / "config.json").read_text())
        assert config["model_tiers"]["thinking"] == "gemini-2.5-pro"
        assert config["adapter"] == "gemini_local"


def test_migrate_skips_default_folder():
    """_default/ template should not be migrated"""
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        agents_dir = base / "agents"
        agents_dir.mkdir()
        (agents_dir / "_default").mkdir()
        (agents_dir / "_default" / "AGENT.md").write_text("template")

        make_agent_dir(agents_dir, "claude", {
            "emoji": "🟣", "model": "claude", "enabled": True
        })

        (base / "config.json").write_text(json.dumps({"models": {
            "claude": {"type": "cli", "cmd": ["claude", "--print"]}
        }}))

        from migrate_to_v1 import migrate_agents
        migrate_agents(agents_dir, base / "config.json")

        assert (agents_dir / "_default").exists()  # untouched
        non_default = [f for f in agents_dir.iterdir() if not f.name.startswith("_")]
        assert len(non_default) == 1
        assert non_default[0].name != "claude"  # renamed
```

- [ ] **Step 6: Run all tests**

Run: `python3 -m pytest tests/test_migration.py -v`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add migrate_to_v1.py tests/test_migration.py
git commit -m "feat: migration script — agent config v0→v1, folder rename to UUID"
```

---

## Task 2: Python Backend — Load Adapter Presets

**Files:**
- Modify: `app.py` (L164-166: `load_models()`, L310-353: `get_agent_registry()`)
- Create: `tests/test_agent_registry.py`

### Step-by-step

- [ ] **Step 1: Write test for load_adapter_presets**

```python
# tests/test_agent_registry.py
import json, tempfile
from pathlib import Path

def test_load_adapter_presets():
    """Reads config.json adapter_presets section"""
    with tempfile.TemporaryDirectory() as tmp:
        config_path = Path(tmp) / "config.json"
        config_path.write_text(json.dumps({
            "adapter_presets": {
                "claude_local": {
                    "command": "claude",
                    "defaultArgs": ["--print"],
                    "timeoutSec": 120
                }
            }
        }))

        # We'll test against the actual function once extracted
        config = json.loads(config_path.read_text())
        presets = config.get("adapter_presets", {})
        assert "claude_local" in presets
        assert presets["claude_local"]["command"] == "claude"


def test_get_agent_registry_v1():
    """Agent registry reads v1 config with adapter + adapterConfig"""
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        agents_dir = base / "agents"
        agents_dir.mkdir()

        agent_dir = agents_dir / "a1b2c3d4-CTO"
        agent_dir.mkdir()
        (agent_dir / "config.json").write_text(json.dumps({
            "configVersion": 1,
            "id": "a1b2c3d4-0000-0000-0000-000000000000",
            "name": "CTO",
            "adapter": "claude_local",
            "adapterConfig": {"model": "claude-sonnet-4-6"},
            "emoji": "🟣", "color": "#a78bfa",
            "enabled": True, "role": "cto",
            "skills": []
        }))
        (agent_dir / "AGENT.md").write_text("# CTO")

        (base / "config.json").write_text(json.dumps({
            "adapter_presets": {
                "claude_local": {
                    "command": "claude",
                    "defaultArgs": ["--print"],
                    "defaultModel": "claude-sonnet-4-6",
                    "timeoutSec": 120,
                    "startupTimeoutSec": 120,
                    "supports_image": True
                }
            }
        }))

        # Simulate get_agent_registry logic
        config = json.loads((base / "config.json").read_text())
        presets = config.get("adapter_presets", {})

        agent_config = json.loads((agent_dir / "config.json").read_text())
        adapter_type = agent_config.get("adapter", "")
        preset = presets.get(adapter_type, {})
        agent_adapter_config = agent_config.get("adapterConfig", {})

        # Merge
        merged = {
            **agent_config,
            "type": "api" if "baseUrl" in preset else "cli",
            "workspace": str(agent_dir),
        }

        if preset.get("command"):
            cmd = [preset["command"]] + preset.get("defaultArgs", [])
            merged["cmd"] = cmd

        model = agent_adapter_config.get("model") or preset.get("defaultModel", "")
        merged["model"] = model

        timeout = agent_adapter_config.get("timeoutSec") or preset.get("timeoutSec", 120)
        merged["idle_timeout_seconds"] = timeout

        assert merged["cmd"] == ["claude", "--print"]
        assert merged["model"] == "claude-sonnet-4-6"
        assert merged["idle_timeout_seconds"] == 120
        assert merged["type"] == "cli"
        assert merged["role"] == "cto"
```

- [ ] **Step 2: Run test to verify it passes (logic test)**

Run: `python3 -m pytest tests/test_agent_registry.py -v`
Expected: PASS (this tests the merge logic, not app.py itself)

- [ ] **Step 3: Modify `app.py` — replace `load_models()` with `load_adapter_presets()`**

In `app.py`, replace `load_models()` (L164-166):

```python
# Before:
def load_models() -> dict:
    return load_config().get("models", DEFAULT_MODELS)

# After:
def load_adapter_presets() -> dict:
    """Load adapter connection presets from config.json."""
    config = load_config()
    # Support both old and new format
    if "adapter_presets" in config:
        return config["adapter_presets"]
    # Fallback: convert old models format
    models = config.get("models", DEFAULT_MODELS)
    presets = {}
    model_to_adapter = {
        "claude": "claude_local", "gemini": "gemini_local",
        "ollama": "ollama_api", "codex": "codex_local",
    }
    for model_key, model_info in models.items():
        adapter_type = model_to_adapter.get(model_key)
        if not adapter_type or adapter_type in presets:
            continue
        preset = {}
        if model_info.get("type") == "cli":
            cmd = model_info.get("cmd", [])
            if cmd:
                preset["command"] = cmd[0]
                preset["defaultArgs"] = cmd[1:]
            preset["timeoutSec"] = model_info.get("idle_timeout_seconds", 120)
            preset["startupTimeoutSec"] = model_info.get("startup_timeout_seconds", 120)
        elif model_info.get("type") == "api":
            preset["baseUrl"] = model_info.get("baseUrl", "")
            preset["timeoutSec"] = model_info.get("idle_timeout_seconds", 120)
        if model_info.get("apiModel"):
            preset["defaultModel"] = model_info["apiModel"]
        if model_info.get("supports_image") is not None:
            preset["supports_image"] = model_info["supports_image"]
        presets[adapter_type] = preset
    return presets
```

- [ ] **Step 4: Modify `get_agent_registry()` to use v1 format**

Replace the merge logic in `get_agent_registry()` (L310-353):

```python
def get_agent_registry() -> dict[str, dict]:
    """Load all agents by scanning agents/ folders for config.json."""
    presets = load_adapter_presets()
    registry: dict[str, dict] = {}

    for agent_dir in sorted(AGENTS_DIR.iterdir()):
        if not agent_dir.is_dir() or agent_dir.name.startswith("_"):
            continue
        config_path = agent_dir / "config.json"
        if not config_path.exists():
            continue

        agent = json.loads(config_path.read_text())

        # Resolve display name: v1 uses "name" field, v0 uses folder name
        if agent.get("configVersion") == 1:
            display_name = agent.get("name", agent_dir.name)
        else:
            display_name = agent_dir.name

        agent["workspace"] = str(agent_dir)

        # v1 format: adapter + adapterConfig
        adapter_type = agent.get("adapter", "")
        if adapter_type and adapter_type in presets:
            preset = presets[adapter_type]
            agent_adapter_config = agent.get("adapterConfig", {})

            agent["type"] = "api" if "baseUrl" in preset else "cli"

            if preset.get("command"):
                cmd = [preset["command"]] + preset.get("defaultArgs", [])
                agent["cmd"] = cmd

            if preset.get("baseUrl"):
                agent["baseUrl"] = preset["baseUrl"]

            model = agent_adapter_config.get("model") or preset.get("defaultModel", "")
            agent["model"] = model
            agent["model_id"] = adapter_type  # for json output flag detection

            for timeout_key, preset_key in [
                ("idle_timeout_seconds", "timeoutSec"),
                ("startup_timeout_seconds", "startupTimeoutSec"),
            ]:
                val = agent_adapter_config.get(preset_key) or preset.get(preset_key)
                if val:
                    agent[timeout_key] = val

            if "supports_image" not in agent and "supports_image" in preset:
                agent["supports_image"] = preset["supports_image"]

        else:
            # Fallback: v0 format (backward compat during migration)
            models = load_config().get("models", DEFAULT_MODELS)
            model_id = agent.get("model", "")
            agent["model_id"] = model_id
            if model_id in models:
                m = models[model_id]
                agent["type"] = m.get("type", "cli")
                if "cmd" in m:
                    base_cmd = list(m["cmd"])
                    for flag in m.get("extra_flags", []):
                        if flag not in base_cmd:
                            base_cmd.append(flag)
                    agent["cmd"] = base_cmd
                if "baseUrl" in m:
                    agent["baseUrl"] = m["baseUrl"]
                if "apiModel" in m:
                    agent["model"] = m["apiModel"]
                for tk in ("idle_timeout_seconds", "startup_timeout_seconds"):
                    if tk not in agent and tk in m:
                        agent[tk] = m[tk]

        registry[display_name] = agent

    return registry
```

- [ ] **Step 5: Update all `load_models()` call sites**

Search and replace remaining `load_models()` calls in `app.py`:
- Model CRUD endpoints (L1203-1251) — these will be updated in Task 5
- `resolve_thinking_model()` — updated in Task 3
- `_resolve_supports_image()` — update to use presets
- Ollama provider endpoints — update to read from `adapter_presets.ollama_api.baseUrl`

- [ ] **Step 6: Verify Chat still works**

Run: `uvicorn app:app --host 0.0.0.0 --port 8000`
Open UI, start a chat session, verify agent loads and responds.

- [ ] **Step 7: Commit**

```bash
git add app.py tests/test_agent_registry.py
git commit -m "feat: adapter presets — load_adapter_presets() + get_agent_registry() v1 support"
```

---

## Task 3: Python Backend — Streaming & Thinking Mode

**Files:**
- Modify: `app.py` (`resolve_thinking_model()` L1043-1072, `_resolve_supports_image()`)

### Step-by-step

- [ ] **Step 1: Update `resolve_thinking_model()` to use adapter presets**

```python
def resolve_thinking_model(agent: dict) -> dict:
    """Switch agent to thinking model variant (same adapter, different model param)."""
    tiers = agent.get("model_tiers")
    if not tiers or "thinking" not in tiers:
        return agent

    thinking_model = tiers["thinking"]
    copy = dict(agent)

    # v1: same adapter, just switch model parameter
    if agent.get("configVersion") == 1 or agent.get("adapter"):
        adapter_type = agent.get("adapter", "")
        presets = load_adapter_presets()
        preset = presets.get(adapter_type, {})

        # Model is just a parameter — reconstruct cmd with thinking model
        if "cmd" in copy:
            cmd = [preset.get("command", copy["cmd"][0])]
            cmd += preset.get("defaultArgs", [])
            # Add --model flag for the thinking variant
            cmd += ["--model", thinking_model]
            copy["cmd"] = cmd
        copy["model"] = thinking_model
        return copy

    # v0 fallback: look up thinking model in global models
    models = load_config().get("models", {})
    if thinking_model in models:
        m = models[thinking_model]
        if "cmd" in m:
            base_cmd = list(m["cmd"])
            for flag in m.get("extra_flags", []):
                if flag not in base_cmd:
                    base_cmd.append(flag)
            copy["cmd"] = base_cmd
        if "apiModel" in m:
            copy["model"] = m["apiModel"]
        for tk in ("idle_timeout_seconds", "startup_timeout_seconds"):
            if tk in m:
                copy[tk] = m[tk]

    return copy
```

- [ ] **Step 2: Update `_resolve_supports_image()`**

Find and update to check adapter presets when no agent-level override:

```python
def _resolve_supports_image(agent: dict) -> bool:
    if "supports_image" in agent:
        return agent["supports_image"]
    # v1: check adapter preset
    adapter_type = agent.get("adapter", "")
    if adapter_type:
        presets = load_adapter_presets()
        preset = presets.get(adapter_type, {})
        return preset.get("supports_image", True)
    # v0 fallback
    model_id = agent.get("model_id", "")
    models = load_config().get("models", {})
    return models.get(model_id, {}).get("supports_image", True)
```

- [ ] **Step 3: Verify think mode toggle works**

Run server, open Chat, switch an agent to think mode, verify it responds with thinking model.

- [ ] **Step 4: Commit**

```bash
git add app.py
git commit -m "feat: thinking mode uses adapter presets — same adapter, model as parameter"
```

---

## Task 4: Python Backend — Agent CRUD Endpoints (UUID Awareness)

**Files:**
- Modify: `app.py` (Agent CRUD L1440-1568, Marketplace install L1379-1439)

### Step-by-step

- [ ] **Step 1: Update agent CRUD to handle UUID folder names**

The agent registry now uses `display_name` (from `config.json name` field) as the key. Update endpoints:

- `GET /agents` — already works (registry keyed by display name)
- `GET /agents/{name}` — lookup by display name in registry
- `POST /agents` — generate UUID, create `{uuid}-{name}/` folder, write v1 config
- `PUT /agents/{name}` — find folder by display name match, update config.json
- `DELETE /agents/{name}` — find folder by display name, soft-delete (enabled=false)

```python
def _find_agent_dir(name: str) -> Path | None:
    """Find agent folder by display name (v1) or folder name (v0)."""
    # v1: scan for config.json with matching name field
    for d in AGENTS_DIR.iterdir():
        if not d.is_dir() or d.name.startswith("_"):
            continue
        cfg = d / "config.json"
        if cfg.exists():
            c = json.loads(cfg.read_text())
            if c.get("name") == name:
                return d
            # v0 fallback: folder name matches
            if d.name == name:
                return d
    return None
```

- [ ] **Step 2: Update `POST /agents` to generate UUID folder**

```python
@app.post("/agents")
async def create_agent(req: Request):
    body = await req.json()
    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(400, "name required")

    # Check if agent with this name already exists
    if _find_agent_dir(name):
        raise HTTPException(409, f"Agent '{name}' already exists")

    agent_id = str(uuid.uuid4())
    short_id = agent_id[:8]
    folder_name = f"{short_id}-{name}"
    agent_dir = AGENTS_DIR / folder_name
    agent_dir.mkdir()

    # Build v1 config
    presets = load_adapter_presets()
    adapter = body.get("adapter", list(presets.keys())[0] if presets else "claude_local")

    config = {
        "configVersion": 1,
        "id": agent_id,
        "name": name,
        "role": body.get("role", "general"),
        "title": body.get("title"),
        "emoji": body.get("emoji", "🤖"),
        "color": body.get("color", "#888888"),
        "description": body.get("description", ""),
        "enabled": True,
        "adapter": adapter,
        "adapterConfig": body.get("adapterConfig", {}),
        "model_tiers": body.get("model_tiers"),
        "skills": body.get("skills", []),
        "reportsTo": None,
        "permissions": {},
        "budget": 0,
        "heartbeat": {"cooldownSec": 10, "intervalSec": 3600},
    }

    (agent_dir / "config.json").write_text(
        json.dumps(config, indent=2, ensure_ascii=False) + "\n"
    )

    # Copy templates from _default/
    default_dir = AGENTS_DIR / "_default"
    for tmpl in ("AGENT.md", "IDENTITY.md", "SOUL.md", "MEMORY.md"):
        src = default_dir / tmpl
        if src.exists():
            content = src.read_text().replace("{name}", name)
            (agent_dir / tmpl).write_text(content)

    return JSONResponse({"ok": True, "name": name, "id": agent_id})
```

- [ ] **Step 3: Update marketplace install to generate UUID folder**

Update `POST /marketplace/agents/{agent_id}/install` to create UUID-prefixed folder for the installed agent.

- [ ] **Step 4: Test CRUD via Settings UI**

Create, edit, delete an agent from Settings. Verify UUID folder created correctly.

- [ ] **Step 5: Commit**

```bash
git add app.py
git commit -m "feat: agent CRUD generates UUID folders with v1 config"
```

---

## Task 5: Python Backend — Adapter Preset CRUD (Replace Model Endpoints)

**Files:**
- Modify: `app.py` (Model CRUD L1203-1251, Ollama endpoints L2072+)

### Step-by-step

- [ ] **Step 1: Replace model endpoints with adapter preset endpoints**

```python
@app.get("/adapter-presets")
async def list_adapter_presets():
    return load_adapter_presets()

@app.post("/adapter-presets")
async def create_adapter_preset(req: Request):
    body = await req.json()
    adapter_type = body.pop("adapter_type", "")
    if not adapter_type:
        raise HTTPException(400, "adapter_type required")
    config = load_config()
    presets = config.setdefault("adapter_presets", {})
    if adapter_type in presets:
        raise HTTPException(409, f"Preset '{adapter_type}' already exists")
    presets[adapter_type] = body
    save_config(config)
    return {"ok": True}

@app.put("/adapter-presets/{adapter_type}")
async def update_adapter_preset(adapter_type: str, req: Request):
    body = await req.json()
    config = load_config()
    presets = config.setdefault("adapter_presets", {})
    if adapter_type not in presets:
        raise HTTPException(404, f"Preset '{adapter_type}' not found")
    presets[adapter_type].update(body)
    save_config(config)
    return {"ok": True}

@app.delete("/adapter-presets/{adapter_type}")
async def delete_adapter_preset(adapter_type: str):
    config = load_config()
    presets = config.get("adapter_presets", {})
    if adapter_type not in presets:
        raise HTTPException(404)
    del presets[adapter_type]
    save_config(config)
    return {"ok": True}
```

- [ ] **Step 2: Keep old model endpoints as aliases (backward compat)**

```python
# Backward compat — keep old endpoints working during migration
@app.get("/models")
async def list_models():
    return load_adapter_presets()
```

- [ ] **Step 3: Update Ollama endpoints to read from adapter_presets**

```python
@app.get("/providers/ollama/models")
async def ollama_models(base_url: str = ""):
    if not base_url:
        presets = load_adapter_presets()
        ollama = presets.get("ollama_api", {})
        base_url = ollama.get("baseUrl", "http://127.0.0.1:11434")
    # ... rest unchanged
```

- [ ] **Step 4: Commit**

```bash
git add app.py
git commit -m "feat: adapter preset CRUD endpoints, replace model endpoints"
```

---

## Task 6: DB Migration — Add file_key, file_managed

**Files:**
- Modify: `packages/db/src/schema/agents.ts`
- Create: new migration SQL

### Step-by-step

- [ ] **Step 1: Add columns to schema**

In `packages/db/src/schema/agents.ts`, add after existing columns:

```typescript
fileKey: text("file_key"),
fileManaged: boolean("file_managed").default(true),
```

- [ ] **Step 2: Generate migration**

Run: `cd packages/db && pnpm drizzle-kit generate`

This should create `0017_agent_file_sync.sql` (or next sequence number).

- [ ] **Step 3: Verify migration SQL**

Check the generated SQL contains:
```sql
ALTER TABLE agents ADD COLUMN file_key TEXT;
ALTER TABLE agents ADD COLUMN file_managed BOOLEAN DEFAULT true;
```

- [ ] **Step 4: Add unique index manually if not auto-generated**

Append to migration:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS agents_company_file_key_idx
  ON agents (company_id, file_key)
  WHERE file_key IS NOT NULL;
```

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema/agents.ts packages/db/src/migrations/
git commit -m "feat(db): add file_key, file_managed columns to agents table"
```

---

## Task 7: Startup Sync — File → DB

**Files:**
- Create: `server/src/services/agent-file-sync.ts`
- Modify: `server/src/index.ts` (startup hook)

### Step-by-step

- [ ] **Step 1: Write the sync service**

```typescript
// server/src/services/agent-file-sync.ts
import fs from "node:fs";
import path from "node:path";
import type { Db } from "@meowtieheightgent/db";
import { eq, and } from "drizzle-orm";
import { agents, companies } from "@meowtieheightgent/db";

interface AgentFileConfig {
  configVersion: number;
  id: string;
  name: string;
  role?: string;
  title?: string | null;
  emoji?: string;
  color?: string;
  description?: string;
  enabled?: boolean;
  adapter?: string;
  adapterConfig?: Record<string, unknown>;
  model_tiers?: Record<string, string>;
  skills?: string[];
  reportsTo?: string | null;
  permissions?: Record<string, unknown>;
  budget?: number;
  heartbeat?: Record<string, unknown>;
}

interface CompanyConfig {
  id: string;
  name: string;
}

export async function syncAgentsFromFiles(
  db: Db,
  projectRoot: string,
  log: (msg: string) => void = console.log,
) {
  const configPath = path.join(projectRoot, "config.json");
  if (!fs.existsSync(configPath)) {
    log("[agent-file-sync] No config.json found, skipping");
    return;
  }

  const globalConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  const companyConfig: CompanyConfig | undefined = globalConfig.company;
  if (!companyConfig?.id) {
    log("[agent-file-sync] No company.id in config.json, skipping");
    return;
  }

  // Ensure company exists
  const existing = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyConfig.id))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(companies).values({
      id: companyConfig.id,
      name: companyConfig.name,
    });
    log(`[agent-file-sync] Created company: ${companyConfig.name}`);
  }

  // Scan agents/ directory
  const agentsDir = path.join(projectRoot, "agents");
  if (!fs.existsSync(agentsDir)) {
    log("[agent-file-sync] No agents/ directory, skipping");
    return;
  }

  const folders = fs.readdirSync(agentsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("_"));

  const syncedIds = new Set<string>();

  for (const folder of folders) {
    const configFile = path.join(agentsDir, folder.name, "config.json");
    if (!fs.existsSync(configFile)) continue;

    const config: AgentFileConfig = JSON.parse(
      fs.readFileSync(configFile, "utf-8"),
    );
    if (config.configVersion !== 1 || !config.id) continue;

    syncedIds.add(config.id);

    // Build DB record
    const agentMdPath = path.join(agentsDir, folder.name, "AGENT.md");
    const adapterConfig: Record<string, unknown> = {
      ...config.adapterConfig,
      instructionsFilePath: fs.existsSync(agentMdPath) ? agentMdPath : undefined,
    };

    const runtimeConfig: Record<string, unknown> = {};
    if (config.heartbeat) runtimeConfig.heartbeat = config.heartbeat;
    if (config.skills) runtimeConfig.desiredSkills = config.skills;

    const values = {
      id: config.id,
      companyId: companyConfig.id,
      name: config.name,
      role: config.role ?? "general",
      title: config.title ?? null,
      icon: config.emoji ?? null,
      status: config.enabled === false ? "paused" : "idle",
      capabilities: config.description ?? null,
      adapterType: config.adapter ?? "process",
      adapterConfig,
      runtimeConfig,
      budgetMonthlyCents: config.budget ?? 0,
      permissions: config.permissions ?? {},
      reportsTo: config.reportsTo ?? null,
      fileKey: folder.name,
      fileManaged: true,
    };

    // Upsert: check if exists, handle status carefully
    const existingAgent = await db
      .select()
      .from(agents)
      .where(eq(agents.id, config.id))
      .limit(1);

    if (existingAgent.length > 0) {
      // Don't overwrite runtime status (running/error)
      const currentStatus = existingAgent[0].status;
      const statusToWrite =
        currentStatus === "running" || currentStatus === "error"
          ? currentStatus
          : values.status;

      await db
        .update(agents)
        .set({ ...values, status: statusToWrite })
        .where(eq(agents.id, config.id));
      log(`[agent-file-sync] Updated: ${config.name}`);
    } else {
      await db.insert(agents).values(values);
      log(`[agent-file-sync] Created: ${config.name}`);
    }
  }

  // Mark agents not in file system as not file-managed
  const dbAgents = await db
    .select({ id: agents.id, fileKey: agents.fileKey })
    .from(agents)
    .where(
      and(
        eq(agents.companyId, companyConfig.id),
        eq(agents.fileManaged, true),
      ),
    );

  for (const dbAgent of dbAgents) {
    if (!syncedIds.has(dbAgent.id)) {
      await db
        .update(agents)
        .set({ fileManaged: false })
        .where(eq(agents.id, dbAgent.id));
      log(`[agent-file-sync] Detached (not in files): ${dbAgent.fileKey}`);
    }
  }

  log(`[agent-file-sync] Synced ${syncedIds.size} agents`);
}
```

- [ ] **Step 2: Hook into server startup**

In `server/src/index.ts`, after DB migration and before starting the HTTP server, add:

```typescript
import { syncAgentsFromFiles } from "./services/agent-file-sync.js";

// After migrations applied, before listen:
const projectRoot = process.env.MTH_PROJECT_ROOT || process.cwd();
await syncAgentsFromFiles(db, projectRoot, (msg) => logger.info(msg));
```

- [ ] **Step 3: Test sync manually**

1. Run migration: `cd packages/db && pnpm drizzle-kit push`
2. Start server: `pnpm dev:server`
3. Check logs for `[agent-file-sync] Synced N agents`
4. Verify in Cowork UI that agents appear

- [ ] **Step 4: Commit**

```bash
git add server/src/services/agent-file-sync.ts server/src/index.ts
git commit -m "feat: startup sync — scan agents/ files → upsert DB agents table"
```

---

## Task 8: UI — Types, Hooks, Settings Tabs

**Files:**
- Modify: `ui/src/chat/types.ts`
- Modify: `ui/src/chat/settings/useSettingsApi.ts`
- Modify: `ui/src/chat/settings/ModelsTab.tsx` (rename to adapter presets)
- Modify: `ui/src/chat/settings/AgentsTab.tsx`

### Step-by-step

- [ ] **Step 1: Update TypeScript types**

In `ui/src/chat/types.ts`, update `ModelInfo` and `AgentInfo`:

```typescript
// ModelInfo → AdapterPresetInfo
export interface AdapterPresetInfo {
  adapterType: string;
  command?: string;
  defaultArgs?: string[];
  defaultModel?: string;
  baseUrl?: string;
  timeoutSec?: number;
  startupTimeoutSec?: number;
  supports_image?: boolean;
}

// Keep ModelInfo as alias for backward compat
export type ModelInfo = AdapterPresetInfo;

// Update AgentInfo
export interface AgentInfo {
  name: string;
  id?: string;          // UUID
  role?: string;
  title?: string;
  emoji: string;
  color: string;
  description?: string;
  adapter?: string;     // adapter type
  adapterConfig?: Record<string, unknown>;
  model_tiers?: Record<string, string>;
  enabled: boolean;
  skills?: string[];
}
```

- [ ] **Step 2: Update settings API hooks**

In `useSettingsApi.ts`, update model hooks to hit new endpoints:

```typescript
// Adapter presets (was models)
export function useAdapterPresets() {
  return useQuery({
    queryKey: chatKeys.adapterPresets,
    queryFn: () => chatClient.get<Record<string, AdapterPresetInfo>>("/adapter-presets"),
  });
}

// Keep useModels as alias
export const useModels = useAdapterPresets;
```

- [ ] **Step 3: Update ModelsTab → AdapterPresetsTab**

Rename component, update form fields:
- "Model Name" → "Adapter Type" (e.g., `claude_local`)
- "Command" field stays
- "Base URL" field stays
- Remove `type` dropdown (derived from adapter)
- Add "Default Model" field

- [ ] **Step 4: Update AgentsTab**

Add new fields to agent creation/editing form:
- `role` dropdown (engineer, designer, pm, qa, ceo, general)
- `title` text input
- `adapter` dropdown (populated from adapter presets)
- Remove `model` dropdown (replaced by adapter)

- [ ] **Step 5: Verify Settings UI works**

Open Settings → Adapter Presets tab, verify CRUD works.
Open Settings → Agents tab, verify new fields appear and save correctly.

- [ ] **Step 6: Commit**

```bash
git add ui/src/chat/types.ts ui/src/chat/settings/
git commit -m "feat(ui): adapter presets tab, unified agent config fields in settings"
```

---

## Task 9: Run Migration & End-to-End Verification

**Files:**
- Execute: `migrate_to_v1.py`

### Step-by-step

- [ ] **Step 1: Backup current state**

```bash
git stash  # if uncommitted changes
cp -r agents/ agents_backup/
cp config.json config.json.backup
```

- [ ] **Step 2: Run migration**

```bash
python3 migrate_to_v1.py
```

- [ ] **Step 3: Verify folder structure**

```bash
ls agents/
# Should show: _default/  {uuid}-claude/  {uuid}-gemini/  {uuid}-ollama/  etc.
```

- [ ] **Step 4: Verify config.json**

```bash
cat config.json | python3 -m json.tool
# Should have: adapter_presets, company, no models
```

- [ ] **Step 5: Start Python backend and verify Chat**

```bash
uvicorn app:app --host 0.0.0.0 --port 8000
```
Open Chat in browser, verify agents load, send a message, verify streaming works.

- [ ] **Step 6: Start Node.js backend and verify sync**

```bash
pnpm dev:server
```
Check logs for `[agent-file-sync] Synced N agents`. Open Cowork UI, verify agents visible.

- [ ] **Step 7: End-to-end: same agent in both modes**

1. Open Chat mode → verify CTO agent responds
2. Switch to Cowork mode → verify same agent appears in agents list
3. Switch to Settings → verify agent config shows unified fields

- [ ] **Step 8: Commit migrated files**

```bash
git add agents/ config.json
git commit -m "chore: migrate agents to v1 config + UUID folders"
```

- [ ] **Step 9: Clean up backup**

```bash
rm -rf agents_backup/ config.json.backup
```
