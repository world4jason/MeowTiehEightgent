"""
Tests for load_adapter_presets() and get_agent_registry() v1 support.

Covers:
  - load_adapter_presets: reads adapter_presets from config, falls back to converting old models
  - get_agent_registry v0: legacy agent with model field works as before
  - get_agent_registry v1: agent with adapter field merges preset correctly
  - get_agent_registry v1: adapterConfig overrides preset defaults
  - get_agent_registry v1: registry key uses agent.name (not folder name) for v1
  - get_agent_registry mixed: v0 and v1 agents coexist
  - resolve_thinking_model: works with adapter_presets
"""

import json
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

# Ensure project root is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _setup_workspace(tmp_path: Path, global_config: dict, agents: dict[str, dict]):
    """Create a workspace with config.json and agent folders."""
    (tmp_path / "config.json").write_text(json.dumps(global_config, indent=2))
    agents_dir = tmp_path / "agents"
    agents_dir.mkdir(exist_ok=True)
    for folder_name, agent_cfg in agents.items():
        agent_dir = agents_dir / folder_name
        agent_dir.mkdir(exist_ok=True)
        (agent_dir / "config.json").write_text(json.dumps(agent_cfg, indent=2))
        # Minimal required files
        (agent_dir / "AGENT.md").write_text(f"# {folder_name}")
    return tmp_path


# Standard v0 global config (models format)
V0_GLOBAL_CONFIG = {
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
    },
}

# Standard v1 global config (adapter_presets format)
V1_GLOBAL_CONFIG = {
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
        },
        "gemini_local": {
            "command": "gemini",
            "defaultArgs": ["-p"],
            "defaultModel": "gemini-2.5-flash",
            "timeoutSec": 600,
            "startupTimeoutSec": 120,
            "supports_image": True,
        },
        "ollama_api": {
            "baseUrl": "http://127.0.0.1:11434",
            "defaultModel": "llama3.2",
            "timeoutSec": 120,
        },
    },
}


# ---------------------------------------------------------------------------
# Test: load_adapter_presets
# ---------------------------------------------------------------------------


class TestLoadAdapterPresets:
    """load_adapter_presets() reads adapter_presets or converts old models."""

    def test_reads_adapter_presets_when_present(self, tmp_path: Path):
        """If config.json has adapter_presets, return it directly."""
        _setup_workspace(tmp_path, V1_GLOBAL_CONFIG, {})

        import app
        with patch.object(app, "CONFIG_FILE", tmp_path / "config.json"):
            presets = app.load_adapter_presets()

        assert "claude_local" in presets
        assert presets["claude_local"]["command"] == "claude"
        assert presets["claude_local"]["defaultArgs"] == ["--print"]

    def test_converts_old_models_format(self, tmp_path: Path):
        """If config.json only has models, convert them to adapter_presets on the fly."""
        _setup_workspace(tmp_path, V0_GLOBAL_CONFIG, {})

        import app
        with patch.object(app, "CONFIG_FILE", tmp_path / "config.json"):
            presets = app.load_adapter_presets()

        # claude (CLI) should become a preset with command/defaultArgs
        assert "claude" in presets
        p = presets["claude"]
        assert p["command"] == "claude"
        assert p["defaultArgs"] == ["--print"]
        assert p["type"] == "cli"

        # ollama (API) should keep baseUrl
        assert "ollama" in presets
        p_ollama = presets["ollama"]
        assert p_ollama["baseUrl"] == "http://127.0.0.1:11434"
        assert p_ollama["type"] == "api"

    def test_empty_config_returns_defaults(self, tmp_path: Path):
        """If config.json is missing or empty, return converted DEFAULT_MODELS."""
        (tmp_path / "config.json").write_text("{}")

        import app
        with patch.object(app, "CONFIG_FILE", tmp_path / "config.json"):
            presets = app.load_adapter_presets()

        # Should still have the built-in defaults converted
        assert "claude" in presets
        assert presets["claude"]["command"] == "claude"


