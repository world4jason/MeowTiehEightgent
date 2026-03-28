"""Prompt building and human text resolution helpers."""
import json
import re
from datetime import datetime
from pathlib import Path


_THINK_RE = re.compile(r'^/think(?:\s+@(\S+))?$', re.IGNORECASE)
_CHAT_RE = re.compile(r'^/chat(?:\s+@(\S+))?$', re.IGNORECASE)


def intercept_mode_command(
    text: str,
    agent_modes: dict,
    active_agents: list,
) -> tuple[bool, list[dict]]:
    """Check if text is a /think or /chat TUI command.

    Returns (intercepted: bool, mode_updates: list[dict]).
    Each update is either {"agent": str, "mode": str} or {"error": str}.
    If intercepted=True, caller must NOT forward text to agents.
    """
    m = _THINK_RE.match(text.strip()) or _CHAT_RE.match(text.strip())
    if not m:
        return False, []

    target_mode = "think" if text.strip().lower().startswith("/think") else "chat"
    target_name = m.group(1)  # None if no @name

    updates: list[dict] = []
    if target_name:
        found = next(
            (a["name"] for a in active_agents if a["name"].lower() == target_name.lower()),
            None,
        )
        if found:
            agent_modes[found] = target_mode
            updates.append({"agent": found, "mode": target_mode})
        else:
            return True, [{"error": f'No agent named "{target_name}" found.'}]
    else:
        for a in active_agents:
            agent_modes[a["name"]] = target_mode
            updates.append({"agent": a["name"], "mode": target_mode})

    return True, updates


def resolve_human_text(text: str, workspace_id: str | None = None) -> tuple[str, str | None]:
    import app as _app
    from core.skills import find_skill_file, parse_skill

    if text.startswith("/"):
        skill_name = text[1:].strip().lower()
        skill_file = find_skill_file(_app.PROJECT_DIR / "skills" / skill_name)
        # Fallback: handle "source:slug" format (e.g. "gstack:review")
        if not skill_file and ":" in skill_name:
            source_prefix, slug_part = skill_name.split(":", 1)
            # Try skills/{slug} (symlink from gstack setup)
            skill_file = find_skill_file(_app.PROJECT_DIR / "skills" / slug_part)
            # Try skills/{source}/{slug} (direct subdirectory)
            if not skill_file:
                skill_file = find_skill_file(_app.PROJECT_DIR / "skills" / source_prefix / slug_part)
        if skill_file:
            s = parse_skill(skill_file)
            display_name = f"{s['source']}:{s['name']}" if s.get("source") else s["name"]
            history_entry = f"[Skill invoked: {display_name}]\n\n{s['body']}\n\nAll agents: apply this skill now in your next response."
            return history_entry, display_name

    # @filename.ext injection
    if workspace_id:
        files_dir = _app.WORKSPACES_DIR / workspace_id / "files"

        def inject_file(m):
            fname = m.group(1)
            fpath = files_dir / fname
            if fpath.is_file():
                try:
                    content = fpath.read_text(errors='replace')
                    return f"[File: {fname}]\n```\n{content}\n```"
                except Exception:
                    pass
            return m.group(0)

        text = re.sub(r'@([\w\-]+\.\w+)', inject_file, text)

    return text, None


