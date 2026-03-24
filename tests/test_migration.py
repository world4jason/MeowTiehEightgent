"""
Tests for migrate_to_v1.py — v0 → v1 agent config migration.

Covers:
  - test_migrate_agent_config_to_v1: basic v0 → v1 conversion + folder rename
  - test_migrate_global_config: models → adapter_presets + company added
  - test_migrate_preserves_model_tiers: existing model_tiers converted correctly
  - test_migrate_skips_default_folder: _default/ and Default_* untouched
  - test_supports_thinking_generates_model_tiers: supports_thinking=true w/o model_tiers → defaults
  - test_idempotent: running on already-v1 config skips it
"""

import json
import uuid
from pathlib import Path

import pytest

# Import will be available once we write migrate_to_v1.py
from migrate_to_v1 import (
    MODEL_TO_ADAPTER,
    THINKING_DEFAULTS,
    migrate_agent_config,
    migrate_agent_folder,
    migrate_global_config,
    run_migration,
)


@pytest.fixture
def workspace(tmp_path: Path):
    """Create a temporary workspace mimicking the real repo layout."""
    # Global config.json
    global_config = {
        "summarization_model": "",
        "summary_trigger_threshold": 10,
        "models": {
            "claude": {
                "type": "cli",
                "cmd": ["claude", "--print"],
                "color": "#a78bfa",
                "emoji": "🟣",
            },
            "gemini": {
                "type": "cli",
                "cmd": ["gemini", "-p"],
                "color": "#34d399",
                "emoji": "🟢",
            },
            "ollama": {
                "type": "api",
                "baseUrl": "http://127.0.0.1:11434",
                "apiModel": "deepseek-v3.1:671b-cloud",
                "color": "#fb923c",
                "emoji": "🦙",
            },
            "codex": {
                "type": "cli",
                "cmd": ["codex", "-q", "--no-project-doc", "--approval-mode", "full-auto", "-p"],
                "color": "#38bdf8",
                "emoji": "🔵",
            },
            "gemini-2.5-pro": {
                "type": "cli",
                "cmd": ["gemini", "-p"],
                "extra_flags": ["--model", "gemini-2.5-pro"],
                "color": "#34d399",
                "emoji": "🧠",
                "idle_timeout_seconds": 600,
                "startup_timeout_seconds": 120,
            },
        },
    }
    (tmp_path / "config.json").write_text(json.dumps(global_config, indent=2))

    # agents/ directory
    agents_dir = tmp_path / "agents"
    agents_dir.mkdir()

    return tmp_path


def _create_agent(agents_dir: Path, name: str, config: dict):
    """Helper to create an agent folder with config.json and extra files."""
    agent_dir = agents_dir / name
    agent_dir.mkdir(exist_ok=True)
    (agent_dir / "config.json").write_text(json.dumps(config, indent=2))
    # Add some extra files to verify they survive the rename
    (agent_dir / "IDENTITY.md").write_text(f"# {name}")
    memory_dir = agent_dir / "memory"
    memory_dir.mkdir(exist_ok=True)
    (memory_dir / "2026-03-22.md").write_text("some memory")
    return agent_dir


# ---------------------------------------------------------------------------
# Test: basic v0 → v1 conversion + folder rename
# ---------------------------------------------------------------------------