# ---------------------------------------------------------------------------
# Test: get_agent_registry — v0 agents (backward compat)
# ---------------------------------------------------------------------------


class TestGetAgentRegistryV0:
    """v0 agents (with model field, no configVersion) work as before."""

    def test_v0_cli_agent(self, tmp_path: Path):
        """v0 agent with model='claude' gets correct cmd/type from models."""
        agents = {
            "claude": {
                "emoji": "🟣",
                "color": "#a78bfa",
                "description": "Claude agent",
                "model": "claude",
                "skills": ["brainstorming"],
                "enabled": True,
            }
        }
        _setup_workspace(tmp_path, V0_GLOBAL_CONFIG, agents)

        import app
        with (
            patch.object(app, "CONFIG_FILE", tmp_path / "config.json"),
            patch.object(app, "AGENTS_DIR", tmp_path / "agents"),
        ):
            registry = app.get_agent_registry()

        assert "claude" in registry
        agent = registry["claude"]
        assert agent["type"] == "cli"
        assert agent["cmd"] == ["claude", "--print"]
        assert agent["name"] == "claude"

    def test_v0_api_agent(self, tmp_path: Path):
        """v0 agent with model='ollama' gets correct baseUrl/type from models."""
        agents = {
            "ollama": {
                "emoji": "🦙",
                "model": "ollama",
                "skills": [],
                "enabled": True,
            }
        }
        _setup_workspace(tmp_path, V0_GLOBAL_CONFIG, agents)

        import app
        with (
            patch.object(app, "CONFIG_FILE", tmp_path / "config.json"),
            patch.object(app, "AGENTS_DIR", tmp_path / "agents"),
        ):
            registry = app.get_agent_registry()

        assert "ollama" in registry
        agent = registry["ollama"]
        assert agent["type"] == "api"
        assert agent["baseUrl"] == "http://127.0.0.1:11434"
        assert agent["model"] == "deepseek-v3.1:671b-cloud"  # from apiModel

    def test_v0_agent_skip_underscore_default(self, tmp_path: Path):
        """_default/ folder is skipped."""
        agents = {
            "_default": {"model": "claude", "skills": [], "enabled": True},
            "claude": {"model": "claude", "skills": [], "enabled": True},
        }
        _setup_workspace(tmp_path, V0_GLOBAL_CONFIG, agents)

        import app
        with (
            patch.object(app, "CONFIG_FILE", tmp_path / "config.json"),
            patch.object(app, "AGENTS_DIR", tmp_path / "agents"),
        ):
            registry = app.get_agent_registry()

        assert "_default" not in registry
        assert "claude" in registry


# ---------------------------------------------------------------------------
# Test: get_agent_registry — v1 agents (adapter-based)
# ---------------------------------------------------------------------------


