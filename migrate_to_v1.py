#!/usr/bin/env python3
"""
migrate_to_v1.py — Migrate agent configs from v0 to v1 format.

This script is part of the backend merge project. It converts:
  1. Agent config.json from v0 (model soft ref) to v1 (adapter-based)
  2. Agent folders from {name}/ to {short-uuid}-{name}/
  3. Global config.json models → adapter_presets + company

Usage:
    python3 migrate_to_v1.py [--root /path/to/project]

Dry-run (default is live):
    python3 migrate_to_v1.py --dry-run

Safety:
  - Skips _default/ and Default_* folders
  - Idempotent: skips already-v1 configs (configVersion == 1)
  - Backs up original config.json files before overwriting
"""

import argparse
import json
import logging
import shutil
import uuid
from pathlib import Path
from typing import Any

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MODEL_TO_ADAPTER: dict[str, str] = {
    "claude": "claude_local",
    "gemini": "gemini_local",
    "ollama": "ollama_api",
    "codex": "codex_local",
    "gemini-2.5-pro": "gemini_local",
}

# Default adapter models when converting from v0 model name to v1 adapterConfig.model
ADAPTER_DEFAULT_MODELS: dict[str, str] = {
    "claude_local": "claude-sonnet-4-6",
    "gemini_local": "gemini-2.5-flash",
    "ollama_api": "deepseek-v3.1:671b-cloud",
    "codex_local": "codex",
}

THINKING_DEFAULTS: dict[str, dict[str, str]] = {
    "claude_local": {
        "default": "claude-sonnet-4-6",
        "thinking": "claude-opus-4-6",
    },
    "gemini_local": {
        "default": "gemini-2.5-flash",
        "thinking": "gemini-2.5-pro",
    },
}


def _should_skip_folder(name: str) -> bool:
    """Return True if this agent folder should be left untouched."""
    return name == "_default" or name.startswith("Default_")


def _generate_short_uuid() -> str:
    """Generate an 8-character hex string from a UUID4."""
    return uuid.uuid4().hex[:8]


# ---------------------------------------------------------------------------
# Agent config migration
# ---------------------------------------------------------------------------


def migrate_agent_config(v0: dict[str, Any], folder_name: str) -> dict[str, Any]:
    """
    Convert a v0 agent config dict to v1 format.

    Returns the new v1 config dict. Does NOT modify the input.
    """
    if v0.get("configVersion") == 1:
        return v0  # already v1, return as-is

    model_ref = v0.get("model", "")
    adapter = MODEL_TO_ADAPTER.get(model_ref, model_ref)
    default_model = ADAPTER_DEFAULT_MODELS.get(adapter, model_ref)

    # Determine model_tiers
    model_tiers = None
    if "model_tiers" in v0 and v0["model_tiers"]:
        # Preserve existing model_tiers
        model_tiers = v0["model_tiers"]
    elif v0.get("supports_thinking") is True:
        # Generate defaults based on adapter (copy to avoid mutating constant)
        defaults = THINKING_DEFAULTS.get(adapter)
        model_tiers = dict(defaults) if defaults else None

    v1: dict[str, Any] = {
        "configVersion": 1,
        "id": str(uuid.uuid4()),
        "name": folder_name,
        "role": "general",
        "title": None,
        "emoji": v0.get("emoji", "\U0001f916"),  # 🤖
        "color": v0.get("color", "#888888"),
        "description": v0.get("description", ""),
        "enabled": v0.get("enabled", True),
        "adapter": adapter,
        "adapterConfig": {"model": default_model},
        "model_tiers": model_tiers,
        "skills": v0.get("skills", []),
        "reportsTo": None,
        "permissions": {},
        "budget": 0,
        "heartbeat": {"cooldownSec": 10, "intervalSec": 3600},
    }
    return v1