class TestMigrateAgentConfigToV1:
    def test_basic_conversion(self, workspace: Path):
        """v0 config with model='claude' produces correct v1 structure."""
        v0 = {
            "emoji": "🟣",
            "color": "#a78bfa",
            "description": "Claude agent",
            "model": "claude",
            "skills": ["brainstorming"],
            "enabled": True,
            "supports_thinking": True,
        }
        _create_agent(workspace / "agents", "claude", v0)

        run_migration(workspace)

        # Find the renamed folder (should be {short-uuid}-claude)
        agents_dir = workspace / "agents"
        renamed = [d for d in agents_dir.iterdir() if d.is_dir() and d.name.endswith("-claude")]
        assert len(renamed) == 1, f"Expected one renamed folder, got: {[d.name for d in agents_dir.iterdir()]}"

        new_config = json.loads((renamed[0] / "config.json").read_text())
        assert new_config["configVersion"] == 1
        assert new_config["adapter"] == "claude_local"
        assert new_config["adapterConfig"]["model"] == "claude-sonnet-4-6"
        assert new_config["enabled"] is True
        assert new_config["emoji"] == "🟣"
        assert new_config["color"] == "#a78bfa"
        assert new_config["description"] == "Claude agent"
        assert new_config["skills"] == ["brainstorming"]
        assert new_config["name"] == "claude"
        assert new_config["role"] == "general"
        assert new_config["title"] is None
        assert new_config["reportsTo"] is None
        assert new_config["permissions"] == {}
        assert new_config["budget"] == 0
        assert "heartbeat" in new_config
        assert new_config["heartbeat"]["cooldownSec"] == 10
        assert new_config["heartbeat"]["intervalSec"] == 3600
        # id should be a valid UUID
        uuid.UUID(new_config["id"])

    def test_extra_files_preserved_after_rename(self, workspace: Path):
        """Files like IDENTITY.md, memory/ survive the folder rename."""
        v0 = {"model": "claude", "skills": [], "enabled": True}
        _create_agent(workspace / "agents", "claude", v0)

        run_migration(workspace)

        agents_dir = workspace / "agents"
        renamed = [d for d in agents_dir.iterdir() if d.is_dir() and d.name.endswith("-claude")]
        assert len(renamed) == 1
        assert (renamed[0] / "IDENTITY.md").exists()
        assert (renamed[0] / "memory" / "2026-03-22.md").exists()

    def test_old_folder_removed(self, workspace: Path):
        """Original folder name should no longer exist after migration."""
        v0 = {"model": "ollama", "skills": [], "enabled": True}
        _create_agent(workspace / "agents", "ollama", v0)

        run_migration(workspace)

        assert not (workspace / "agents" / "ollama").exists()

    def test_ollama_adapter_mapping(self, workspace: Path):
        """model='ollama' maps to adapter='ollama_api'."""
        v0 = {
            "emoji": "🤖",
            "color": "#888888",
            "description": "快樂llama",
            "model": "ollama",
            "skills": ["brainstorming"],
            "enabled": True,
        }
        _create_agent(workspace / "agents", "ollama", v0)

        run_migration(workspace)

        agents_dir = workspace / "agents"
        renamed = [d for d in agents_dir.iterdir() if d.is_dir() and d.name.endswith("-ollama")]
        assert len(renamed) == 1
        new_config = json.loads((renamed[0] / "config.json").read_text())
        assert new_config["adapter"] == "ollama_api"


# ---------------------------------------------------------------------------
# Test: global config migration (models → adapter_presets)
# ---------------------------------------------------------------------------


class TestMigrateGlobalConfig:
    def test_models_to_adapter_presets(self, workspace: Path):
        """models section is converted to adapter_presets."""
        run_migration(workspace)

        new_global = json.loads((workspace / "config.json").read_text())
        assert "adapter_presets" in new_global
        assert "models" not in new_global

        presets = new_global["adapter_presets"]
        # claude
        assert "claude_local" in presets
        assert presets["claude_local"]["command"] == "claude"
        assert presets["claude_local"]["defaultArgs"] == ["--print"]
        assert presets["claude_local"]["supports_image"] is True

        # gemini
        assert "gemini_local" in presets
        assert presets["gemini_local"]["command"] == "gemini"

        # ollama
        assert "ollama_api" in presets
        assert presets["ollama_api"]["baseUrl"] == "http://127.0.0.1:11434"

        # codex
        assert "codex_local" in presets
        assert presets["codex_local"]["command"] == "codex"

    def test_company_added(self, workspace: Path):
        """Global config gets a 'company' section."""
        run_migration(workspace)

        new_global = json.loads((workspace / "config.json").read_text())
        assert "company" in new_global
        assert "name" in new_global["company"]

    def test_other_fields_preserved(self, workspace: Path):
        """Non-models fields (summarization_model, etc.) survive."""
        run_migration(workspace)

        new_global = json.loads((workspace / "config.json").read_text())
        assert new_global["summarization_model"] == ""
        assert new_global["summary_trigger_threshold"] == 10


# ---------------------------------------------------------------------------
# Test: existing model_tiers preserved/converted correctly
# ---------------------------------------------------------------------------