class TestGetAgentRegistryV1:
    """v1 agents (with adapter field, configVersion=1) use adapter_presets."""

    def test_v1_cli_agent_basic(self, tmp_path: Path):
        """v1 agent with adapter='claude_local' gets cmd from preset."""
        agents = {
            "550e8400-CTO": {
                "configVersion": 1,
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "name": "CTO",
                "adapter": "claude_local",
                "adapterConfig": {},
                "emoji": "🟣",
                "color": "#a78bfa",
                "enabled": True,
                "skills": [],
            }
        }
        _setup_workspace(tmp_path, V1_GLOBAL_CONFIG, agents)

        import app
        with (
            patch.object(app, "CONFIG_FILE", tmp_path / "config.json"),
            patch.object(app, "AGENTS_DIR", tmp_path / "agents"),
        ):
            registry = app.get_agent_registry()

        # Registry key should be agent.name ("CTO"), not folder name
        assert "CTO" in registry
        assert "550e8400-CTO" not in registry
        agent = registry["CTO"]
        assert agent["type"] == "cli"  # no baseUrl in preset → CLI
        assert agent["cmd"] == ["claude", "--print"]
        assert agent["model"] == "claude-sonnet-4-6"  # preset.defaultModel
        assert agent["idle_timeout_seconds"] == 120  # preset.timeoutSec

    def test_v1_api_agent(self, tmp_path: Path):
        """v1 agent with adapter='ollama_api' gets baseUrl and type='api'."""
        agents = {
            "7c9e6679-Ollama": {
                "configVersion": 1,
                "id": "7c9e6679-1234-5678-abcd-ef0123456789",
                "name": "Ollama",
                "adapter": "ollama_api",
                "adapterConfig": {},
                "emoji": "🦙",
                "color": "#fb923c",
                "enabled": True,
                "skills": [],
            }
        }
        _setup_workspace(tmp_path, V1_GLOBAL_CONFIG, agents)

        import app
        with (
            patch.object(app, "CONFIG_FILE", tmp_path / "config.json"),
            patch.object(app, "AGENTS_DIR", tmp_path / "agents"),
        ):
            registry = app.get_agent_registry()

        assert "Ollama" in registry
        agent = registry["Ollama"]
        assert agent["type"] == "api"  # baseUrl in preset → API
        assert agent["baseUrl"] == "http://127.0.0.1:11434"
        assert agent["model"] == "llama3.2"  # preset.defaultModel

    def test_v1_adapter_config_overrides_preset(self, tmp_path: Path):
        """adapterConfig.model and adapterConfig.timeoutSec override preset defaults."""
        agents = {
            "abc12345-DevOps": {
                "configVersion": 1,
                "id": "abc12345-0000-0000-0000-000000000000",
                "name": "DevOps",
                "adapter": "claude_local",
                "adapterConfig": {
                    "model": "claude-opus-4-6",
                    "timeoutSec": 300,
                },
                "emoji": "🔧",
                "color": "#ff0000",
                "enabled": True,
                "skills": [],
            }
        }
        _setup_workspace(tmp_path, V1_GLOBAL_CONFIG, agents)

        import app
        with (
            patch.object(app, "CONFIG_FILE", tmp_path / "config.json"),
            patch.object(app, "AGENTS_DIR", tmp_path / "agents"),
        ):
            registry = app.get_agent_registry()

        assert "DevOps" in registry
        agent = registry["DevOps"]
        assert agent["model"] == "claude-opus-4-6"  # overridden
        assert agent["idle_timeout_seconds"] == 300  # from adapterConfig.timeoutSec

    def test_v1_unknown_adapter_graceful(self, tmp_path: Path):
        """v1 agent with unknown adapter type still loads (no preset merge)."""
        agents = {
            "ddd11111-Custom": {
                "configVersion": 1,
                "id": "ddd11111-0000-0000-0000-000000000000",
                "name": "Custom",
                "adapter": "nonexistent_adapter",
                "adapterConfig": {},
                "emoji": "❓",
                "color": "#ccc",
                "enabled": True,
                "skills": [],
            }
        }
        _setup_workspace(tmp_path, V1_GLOBAL_CONFIG, agents)

        import app
        with (
            patch.object(app, "CONFIG_FILE", tmp_path / "config.json"),
            patch.object(app, "AGENTS_DIR", tmp_path / "agents"),
        ):
            registry = app.get_agent_registry()

        assert "Custom" in registry
        agent = registry["Custom"]
        # Should still have name and basic fields
        assert agent["name"] == "Custom"


# ---------------------------------------------------------------------------
# Test: mixed v0 + v1 agents coexist
# ---------------------------------------------------------------------------


