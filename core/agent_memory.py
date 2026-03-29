"""Agent-level memory: heuristic extraction, per-agent flush/load, consolidation.

Reads/writes ``agents/{name}/memory/``. Only imports from ``memory_utils``
(never from ``session_memory``).
"""
import hashlib
import json
import logging
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from core.memory_utils import (
    FACT_PATTERNS,
    _TYPE_IMPORTANCE,
    _MAX_FACT_TEXT_LEN,
    _MAX_ENTITY_VALUE_LEN,
    _MIN_IMPORTANCE_THRESHOLD,
    _MIN_CONSOLIDATION_LEN,
    _format_fact_line,
    _truncate_messages_text,
    _parse_llm_facts_response,
)

logger = logging.getLogger(__name__)

# ── Heuristic fact extraction (Phase 1) ──────────────────────────────────────


def heuristic_extract_facts(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Fast regex-based fact extraction — no LLM, < 10ms.

    Scans messages of type ``"message"`` for known patterns (decisions,
    preferences, findings, actions) and returns structured facts.

    Args:
        messages: List of message dicts with keys ``type``, ``text``, ``agent``.

    Returns:
        List of ``{type, text, importance, agent}`` dicts.
    """
    facts: list[dict[str, Any]] = []
    seen: set[str] = set()
    for m in messages:
        if m.get("type") != "message":
            continue
        text = m.get("text", "")
        agent = m.get("agent", "?")
        for pattern, fact_type, importance in FACT_PATTERNS:
            for match in re.finditer(pattern, text):
                fact_text = match.group(0)[:_MAX_FACT_TEXT_LEN].strip()
                if fact_text not in seen:
                    seen.add(fact_text)
                    facts.append({
                        "type": fact_type,
                        "text": fact_text,
                        "importance": importance,
                        "agent": agent,
                    })
    return facts


# ── Flush / Load ──────────────────────────────────────────────────────────────


def flush_facts_to_memory(facts: list[dict[str, Any]], agent_workspaces: dict[str, str]) -> None:
    """Write extracted facts to each agent's daily memory file.

    Facts with importance below ``_MIN_IMPORTANCE_THRESHOLD`` are filtered out.
    Silently ignores all errors — must never break the caller.

    Args:
        facts: List of fact dicts with keys ``type``, ``text``, ``importance``.
        agent_workspaces: Mapping of agent name to workspace directory path.
    """
    if not facts:
        return
    now = datetime.now()
    today = now.strftime("%Y-%m-%d")
    timestamp = now.strftime("%H:%M")
    # Format facts as markdown
    lines: list[str] = [f"\n## {today} {timestamp} — Session Extract\n"]
    for f in facts:
        importance = f.get("importance", 5)
        if importance < _MIN_IMPORTANCE_THRESHOLD:
            continue
        lines.append(_format_fact_line(f["type"], f["text"]))
    if len(lines) <= 1:  # Only header, no facts worth keeping
        return
    content = "\n".join(lines) + "\n"
    # Write to each agent's memory
    for agent_name, workspace in agent_workspaces.items():
        try:
            memory_dir = Path(workspace) / "memory"
            memory_dir.mkdir(parents=True, exist_ok=True)
            path = memory_dir / f"{today}.md"
            with open(path, "a", encoding="utf-8") as fh:
                fh.write(content)
        except Exception as exc:
            logger.warning("flush_facts_failed agent=%s workspace=%s: %s", agent_name, workspace, exc)


def load_recent_facts(memory_dir: Path | str, max_chars: int = 500, max_days: int = 3) -> str:
    """Load recent facts with importance-weighted selection + read-time dedup.

    Reads last *max_days* of memory files, parses ``- [TYPE] text`` lines,
    sorts by importance DESC then recency DESC, accumulates to *max_chars*.

    Args:
        memory_dir: Path to the agent's ``memory/`` directory.
        max_chars: Character budget for the returned text.
        max_days: Number of recent days to scan.

    Returns:
        Formatted fact lines as a single string, or ``""`` if nothing found.
    """
    memory_dir = Path(memory_dir)
    if not memory_dir.exists():
        return ""

    today = datetime.now()
    entries: list[dict[str, Any]] = []
    seen_hashes: set[str] = set()

    for day_offset in range(max_days):
        date = (today - timedelta(days=day_offset)).strftime("%Y-%m-%d")
        path = memory_dir / f"{date}.md"
        if not path.exists():
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except Exception:
            continue
        for line in text.splitlines():
            m = re.match(r'^- \[(\w+)\]\s+(.+)$', line)
            if not m:
                continue
            fact_type = m.group(1)
            fact_text = m.group(2).strip()
            # Dedup via hash (case-insensitive)
            h = hashlib.md5(fact_text.lower().encode()).hexdigest()
            if h in seen_hashes:
                continue
            seen_hashes.add(h)
            importance = _TYPE_IMPORTANCE.get(fact_type, 5)
            entries.append({
                "type": fact_type,
                "text": fact_text,
                "importance": importance,
                "day_offset": day_offset,
            })

    # Sort: importance DESC, then recency DESC (lower day_offset = more recent)
    entries.sort(key=lambda e: (-e["importance"], e["day_offset"]))

    # Accumulate to budget
    result_lines: list[str] = []
    total = 0
    for e in entries:
        line = _format_fact_line(e["type"], e["text"])
        if total + len(line) > max_chars:
            break
        result_lines.append(line)
        total += len(line)
    return "\n".join(result_lines)


def load_entities(memory_dir: Path | str, max_chars: int = 300) -> str:
    """Read entities.json and format as ``- **key**: value``, budget-limited.

    Keys starting with ``_`` are treated as internal and skipped.

    Args:
        memory_dir: Path to the agent's ``memory/`` directory.
        max_chars: Character budget for the returned text.

    Returns:
        Formatted entity lines as a single string, or ``""`` if nothing found.
    """
    memory_dir = Path(memory_dir)
    path = memory_dir / "entities.json"
    if not path.exists():
        return ""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return ""
    if not isinstance(data, dict):
        return ""

    lines: list[str] = []
    total = 0
    for key, value in data.items():
        if key.startswith("_"):
            continue
        line = f"- **{key}**: {value}"
        if total + len(line) > max_chars:
            break
        lines.append(line)
        total += len(line)
    return "\n".join(lines)


def flush_entities(workspace: str | Path, entities: dict[str, str]) -> None:
    """Merge new entities into entities.json.

    New values overwrite existing ones for the same key (no archive per CTO review).
    Silently ignores all errors.

    Args:
        workspace: Agent workspace directory path.
        entities: New entities to merge.
    """
    if not entities:
        return
    try:
        path = Path(workspace) / "memory" / "entities.json"
        existing: dict[str, Any] = {}
        if path.exists():
            existing = json.loads(path.read_text(encoding="utf-8"))
        for key, new_val in entities.items():
            existing[key] = str(new_val)[:_MAX_ENTITY_VALUE_LEN]
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(existing, ensure_ascii=False, indent=2))
    except Exception as exc:
        logger.warning("flush_entities_failed workspace=%s: %s", workspace, exc)


# ── Agent-scoped extraction ───────────────────────────────────────────────────

_AGENT_SCOPED_PROMPT = """\
You are {agent_name}. Review this conversation and extract facts relevant to YOU specifically.

Your identity:
{agent_identity}

Focus on:
- Decisions that affect YOUR work or responsibilities
- Feedback directed at YOU (things you should do differently next time)
- Mistakes YOU made that you must NOT repeat
- User preferences that affect how YOU should respond
- Knowledge about other agents that helps you collaborate better

Do NOT extract:
- Facts about other agents' internal errors (not your concern)
- General project history that doesn't affect your behavior
- Things already covered in your AGENT.md or IDENTITY.md

Fact types:
- DECISION: choices affecting your work
- SELF_CORRECTION: mistakes you made, do NOT repeat
- FEEDBACK: user/agent feedback directed at you
- PREFERENCE: user preferences for how you should behave
- COLLABORATION: how to work with other agents
- FINDING: technical knowledge relevant to your role
- ACTION: tasks assigned to you

Output as JSON array:
[{{"type": "...", "text": "...", "importance": 1-10}}]

If nothing relevant to you, return [].

Conversation:
{conversation}"""


async def _agent_scoped_extract(
    agent_name: str,
    workspace: str,
    messages: list[dict[str, Any]],
    model_config: dict[str, Any],
) -> list[dict[str, Any]]:
    """Extract facts relevant to a specific agent (first-person perspective).

    Uses the agent's identity (AGENT.md, IDENTITY.md) to scope extraction.
    Returns agent-specific facts. On failure, returns empty list.

    Args:
        agent_name: Name of the agent.
        workspace: Agent workspace path (contains AGENT.md, IDENTITY.md).
        messages: Conversation messages.
        model_config: Model configuration for LLM calls.
    """
    import app as _app

    try:
        ws = Path(workspace)
        # Load agent identity for context
        identity_parts: list[str] = []
        for fname in ["AGENT.md", "IDENTITY.md"]:
            f = ws / fname
            if f.exists():
                try:
                    content = f.read_text(encoding="utf-8")[:500]  # cap identity size
                    identity_parts.append(content)
                except Exception:
                    pass
        agent_identity = "\n".join(identity_parts) if identity_parts else f"You are {agent_name}."

        conversation = _truncate_messages_text(messages, max_chars=6000)

        prompt = _AGENT_SCOPED_PROMPT.format(
            agent_name=agent_name,
            agent_identity=agent_identity,
            conversation=conversation,
        )

        result = await _app.call_agent(model_config, prompt)
        facts = _parse_llm_facts_response(result)

        # Tag with agent name
        for f in facts:
            f["agent"] = agent_name

        logger.info("agent_scoped_extract agent=%s facts=%d", agent_name, len(facts))
        return facts
    except Exception as exc:
        logger.warning("agent_scoped_extract_failed agent=%s: %s", agent_name, exc)
        return []


# ── MEMORY.md consolidation ───────────────────────────────────────────────

CONSOLIDATE_PROMPT = """\
You are consolidating an agent's recent session facts into a curated memory file.

Recent facts to consolidate:
{recent_facts}

Known entities:
{entities}

Rules:
- Group facts by category with markdown headers:
  ## Decisions, ## Preferences, ## Findings, ## Lessons Learned, ## Action Items
- "Lessons Learned" MUST include mistakes to avoid and corrections (e.g. "do NOT do X")
- Remove duplicates (keep the most complete version)
- Drop trivial or superseded facts
- Each fact one bullet point, concise
- Write in the conversation's primary language
- If nothing worth consolidating, output "NONE"

Output ONLY the consolidated markdown content (no preamble)."""

MEMORY_INDEX_SECTION = "## Session Memory"


async def _consolidate_agent_memory(
    workspace: str | Path, model_config: dict[str, Any]
) -> None:
    """Consolidate daily facts + entities into a dated memory file, update MEMORY.md index.

    MEMORY.md is an INDEX — it points to memory files, not raw facts.
    The actual consolidated content goes to ``memory/consolidated-YYYY-MM-DD.md``.

    Runs as part of post-session distillation. Silent on failure.

    Args:
        workspace: Agent workspace directory path.
        model_config: Model configuration for LLM calls.
    """
    try:
        import app as _app

        workspace = Path(workspace)
        memory_md = workspace / "MEMORY.md"
        memory_dir = workspace / "memory"

        if not memory_dir.exists():
            return

        # Read recent facts (last 7 days, wider window for consolidation)
        recent_facts = load_recent_facts(memory_dir, max_chars=3000, max_days=7)
        entities_text = load_entities(memory_dir, max_chars=1000)

        if not recent_facts and not entities_text:
            return

        prompt = CONSOLIDATE_PROMPT.format(
            recent_facts=recent_facts or "(none)",
            entities=entities_text or "(none)",
        )

        result = await _app.call_agent(model_config, prompt)
        if not result or result.strip() == "NONE" or len(result.strip()) < _MIN_CONSOLIDATION_LEN:
            return

        # Write consolidated file
        today = datetime.now().strftime("%Y-%m-%d")
        consolidated_path = memory_dir / f"consolidated-{today}.md"
        consolidated_path.write_text(
            f"# Consolidated Memory — {today}\n\n{result.strip()}\n",
            encoding="utf-8",
        )

        # Update MEMORY.md index
        _update_memory_index(memory_md, today, consolidated_path.name)

        logger.info("memory_consolidated workspace=%s file=%s", workspace.name, consolidated_path.name)
    except Exception as exc:
        logger.warning("consolidate_memory_failed workspace=%s: %s", workspace, exc)


def _update_memory_index(memory_md: Path, date: str, filename: str) -> None:
    """Add or update an entry in MEMORY.md's Session Memory section.

    Idempotent: skips if the filename is already present in the file.

    Args:
        memory_md: Path to the MEMORY.md file.
        date: Date string (YYYY-MM-DD) for the entry label.
        filename: Name of the consolidated file to link.
    """
    try:
        current = memory_md.read_text(encoding="utf-8") if memory_md.exists() else ""
        entry = f"- [memory/{filename}](memory/{filename}) — {date} session consolidation"

        # Check if this date's entry already exists
        if filename in current:
            return  # already indexed

        # Find or create the Session Memory section
        if MEMORY_INDEX_SECTION in current:
            # Append after the section header
            lines = current.split("\n")
            new_lines: list[str] = []
            inserted = False
            for line in lines:
                new_lines.append(line)
                if line.strip() == MEMORY_INDEX_SECTION and not inserted:
                    new_lines.append(entry)
                    inserted = True
            current = "\n".join(new_lines)
        else:
            # Add section at the end
            current = current.rstrip() + f"\n\n{MEMORY_INDEX_SECTION}\n{entry}\n"

        memory_md.write_text(current, encoding="utf-8")
    except Exception as exc:
        logger.warning("update_memory_index_failed path=%s: %s", memory_md, exc)