class TestMigratePreservesModelTiers:
    def test_existing_model_tiers_kept(self, workspace: Path):
        """Agent with existing model_tiers keeps them (with adapter model names)."""
        v0 = {
            "model": "gemini",
            "skills": ["brainstorming"],
            "enabled": True,
            "supports_thinking": True,
            "model_tiers": {"default": "gemini", "thinking": "gemini-2.5-pro"},
        }
        _create_agent(workspace / "agents", "gemini", v0)

        run_migration(workspace)

        agents_dir = workspace / "agents"
        renamed = [d for d in agents_dir.iterdir() if d.is_dir() and d.name.endswith("-gemini")]
        assert len(renamed) == 1
        new_config = json.loads((renamed[0] / "config.json").read_text())
        assert new_config["model_tiers"]["default"] == "gemini"
        assert new_config["model_tiers"]["thinking"] == "gemini-2.5-pro"

    def test_model_tiers_without_supports_thinking(self, workspace: Path):
        """If model_tiers exist but supports_thinking is absent, model_tiers still preserved."""
        v0 = {
            "model": "gemini",
            "skills": [],
            "enabled": True,
            "model_tiers": {"default": "gemini", "thinking": "gemini-2.5-pro"},
        }
        _create_agent(workspace / "agents", "gemini", v0)

        run_migration(workspace)

        agents_dir = workspace / "agents"
        renamed = [d for d in agents_dir.iterdir() if d.is_dir() and d.name.endswith("-gemini")]
        new_config = json.loads((renamed[0] / "config.json").read_text())
        assert new_config["model_tiers"]["default"] == "gemini"
        assert new_config["model_tiers"]["thinking"] == "gemini-2.5-pro"


# ---------------------------------------------------------------------------
# Test: _default/ and Default_* untouched
# ---------------------------------------------------------------------------


class TestMigrateSkipsDefaultFolder:
    def test_skip_underscore_default(self, workspace: Path):
        """_default/ folder is not renamed or modified."""
        default_dir = workspace / "agents" / "_default"
        default_dir.mkdir()
        original_config = {"template": True, "model": "claude"}
        (default_dir / "config.json").write_text(json.dumps(original_config))

        run_migration(workspace)

        # Folder still exists with original name
        assert (workspace / "agents" / "_default").exists()
        # Config unchanged
        config = json.loads((default_dir / "config.json").read_text())
        assert config == original_config

    def test_skip_default_claude(self, workspace: Path):
        """Default_Claude/ folder is not renamed or modified."""
        dc_dir = workspace / "agents" / "Default_Claude"
        dc_dir.mkdir()
        original_config = {
            "emoji": "✺",
            "color": "#888888",
            "description": "",
            "model": "claude",
            "skills": [],
            "enabled": True,
            "supports_thinking": True,
        }
        (dc_dir / "config.json").write_text(json.dumps(original_config))

        run_migration(workspace)

        assert (workspace / "agents" / "Default_Claude").exists()
        config = json.loads((dc_dir / "config.json").read_text())
        assert config == original_config

    def test_skip_default_gemini(self, workspace: Path):
        """Default_Gemini/ folder is not renamed or modified."""
        dg_dir = workspace / "agents" / "Default_Gemini"
        dg_dir.mkdir()
        original_config = {"model": "gemini", "skills": [], "enabled": True}
        (dg_dir / "config.json").write_text(json.dumps(original_config))

        run_migration(workspace)

        assert (workspace / "agents" / "Default_Gemini").exists()
        config = json.loads((dg_dir / "config.json").read_text())
        assert config == original_config


# ---------------------------------------------------------------------------
# Test: supports_thinking=true without model_tiers → generate defaults
# ---------------------------------------------------------------------------