class TestGetAgentRegistryMixed:
    """v0 and v1 agents coexist in the same agents/ directory."""

    def test_mixed_v0_and_v1(self, tmp_path: Path):
        """Both old-style and new-style agents appear in the registry."""
        agents = {
            # v0 agent (old format)
            "claude": {
                "emoji": "🟣",
                "color": "#a78bfa",
                "model": "claude",
                "skills": [],
                "enabled": True,
            },
            # v1 agent (new format)
            "550e8400-CTO": {
                "configVersion": 1,
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "name": "CTO",
                "adapter": "claude_local",
                "adapterConfig": {"model": "claude-opus-4-6"},
                "emoji": "🟣",
                "color": "#a78bfa",
                "enabled": True,
                "skills": [],
            },
        }
        # Use v1 global config with adapter_presets (since it also falls back to models)
        # But to test the mixed scenario, use a config that has BOTH
        mixed_global = {
            "models": {
                "claude": {
                    "type": "cli",
                    "cmd": ["claude", "--print"],
                    "color": "#a78bfa",
                    "emoji": "🟣",
                },
            },
            "adapter_presets": {
                "claude_local": {
                    "command": "claude",
                    "defaultArgs": ["--print"],
                    "defaultModel": "claude-sonnet-4-6",
                    "timeoutSec": 120,
                    "startupTimeoutSec": 120,
                    "supports_image": True,
                },
            },
        }
        _setup_workspace(tmp_path, mixed_global, agents)

        import app
        with (
            patch.object(app, "CONFIG_FILE", tmp_path / "config.json"),
            patch.object(app, "AGENTS_DIR", tmp_path / "agents"),
        ):
            registry = app.get_agent_registry()

        # v0 agent keyed by folder name
        assert "claude" in registry
        assert registry["claude"]["type"] == "cli"

        # v1 agent keyed by config name
        assert "CTO" in registry
        assert registry["CTO"]["model"] == "claude-opus-4-6"


# ---------------------------------------------------------------------------
# Test: v1 agent with adapter_presets from converted v0 global config
# ---------------------------------------------------------------------------


class TestV1AgentWithV0GlobalConfig:
    """v1 agents work even when global config is still in old models format.

    This tests the transition period where migration script hasn't run yet
    but someone manually created a v1 agent config.
    """

    def test_v1_agent_with_old_global_config(self, tmp_path: Path):
        """v1 agent still works when global config only has models (no adapter_presets).
        load_adapter_presets() converts models on the fly, but v1 agent references
        adapter type (e.g. claude_local) which won't be in the converted models dict.
        The agent should still load, just without preset merge."""
        agents = {
            "abc12345-NewAgent": {
                "configVersion": 1,
                "id": "abc12345-0000-0000-0000-000000000000",
                "name": "NewAgent",
                "adapter": "claude_local",
                "adapterConfig": {
                    "model": "claude-sonnet-4-6",
                    "command": "claude",
                    "args": ["--print"],
                },
                "emoji": "🔧",
                "color": "#ff0000",
                "enabled": True,
                "skills": [],
            },
        }
        _setup_workspace(tmp_path, V0_GLOBAL_CONFIG, agents)

        import app
        with (
            patch.object(app, "CONFIG_FILE", tmp_path / "config.json"),
            patch.object(app, "AGENTS_DIR", tmp_path / "agents"),
        ):
            registry = app.get_agent_registry()

        # Should still be in registry even without matching preset
        assert "NewAgent" in registry


# ---------------------------------------------------------------------------
# Test: load_models backward compatibility
# ---------------------------------------------------------------------------


class TestLoadModelsBackwardCompat:
    """load_models() still works for callers that haven't been updated."""

    def test_load_models_with_old_config(self, tmp_path: Path):
        """load_models() returns models dict from old-format config."""
        _setup_workspace(tmp_path, V0_GLOBAL_CONFIG, {})

        import app
        with patch.object(app, "CONFIG_FILE", tmp_path / "config.json"):
            models = app.load_models()

        assert "claude" in models
        assert models["claude"]["type"] == "cli"

    def test_load_models_with_new_config(self, tmp_path: Path):
        """load_models() still works with adapter_presets config (returns empty or defaults)."""
        _setup_workspace(tmp_path, V1_GLOBAL_CONFIG, {})

        import app
        with patch.object(app, "CONFIG_FILE", tmp_path / "config.json"):
            models = app.load_models()

        # With v1 config that has no 'models' key, should return DEFAULT_MODELS
        assert "claude" in models


# ---------------------------------------------------------------------------
# Test: _resolve_supports_image — v0 and v1 agents
# ---------------------------------------------------------------------------