def migrate_agent_folder(agents_dir: Path, folder_name: str, dry_run: bool = False) -> str | None:
    """
    Migrate a single agent folder: convert config + rename folder.

    Returns the new folder name, or None if skipped.
    """
    agent_dir = agents_dir / folder_name

    if not agent_dir.is_dir():
        return None

    if _should_skip_folder(folder_name):
        log.info("Skipping protected folder: %s", folder_name)
        return None

    config_path = agent_dir / "config.json"
    if not config_path.exists():
        log.warning("No config.json in %s — skipping", folder_name)
        return None

    try:
        v0 = json.loads(config_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as e:
        log.error("Failed to read %s: %s — skipping", config_path, e)
        return None

    # Idempotent: skip if already v1
    if v0.get("configVersion") == 1:
        log.info("Already v1: %s — skipping", folder_name)
        return folder_name

    v1 = migrate_agent_config(v0, folder_name)

    # Generate new folder name: {short-uuid}-{name}
    short_id = _generate_short_uuid()
    new_folder_name = f"{short_id}-{folder_name}"
    new_dir = agents_dir / new_folder_name

    if dry_run:
        log.info("[DRY RUN] Would migrate %s → %s", folder_name, new_folder_name)
        return new_folder_name

    # Backup original config, then write new config, then rename folder
    backup_path = config_path.with_suffix(".json.v0.bak")
    if not backup_path.exists():
        import shutil
        shutil.copy2(config_path, backup_path)
        log.info("Backed up %s/config.json → config.json.v0.bak", folder_name)
    config_path.write_text(json.dumps(v1, indent=2, ensure_ascii=False), encoding="utf-8")
    log.info("Wrote v1 config to %s/config.json", folder_name)

    # Rename folder
    agent_dir.rename(new_dir)
    log.info("Renamed folder: %s → %s", folder_name, new_folder_name)

    return new_folder_name


# ---------------------------------------------------------------------------
# Global config migration
# ---------------------------------------------------------------------------


def migrate_global_config(config: dict[str, Any]) -> dict[str, Any]:
    """
    Convert global config.json from v0 (models) to v1 (adapter_presets + company).

    Returns new config dict. Does NOT modify the input.
    """
    # Idempotent: skip if already migrated
    if "adapter_presets" in config:
        return config

    models = config.get("models", {})
    adapter_presets: dict[str, Any] = {}

    for model_name, model_cfg in models.items():
        adapter_key = MODEL_TO_ADAPTER.get(model_name, model_name)

        # Don't overwrite if we already built this adapter preset
        # (e.g., gemini-2.5-pro maps to gemini_local, same as gemini)
        if adapter_key in adapter_presets:
            continue

        preset: dict[str, Any] = {}

        if model_cfg.get("type") == "cli":
            cmd = model_cfg.get("cmd", [])
            preset["command"] = cmd[0] if cmd else model_name
            preset["defaultArgs"] = cmd[1:] if len(cmd) > 1 else []
            preset["defaultModel"] = ADAPTER_DEFAULT_MODELS.get(adapter_key, model_name)
            preset["timeoutSec"] = model_cfg.get("idle_timeout_seconds", 120)
            preset["startupTimeoutSec"] = model_cfg.get("startup_timeout_seconds", 120)
            preset["supports_image"] = True
        elif model_cfg.get("type") == "api":
            preset["baseUrl"] = model_cfg.get("baseUrl", "")
            preset["apiModel"] = model_cfg.get("apiModel", "")
            preset["defaultModel"] = model_cfg.get("apiModel", model_name)
            preset["timeoutSec"] = model_cfg.get("idle_timeout_seconds", 120)
            preset["startupTimeoutSec"] = model_cfg.get("startup_timeout_seconds", 120)
            preset["supports_image"] = False
        else:
            # Unknown type — carry forward as-is
            preset = dict(model_cfg)

        adapter_presets[adapter_key] = preset

    # Build new config
    new_config = {}
    for key, val in config.items():
        if key == "models":
            continue  # replaced by adapter_presets
        new_config[key] = val

    new_config["adapter_presets"] = adapter_presets

    # Add company section if not present
    if "company" not in new_config:
        new_config["company"] = {"name": ""}

    return new_config


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------


def run_migration(root: Path, dry_run: bool = False) -> None:
    """Run the full migration on a project root."""
    root = Path(root)
    agents_dir = root / "agents"
    global_config_path = root / "config.json"

    # --- Migrate global config ---
    if global_config_path.exists():
        try:
            global_cfg = json.loads(global_config_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as e:
            log.error("Failed to read global config: %s", e)
            return

        new_global_cfg = migrate_global_config(global_cfg)

        if new_global_cfg is not global_cfg:  # identity check: was it changed?
            if dry_run:
                log.info("[DRY RUN] Would update global config.json")
            else:
                # Backup
                backup = global_config_path.with_suffix(".json.v0.bak")
                if not backup.exists():
                    shutil.copy2(global_config_path, backup)
                global_config_path.write_text(
                    json.dumps(new_global_cfg, indent=2, ensure_ascii=False),
                    encoding="utf-8",
                )
                log.info("Migrated global config.json")
        else:
            log.info("Global config already migrated — skipping")

    # --- Migrate agent folders ---
    if agents_dir.exists():
        # Take a snapshot of current folder names to avoid iterating over renamed dirs
        folder_names = sorted([d.name for d in agents_dir.iterdir() if d.is_dir()])
        for folder_name in folder_names:
            migrate_agent_folder(agents_dir, folder_name, dry_run=dry_run)
    else:
        log.warning("No agents/ directory found at %s", agents_dir)


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(description="Migrate agent configs from v0 to v1")
    parser.add_argument(
        "--root",
        type=Path,
        default=Path("."),
        help="Project root directory (default: current directory)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be done without making changes",
    )
    args = parser.parse_args()

    log.info("Starting v0 → v1 migration (root=%s, dry_run=%s)", args.root, args.dry_run)
    run_migration(args.root, dry_run=args.dry_run)
    log.info("Migration complete.")


if __name__ == "__main__":
    main()