class TestSupportsThinkingGeneratesModelTiers:
    def test_claude_thinking_defaults(self, workspace: Path):
        """Claude agent with supports_thinking=true but no model_tiers gets defaults."""
        v0 = {
            "model": "claude",
            "skills": [],
            "enabled": True,
            "supports_thinking": True,
        }
        _create_agent(workspace / "agents", "claude", v0)

        run_migration(workspace)

        agents_dir = workspace / "agents"
        renamed = [d for d in agents_dir.iterdir() if d.is_dir() and d.name.endswith("-claude")]
        new_config = json.loads((renamed[0] / "config.json").read_text())
        assert new_config["model_tiers"]["default"] == "claude-sonnet-4-6"
        assert new_config["model_tiers"]["thinking"] == "claude-opus-4-6"

    def test_gemini_thinking_defaults(self, workspace: Path):
        """Gemini agent with supports_thinking=true but no model_tiers gets defaults."""
        v0 = {
            "model": "gemini",
            "skills": [],
            "enabled": True,
            "supports_thinking": True,
        }
        _create_agent(workspace / "agents", "gemini", v0)

        run_migration(workspace)

        agents_dir = workspace / "agents"
        renamed = [d for d in agents_dir.iterdir() if d.is_dir() and d.name.endswith("-gemini")]
        new_config = json.loads((renamed[0] / "config.json").read_text())
        assert new_config["model_tiers"]["default"] == "gemini-2.5-flash"
        assert new_config["model_tiers"]["thinking"] == "gemini-2.5-pro"

    def test_no_thinking_no_model_tiers(self, workspace: Path):
        """Agent without supports_thinking gets null model_tiers."""
        v0 = {
            "model": "ollama",
            "skills": [],
            "enabled": True,
        }
        _create_agent(workspace / "agents", "ollama", v0)

        run_migration(workspace)

        agents_dir = workspace / "agents"
        renamed = [d for d in agents_dir.iterdir() if d.is_dir() and d.name.endswith("-ollama")]
        new_config = json.loads((renamed[0] / "config.json").read_text())
        assert new_config["model_tiers"] is None

    def test_supports_thinking_false_no_model_tiers(self, workspace: Path):
        """Agent with supports_thinking=false gets null model_tiers."""
        v0 = {
            "model": "claude",
            "skills": [],
            "enabled": True,
            "supports_thinking": False,
        }
        _create_agent(workspace / "agents", "claude", v0)

        run_migration(workspace)

        agents_dir = workspace / "agents"
        renamed = [d for d in agents_dir.iterdir() if d.is_dir() and d.name.endswith("-claude")]
        new_config = json.loads((renamed[0] / "config.json").read_text())
        assert new_config["model_tiers"] is None


# ---------------------------------------------------------------------------
# Test: idempotent — running on already-v1 config skips it
# ---------------------------------------------------------------------------


class TestIdempotent:
    def test_already_v1_agent_skipped(self, workspace: Path):
        """An agent with configVersion=1 is not re-migrated."""
        v1 = {
            "configVersion": 1,
            "id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
            "name": "claude",
            "role": "general",
            "title": None,
            "emoji": "🟣",
            "color": "#a78bfa",
            "description": "Claude agent",
            "enabled": True,
            "adapter": "claude_local",
            "adapterConfig": {"model": "claude-sonnet-4-6"},
            "model_tiers": {"default": "claude-sonnet-4-6", "thinking": "claude-opus-4-6"},
            "skills": ["brainstorming"],
            "reportsTo": None,
            "permissions": {},
            "budget": 0,
            "heartbeat": {"cooldownSec": 10, "intervalSec": 3600},
        }
        # Already in renamed folder format
        agent_dir = workspace / "agents" / "abc12345-claude"
        agent_dir.mkdir()
        (agent_dir / "config.json").write_text(json.dumps(v1, indent=2))
        (agent_dir / "IDENTITY.md").write_text("# claude")

        run_migration(workspace)

        # Folder unchanged
        assert (workspace / "agents" / "abc12345-claude").exists()
        new_config = json.loads((agent_dir / "config.json").read_text())
        assert new_config == v1

    def test_already_v1_global_skipped(self, workspace: Path):
        """Global config with adapter_presets is not re-migrated."""
        v1_global = {
            "summarization_model": "",
            "summary_trigger_threshold": 10,
            "adapter_presets": {
                "claude_local": {
                    "command": "claude",
                    "defaultArgs": ["--print"],
                    "defaultModel": "claude-sonnet-4-6",
                    "timeoutSec": 120,
                    "startupTimeoutSec": 120,
                    "supports_image": True,
                }
            },
            "company": {"name": ""},
        }
        (workspace / "config.json").write_text(json.dumps(v1_global, indent=2))

        run_migration(workspace)

        new_global = json.loads((workspace / "config.json").read_text())
        assert new_global == v1_global

    def test_full_migration_twice(self, workspace: Path):
        """Running migration twice produces same result as running once."""
        v0 = {
            "model": "claude",
            "skills": ["brainstorming"],
            "enabled": True,
            "supports_thinking": True,
        }
        _create_agent(workspace / "agents", "claude", v0)

        # First run
        run_migration(workspace)

        # Capture state
        agents_dir = workspace / "agents"
        renamed = [d for d in agents_dir.iterdir() if d.is_dir() and d.name.endswith("-claude")]
        assert len(renamed) == 1
        first_config = json.loads((renamed[0] / "config.json").read_text())
        first_global = json.loads((workspace / "config.json").read_text())
        first_folder_name = renamed[0].name

        # Second run
        run_migration(workspace)

        # State unchanged
        renamed2 = [d for d in agents_dir.iterdir() if d.is_dir() and d.name.endswith("-claude")]
        assert len(renamed2) == 1
        assert renamed2[0].name == first_folder_name
        second_config = json.loads((renamed2[0] / "config.json").read_text())
        second_global = json.loads((workspace / "config.json").read_text())
        assert second_config == first_config
        assert second_global == first_global