class TestResolveSupportsImage:
    """_resolve_supports_image() handles both v0 and v1 agent configs."""

    def test_v0_agent_level_override(self, tmp_path: Path):
        """v0 agent with explicit supports_image=False uses that value."""
        import app
        agent = {"model": "claude", "supports_image": False}
        assert app._resolve_supports_image(agent) is False

    def test_v0_default_models_lookup(self, tmp_path: Path):
        """v0 agent without explicit flag falls back to DEFAULT_MODELS."""
        import app
        # claude is in DEFAULT_MODELS with supports_image=True
        agent = {"model": "claude"}
        assert app._resolve_supports_image(agent) is True

    def test_v0_unknown_model_fallback_true(self, tmp_path: Path):
        """v0 agent with unknown model falls back to True (safe default)."""
        import app
        agent = {"model": "unknown_model_xyz"}
        assert app._resolve_supports_image(agent) is True

    def test_v1_agent_level_override(self, tmp_path: Path):
        """v1 agent with explicit supports_image uses that value (no preset lookup)."""
        _setup_workspace(tmp_path, V1_GLOBAL_CONFIG, {})

        import app
        with patch.object(app, "CONFIG_FILE", tmp_path / "config.json"):
            agent = {
                "configVersion": 1,
                "adapter": "claude_local",
                "supports_image": False,
            }
            assert app._resolve_supports_image(agent) is False

    def test_v1_adapter_preset_lookup(self, tmp_path: Path):
        """v1 agent without explicit flag looks up adapter preset."""
        _setup_workspace(tmp_path, V1_GLOBAL_CONFIG, {})

        import app
        with patch.object(app, "CONFIG_FILE", tmp_path / "config.json"):
            # claude_local preset has supports_image=True
            agent = {
                "configVersion": 1,
                "adapter": "claude_local",
            }
            assert app._resolve_supports_image(agent) is True

    def test_v1_adapter_preset_no_image_support(self, tmp_path: Path):
        """v1 agent with adapter that has no supports_image field falls back to True."""
        _setup_workspace(tmp_path, V1_GLOBAL_CONFIG, {})

        import app
        with patch.object(app, "CONFIG_FILE", tmp_path / "config.json"):
            # ollama_api preset does NOT have supports_image
            agent = {
                "configVersion": 1,
                "adapter": "ollama_api",
            }
            assert app._resolve_supports_image(agent) is True

    def test_v1_unknown_adapter_fallback_true(self, tmp_path: Path):
        """v1 agent with unknown adapter falls back to True."""
        _setup_workspace(tmp_path, V1_GLOBAL_CONFIG, {})

        import app
        with patch.object(app, "CONFIG_FILE", tmp_path / "config.json"):
            agent = {
                "configVersion": 1,
                "adapter": "nonexistent_adapter",
            }
            assert app._resolve_supports_image(agent) is True

    def test_v1_preset_supports_image_false(self, tmp_path: Path):
        """v1 agent with adapter preset that explicitly sets supports_image=False."""
        config = {
            "adapter_presets": {
                "text_only_adapter": {
                    "command": "textbot",
                    "defaultArgs": [],
                    "supports_image": False,
                },
            },
        }
        _setup_workspace(tmp_path, config, {})

        import app
        with patch.object(app, "CONFIG_FILE", tmp_path / "config.json"):
            agent = {
                "configVersion": 1,
                "adapter": "text_only_adapter",
            }
            assert app._resolve_supports_image(agent) is False

    def test_v1_merged_agent_from_registry(self, tmp_path: Path):
        """End-to-end: v1 agent from get_agent_registry() has correct supports_image."""
        agents = {
            "550e8400-CTO": {
                "configVersion": 1,
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "name": "CTO",
                "adapter": "claude_local",
                "adapterConfig": {},
                "emoji": "🟣",
                "color": "#a78bfa",
                "enabled": True,
                "skills": [],
            },
        }
        _setup_workspace(tmp_path, V1_GLOBAL_CONFIG, agents)

        import app
        with (
            patch.object(app, "CONFIG_FILE", tmp_path / "config.json"),
            patch.object(app, "AGENTS_DIR", tmp_path / "agents"),
        ):
            registry = app.get_agent_registry()
            agent = registry["CTO"]
            # supports_image was set by _merge_v1_agent from preset
            assert app._resolve_supports_image(agent) is True