def build_prompt(
    agent: dict,
    history_text: str,
    workspace_id: str | None = None,
    all_agents: list[dict] | None = None,
    mode: str = "chat",
    scenario_system_prompt: str | None = None,
    blank_mode: bool = False,
    kanban_state: list[dict] | None = None,
) -> str:
    import app as _app
    from core.skills import find_skill_file, parse_skill

    ws: Path = agent["workspace"]
    parts = []
    mode_prefix = "Keep your response concise — 2-3 sentences max.\n\n" if mode == "chat" else ""

    # Context injection: scenario > workspace > blank
    # scenario_system_prompt="" is treated same as None (no scenario active)
    if scenario_system_prompt:
        parts.append(f"## Session Context\n\n{scenario_system_prompt}")
    elif not blank_mode and workspace_id:
        # Workspace guide injected first (before agent identity)
        ws_dir = _app.WORKSPACES_DIR / workspace_id
        ws_cfg_path = ws_dir / "config.json"
        if ws_cfg_path.exists():
            ws_cfg = json.loads(ws_cfg_path.read_text())
            guide_parts = []
            if ws_cfg.get("system_prompt"):
                guide_parts.append(ws_cfg["system_prompt"])
            files_dir = ws_dir / "files"
            if files_dir.exists():
                total = 0
                file_names = []
                for fp in sorted(files_dir.iterdir()):
                    if not fp.is_file():
                        continue
                    file_names.append(fp.name)
                    size = fp.stat().st_size
                    if total + size < 50_000:  # inject full text up to 50KB
                        try:
                            guide_parts.append(f"### {fp.name}\n\n{fp.read_text()}")
                            total += size
                        except Exception:
                            pass
                    else:
                        guide_parts.append(f"### {fp.name} (too large — use @{fp.name} to load)")
            if guide_parts:
                parts.append("## Workspace Guide\n\n" + "\n\n".join(guide_parts))
    # blank_mode: inject nothing

    # Kanban discussion state
    if kanban_state:
        todo = [i["text"] for i in kanban_state if i.get("status") == "todo"]
        wip = [i["text"] for i in kanban_state if i.get("status") == "wip"]
        done = [i["text"] for i in kanban_state if i.get("status") == "done"]
        lines = ["## Discussion Board"]
        if wip:
            lines.append("**In Progress:** " + ", ".join(wip))
        if todo:
            lines.append("**TODO:** " + ", ".join(todo))
        if done:
            lines.append("**Done:** " + ", ".join(done))
        lines.append("\nFocus on In Progress items. Refer to this board to stay aligned with the discussion goals.")
        parts.append("\n".join(lines))

    # AGENT.md first — main operational instructions
    for fname in ["AGENT.md", "IDENTITY.md", "SOUL.md"]:
        f = ws / fname
        if f.exists():
            parts.append(f.read_text().strip())

    user_md = _app.PROJECT_DIR / "USER.md"
    if user_md.exists():
        parts.append(user_md.read_text().strip())

    # Long-term memory injection (budget-limited, importance-weighted)
    memory_dir = ws / "memory"
    if memory_dir.exists():
        try:
            from core.memory import load_recent_facts, load_entities
            recent_facts = load_recent_facts(memory_dir, max_chars=500)
            if recent_facts:
                parts.append(f"## Recent Memory\n\n{recent_facts}")
            entities_text = load_entities(memory_dir, max_chars=300)
            if entities_text:
                parts.append(f"## Known Entities\n\n{entities_text}")
        except Exception:
            pass  # Memory injection must never break prompt building

    today = datetime.now().strftime("%Y-%m-%d")
    mem_file = ws / "memory" / f"{today}.md"
    if mem_file.exists():
        parts.append(f"## Your memory ({today})\n\n{mem_file.read_text().strip()}")

    agent_skills: list[str] = agent.get("skills") or []
    skills_dir = _app.PROJECT_DIR / "skills"
    if skills_dir.exists() and agent_skills:
        for slug_dir in sorted(skills_dir.iterdir()):
            if not slug_dir.is_dir() or slug_dir.name not in agent_skills:
                continue
            sf = find_skill_file(slug_dir)
            if sf:
                s = parse_skill(sf)
                parts.append(f"## Skill: {s['name']}\n\n{s['body']}")

    context = "\n\n---\n\n".join(parts)

    # Dynamic participants header
    if all_agents:
        names = [a["name"] for a in all_agents if a["name"] != agent["name"]]
        others = ", ".join(names) if names else "none"
        participants_header = (
            f"Participants in this room: {agent['name']} (you), {others}, Human\n"
            f"Your previous responses above are marked [{agent['name']}]:\n"
        )
    else:
        participants_header = ""

    # Continuation hint for agents truncated in the previous turn
    continuation_hint = ""
    if agent.get("pending_continuation"):
        continuation_hint = (
            "\n\n[系統提示] 你在上一輪說到一半被打斷了"
            "（歷史中可看到 [TRUNCATED] 標記）。"
            "這輪你可以選擇繼續完整你的想法，或先回應其他人的發言再補充。"
        )
        agent["pending_continuation"] = False

    return (
        f"{mode_prefix}{context}\n\n===== DISCUSSION =====\n\n"
        f"{participants_header}\n{history_text}"
        f"{continuation_hint}\n\n"
        "Your turn. Respond as your persona dictates."
    )


def list_skill_slugs() -> list[str]:
    """Return sorted list of all skill slugs currently installed."""
    import app as _app
    d = _app.PROJECT_DIR / "skills"
    if not d.exists():
        return []
    return sorted(p.name for p in d.iterdir() if p.is_dir())