# ---------------------------------------------------------------------------
# Test: multiple agents migrated together
# ---------------------------------------------------------------------------


class TestMultipleAgents:
    def test_multiple_agents_all_migrated(self, workspace: Path):
        """Multiple agents in various configs are all migrated correctly."""
        _create_agent(
            workspace / "agents",
            "claude",
            {"model": "claude", "skills": ["brainstorming"], "enabled": True, "supports_thinking": True},
        )
        _create_agent(
            workspace / "agents",
            "gemini",
            {
                "model": "gemini",
                "skills": ["brainstorming"],
                "enabled": True,
                "supports_thinking": True,
                "model_tiers": {"default": "gemini", "thinking": "gemini-2.5-pro"},
            },
        )
        _create_agent(
            workspace / "agents",
            "ollama",
            {"model": "ollama", "skills": ["brainstorming"], "enabled": True},
        )
        # Also add defaults that should be skipped
        (workspace / "agents" / "_default").mkdir()
        (workspace / "agents" / "_default" / "config.json").write_text('{"template": true}')
        (workspace / "agents" / "Default_Claude").mkdir()
        (workspace / "agents" / "Default_Claude" / "config.json").write_text('{"model": "claude"}')

        run_migration(workspace)

        agents_dir = workspace / "agents"
        all_dirs = sorted([d.name for d in agents_dir.iterdir() if d.is_dir()])

        # Defaults untouched
        assert "_default" in all_dirs
        assert "Default_Claude" in all_dirs

        # Original names gone
        assert "claude" not in all_dirs
        assert "gemini" not in all_dirs
        assert "ollama" not in all_dirs

        # Renamed folders exist
        claude_dirs = [d for d in all_dirs if d.endswith("-claude")]
        gemini_dirs = [d for d in all_dirs if d.endswith("-gemini")]
        ollama_dirs = [d for d in all_dirs if d.endswith("-ollama")]
        assert len(claude_dirs) == 1
        assert len(gemini_dirs) == 1
        assert len(ollama_dirs) == 1


# ---------------------------------------------------------------------------
# Test: edge cases
# ---------------------------------------------------------------------------


class TestEdgeCases:
    def test_unknown_model_uses_model_as_adapter(self, workspace: Path):
        """Agent with an unknown model value still migrates, using model name as adapter."""
        v0 = {"model": "unknown_model", "skills": [], "enabled": True}
        _create_agent(workspace / "agents", "custom", v0)

        run_migration(workspace)

        agents_dir = workspace / "agents"
        renamed = [d for d in agents_dir.iterdir() if d.is_dir() and d.name.endswith("-custom")]
        assert len(renamed) == 1
        new_config = json.loads((renamed[0] / "config.json").read_text())
        assert new_config["adapter"] == "unknown_model"
        assert new_config["configVersion"] == 1

    def test_agent_without_config_json_skipped(self, workspace: Path):
        """Agent folder without config.json is skipped gracefully."""
        no_config_dir = workspace / "agents" / "broken"
        no_config_dir.mkdir()
        (no_config_dir / "IDENTITY.md").write_text("# broken")

        # Should not raise
        run_migration(workspace)

        # Folder unchanged
        assert (workspace / "agents" / "broken").exists()

    def test_migration_with_emoji_and_color_defaults(self, workspace: Path):
        """Agent missing emoji/color gets defaults."""
        v0 = {"model": "claude", "skills": [], "enabled": True}
        agent_dir = workspace / "agents" / "bare"
        agent_dir.mkdir()
        (agent_dir / "config.json").write_text(json.dumps(v0))

        run_migration(workspace)

        agents_dir = workspace / "agents"
        renamed = [d for d in agents_dir.iterdir() if d.is_dir() and d.name.endswith("-bare")]
        new_config = json.loads((renamed[0] / "config.json").read_text())
        # Should have default emoji and color
        assert "emoji" in new_config
        assert "color" in new_config