# ---------------------------------------------------------------------------
# Test: _find_agent_dir — locates agent folder by display name
# ---------------------------------------------------------------------------


class TestFindAgentDir:
    """_find_agent_dir() finds agent folders by display name for both v0 and v1."""

    def test_find_v0_agent_by_folder_name(self, tmp_path: Path):
        """v0 agent (no 'name' field in config) is found by folder name."""
        agents = {
            "claude": {
                "emoji": "🟣",
                "color": "#a78bfa",
                "model": "claude",
                "skills": [],
                "enabled": True,
            }
        }
        _setup_workspace(tmp_path, V0_GLOBAL_CONFIG, agents)

        import app
        with patch.object(app, "AGENTS_DIR", tmp_path / "agents"):
            result = app._find_agent_dir("claude")

        assert result is not None
        assert result.name == "claude"

    def test_find_v1_agent_by_config_name(self, tmp_path: Path):
        """v1 agent (has 'name' field in config) is found by config name, not folder name."""
        agents = {
            "550e8400-CTO": {
                "configVersion": 1,
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "name": "CTO",
                "adapter": "claude_local",
                "adapterConfig": {},
                "emoji": "🟣",
                "color": "#a78bfa",
                "enabled": True,
                "skills": [],
            }
        }
        _setup_workspace(tmp_path, V1_GLOBAL_CONFIG, agents)

        import app
        with patch.object(app, "AGENTS_DIR", tmp_path / "agents"):
            result = app._find_agent_dir("CTO")

        assert result is not None
        assert result.name == "550e8400-CTO"

    def test_find_v1_agent_not_found_by_folder_name(self, tmp_path: Path):
        """v1 agent should NOT be found by its UUID folder name."""
        agents = {
            "550e8400-CTO": {
                "configVersion": 1,
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "name": "CTO",
                "adapter": "claude_local",
                "adapterConfig": {},
                "emoji": "🟣",
                "color": "#a78bfa",
                "enabled": True,
                "skills": [],
            }
        }
        _setup_workspace(tmp_path, V1_GLOBAL_CONFIG, agents)

        import app
        with patch.object(app, "AGENTS_DIR", tmp_path / "agents"):
            result = app._find_agent_dir("550e8400-CTO")

        assert result is None

    def test_not_found_returns_none(self, tmp_path: Path):
        """Non-existent agent returns None."""
        _setup_workspace(tmp_path, V0_GLOBAL_CONFIG, {})

        import app
        with patch.object(app, "AGENTS_DIR", tmp_path / "agents"):
            result = app._find_agent_dir("ghost")

        assert result is None

    def test_skips_default_and_Default_prefix(self, tmp_path: Path):
        """_default/ and Default_* folders are skipped."""
        agents = {
            "Default_Claude": {
                "emoji": "✺",
                "model": "claude",
                "skills": [],
                "enabled": True,
            },
        }
        _setup_workspace(tmp_path, V0_GLOBAL_CONFIG, agents)
        # Also create _default
        default_dir = tmp_path / "agents" / "_default"
        default_dir.mkdir(exist_ok=True)
        (default_dir / "config.json").write_text('{"model": "claude"}')

        import app
        with patch.object(app, "AGENTS_DIR", tmp_path / "agents"):
            assert app._find_agent_dir("Default_Claude") is None

    def test_find_default_returns_default_dir(self, tmp_path: Path):
        """_find_agent_dir('_default') returns the _default/ folder."""
        _setup_workspace(tmp_path, V0_GLOBAL_CONFIG, {})
        default_dir = tmp_path / "agents" / "_default"
        default_dir.mkdir(exist_ok=True)

        import app
        with patch.object(app, "AGENTS_DIR", tmp_path / "agents"):
            result = app._find_agent_dir("_default")

        assert result is not None
        assert result.name == "_default"

    def test_mixed_v0_v1_find_both(self, tmp_path: Path):
        """Can find both v0 and v1 agents by their respective names."""
        agents = {
            "claude": {
                "emoji": "🟣",
                "model": "claude",
                "skills": [],
                "enabled": True,
            },
            "abc12345-DevOps": {
                "configVersion": 1,
                "id": "abc12345-0000-0000-0000-000000000000",
                "name": "DevOps",
                "adapter": "claude_local",
                "adapterConfig": {},
                "emoji": "🔧",
                "color": "#ff0000",
                "enabled": True,
                "skills": [],
            },
        }
        _setup_workspace(tmp_path, V0_GLOBAL_CONFIG, agents)

        import app
        with patch.object(app, "AGENTS_DIR", tmp_path / "agents"):
            v0_result = app._find_agent_dir("claude")
            v1_result = app._find_agent_dir("DevOps")

        assert v0_result is not None
        assert v0_result.name == "claude"
        assert v1_result is not None
        assert v1_result.name == "abc12345-DevOps"


# ---------------------------------------------------------------------------
# Test: _get_installed_agent_names — returns display names
# ---------------------------------------------------------------------------


class TestGetInstalledAgentNames:
    """_get_installed_agent_names() returns display names for all installed agents."""

    def test_v0_agents_use_folder_name(self, tmp_path: Path):
        """v0 agents without 'name' field use folder name."""
        agents = {
            "claude": {
                "emoji": "🟣",
                "model": "claude",
                "skills": [],
                "enabled": True,
            }
        }
        _setup_workspace(tmp_path, V0_GLOBAL_CONFIG, agents)

        import app
        with patch.object(app, "AGENTS_DIR", tmp_path / "agents"):
            names = app._get_installed_agent_names()

        assert "claude" in names

    def test_v1_agents_use_config_name(self, tmp_path: Path):
        """v1 agents use config 'name' field, not folder name."""
        agents = {
            "550e8400-CTO": {
                "configVersion": 1,
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "name": "CTO",
                "adapter": "claude_local",
                "adapterConfig": {},
                "emoji": "🟣",
                "enabled": True,
                "skills": [],
            }
        }
        _setup_workspace(tmp_path, V1_GLOBAL_CONFIG, agents)

        import app
        with patch.object(app, "AGENTS_DIR", tmp_path / "agents"):
            names = app._get_installed_agent_names()

        assert "CTO" in names
        assert "550e8400-CTO" not in names

    def test_mixed_v0_v1(self, tmp_path: Path):
        """Mixed v0 and v1 agents both appear with correct names."""
        agents = {
            "claude": {
                "emoji": "🟣",
                "model": "claude",
                "skills": [],
                "enabled": True,
            },
            "abc12345-DevOps": {
                "configVersion": 1,
                "id": "abc12345-0000-0000-0000-000000000000",
                "name": "DevOps",
                "adapter": "claude_local",
                "adapterConfig": {},
                "emoji": "🔧",
                "enabled": True,
                "skills": [],
            },
        }
        _setup_workspace(tmp_path, V0_GLOBAL_CONFIG, agents)

        import app
        with patch.object(app, "AGENTS_DIR", tmp_path / "agents"):
            names = app._get_installed_agent_names()

        assert "claude" in names
        assert "DevOps" in names
        assert "abc12345-DevOps" not in names


# ---------------------------------------------------------------------------
# Test: POST /agents creates v1 format with UUID folder
# ---------------------------------------------------------------------------


class TestAgentCreateV1:
    """POST /agents creates agent in UUID-prefixed folder with v1 config."""

    def test_creates_uuid_folder(self, tmp_path: Path):
        """New agent folder follows {short-uuid}-{name} pattern."""
        _setup_workspace(tmp_path, V0_GLOBAL_CONFIG, {})
        # Create _default template
        default_dir = tmp_path / "agents" / "_default"
        default_dir.mkdir(exist_ok=True)
        (default_dir / "AGENT.md").write_text("# Agent\n{name}")
        (default_dir / "IDENTITY.md").write_text("# Identity\n{name}")
        (default_dir / "SOUL.md").write_text("# Soul")
        (default_dir / "MEMORY.md").write_text("# Memory")

        import app
        with (
            patch.object(app, "CONFIG_FILE", tmp_path / "config.json"),
            patch.object(app, "AGENTS_DIR", tmp_path / "agents"),
            patch.object(app, "PROJECT_DIR", tmp_path),
        ):
            from fastapi.testclient import TestClient
            with TestClient(app.app) as client:
                r = client.post("/agents", json={
                    "name": "NewAgent",
                    "emoji": "🆕",
                    "color": "#00ff00",
                    "description": "Test v1",
                    "adapter": "claude_local",
                    "skills": [],
                    "enabled": True,
                })

        assert r.status_code == 200
        data = r.json()
        assert data["ok"] is True
        assert data["name"] == "NewAgent"
        assert "id" in data

        # Verify folder structure
        with patch.object(app, "AGENTS_DIR", tmp_path / "agents"):
            agent_dir = app._find_agent_dir("NewAgent")
        assert agent_dir is not None
        assert agent_dir.name.endswith("-NewAgent")
        assert len(agent_dir.name.split("-", 1)[0]) == 8  # UUID prefix is 8 chars

        # Verify v1 config
        cfg = json.loads((agent_dir / "config.json").read_text())
        assert cfg["configVersion"] == 1
        assert cfg["name"] == "NewAgent"
        assert cfg["id"] == data["id"]
        assert cfg["adapter"] == "claude_local"

    def test_v1_agent_appears_in_registry(self, tmp_path: Path):
        """Newly created v1 agent appears in get_agent_registry by display name."""
        _setup_workspace(tmp_path, V1_GLOBAL_CONFIG, {})
        default_dir = tmp_path / "agents" / "_default"
        default_dir.mkdir(exist_ok=True)
        (default_dir / "AGENT.md").write_text("# Agent\n{name}")
        (default_dir / "IDENTITY.md").write_text("# Identity\n{name}")
        (default_dir / "SOUL.md").write_text("# Soul")
        (default_dir / "MEMORY.md").write_text("# Memory")

        import app
        with (
            patch.object(app, "CONFIG_FILE", tmp_path / "config.json"),
            patch.object(app, "AGENTS_DIR", tmp_path / "agents"),
            patch.object(app, "PROJECT_DIR", tmp_path),
        ):
            from fastapi.testclient import TestClient
            with TestClient(app.app) as client:
                client.post("/agents", json={
                    "name": "RegistryTest",
                    "emoji": "🧪",
                    "color": "#aaa",
                    "adapter": "claude_local",
                    "skills": [],
                    "enabled": True,
                })
            registry = app.get_agent_registry()

        assert "RegistryTest" in registry
        assert registry["RegistryTest"]["name"] == "RegistryTest"

    def test_duplicate_name_rejected(self, tmp_path: Path):
        """Creating agent with same display name as existing v0 agent is rejected."""
        agents = {
            "claude": {
                "emoji": "🟣",
                "model": "claude",
                "skills": [],
                "enabled": True,
            }
        }
        _setup_workspace(tmp_path, V0_GLOBAL_CONFIG, agents)
        default_dir = tmp_path / "agents" / "_default"
        default_dir.mkdir(exist_ok=True)
        (default_dir / "AGENT.md").write_text("# Agent\n{name}")

        import app
        with (
            patch.object(app, "CONFIG_FILE", tmp_path / "config.json"),
            patch.object(app, "AGENTS_DIR", tmp_path / "agents"),
            patch.object(app, "PROJECT_DIR", tmp_path),
        ):
            from fastapi.testclient import TestClient
            with TestClient(app.app) as client:
                r = client.post("/agents", json={
                    "name": "claude",
                    "emoji": "🟣",
                    "adapter": "claude_local",
                })

        assert r.status_code == 409
