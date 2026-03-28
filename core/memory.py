"""Pre-compaction memory flush + post-session distillation.

Dual-trigger memory extraction:
  A) Pre-compaction heuristic (regex, sync, <10ms)
  B) Post-session LLM distillation (background, async)

All public functions are defensively wrapped — failures never affect
the main conversation flow.
"""
import asyncio
import hashlib
import json
import logging
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# ── Heuristic fact extraction (Phase 1) ──────────────────────────────────────

# Tightened regex patterns with importance scores (修改 3)
FACT_PATTERNS: list[tuple[str, str, int]] = [
    (r'(?i)(?:we |team |已)\s*(decided|chose|確定|決定)\s+(?:to\s+)?(.{10,200})', 'DECISION', 7),
    (r'(?i)(?:user |使用者\s*)(prefer|偏好|要求)\s*:?\s*(.{10,200})', 'PREFERENCE', 6),
    (r'(?i)(?:root cause|原因|bug)\s*(?:is|was|：|:)\s*(.{10,200})', 'FINDING', 6),
    (r'(?i)(?:todo|action item|待辦)\s*:?\s*(.{10,200})', 'ACTION', 5),
]

# Importance lookup by fact type (for read-time when parsing stored facts)
_TYPE_IMPORTANCE: dict[str, int] = {
    'DECISION': 7, 'PREFERENCE': 6, 'FINDING': 6, 'ACTION': 5,
    'WORKFLOW': 5, 'RELATIONSHIP': 4, 'CORRECTION': 7, 'CONFIG': 4,
}


def heuristic_extract_facts(messages: list[dict]) -> list[dict]:
    """Fast regex-based fact extraction — no LLM, < 10ms.

    Returns list of {type, text, importance, agent}.
    """
    facts: list[dict] = []
    seen: set[str] = set()
    for m in messages:
        if m.get("type") != "message":
            continue
        text = m.get("text", "")
        agent = m.get("agent", "?")
        for pattern, fact_type, importance in FACT_PATTERNS:
            for match in re.finditer(pattern, text):
                fact_text = match.group(0)[:200].strip()
                if fact_text not in seen:
                    seen.add(fact_text)
                    facts.append({
                        "type": fact_type,
                        "text": fact_text,
                        "importance": importance,
                        "agent": agent,
                    })
    return facts


def flush_facts_to_memory(facts: list[dict], agent_workspaces: dict[str, str]) -> None:
    """Write extracted facts to each agent's daily memory file.

    Silently ignores all errors — must never break the caller.
    """
    if not facts:
        return
    today = datetime.now().strftime("%Y-%m-%d")
    timestamp = datetime.now().strftime("%H:%M")
    # Format facts as markdown
    lines: list[str] = [f"\n## {today} {timestamp} — Session Extract\n"]
    for f in facts:
        importance = f.get("importance", 5)
        if importance < 4:
            continue
        lines.append(f"- [{f['type']}] {f['text']}")
    if len(lines) <= 1:  # Only header, no facts worth keeping
        return
    content = "\n".join(lines) + "\n"
    # Write to each agent's memory
    for name, workspace in agent_workspaces.items():
        try:
            memory_dir = Path(workspace) / "memory"
            memory_dir.mkdir(parents=True, exist_ok=True)
            path = memory_dir / f"{today}.md"
            with open(path, "a", encoding="utf-8") as fh:
                fh.write(content)
        except Exception as exc:
            logger.warning("Failed to flush facts for %s: %s", name, exc)


# ── Memory injection helpers (Phase 1) ───────────────────────────────────────

def load_recent_facts(memory_dir: Path | str, max_chars: int = 500, max_days: int = 3) -> str:
    """Load recent facts with importance-weighted selection + read-time dedup.

    Reads last *max_days* of memory files, parses ``- [TYPE] text`` lines,
    sorts by importance DESC then recency DESC, accumulates to *max_chars*.
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
            # Dedup via hash
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
        line = f"- [{e['type']}] {e['text']}"
        if total + len(line) > max_chars:
            break
        result_lines.append(line)
        total += len(line)
    return "\n".join(result_lines)


def load_entities(memory_dir: Path | str, max_chars: int = 300) -> str:
    """Read entities.json and format as ``- **key**: value``, budget-limited."""
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


# ── Post-session distillation (Phase 2a) ─────────────────────────────────────

_distill_semaphore = asyncio.Semaphore(3)
_distilling_sessions: set[str] = set()


def _sample_messages_text(messages: list[dict], max_chars: int = 3000) -> str:
    """Sample begin + mid + end of message texts (1000 chars each)."""
    texts: list[str] = []
    for m in messages:
        if m.get("type") == "message":
            texts.append(f"[{m.get('agent', '?')}]: {m.get('text', '')}")
    full = "\n".join(texts)
    if len(full) <= max_chars:
        return full
    third = max_chars // 3
    return full[:third] + "\n...\n" + full[len(full) // 2 - third // 2:len(full) // 2 + third // 2] + "\n...\n" + full[-third:]


def _truncate_messages_text(messages: list[dict], max_chars: int = 8000) -> str:
    """Flatten messages to text, truncated to max_chars."""
    texts: list[str] = []
    for m in messages:
        if m.get("type") == "message":
            texts.append(f"[{m.get('agent', '?')}]: {m.get('text', '')}")
    full = "\n".join(texts)
    if len(full) > max_chars:
        return full[:max_chars]
    return full


async def _triage_session(messages: list[dict], model_config: dict) -> int:
    """Score session 1-10. Heuristic fallback if LLM fails."""
    import app as _app

    sample = _sample_messages_text(messages, max_chars=3000)
    prompt = (
        "Rate this conversation 1-10 for durable knowledge content.\n"
        "Consider: decisions, preferences, architectural choices, bug fixes, action items.\n"
        "Respond with ONLY a single integer.\n\n"
        f"Conversation:\n{sample}"
    )
    try:
        result = await _app.call_agent(model_config, prompt)
        # Extract first integer from response
        m = re.search(r'\b(\d+)\b', result or "")
        if m:
            score = int(m.group(1))
            return max(1, min(10, score))
    except Exception as exc:
        logger.warning("triage_llm_failed: %s — using heuristic", exc)

    # Heuristic fallback: line count + keyword scoring
    text = _truncate_messages_text(messages, max_chars=5000)
    score = 3  # baseline
    keywords = ['decided', 'chose', 'bug', 'fix', 'todo', 'action', 'prefer',
                'decided', '決定', '確定', '原因', '修正']
    for kw in keywords:
        if kw.lower() in text.lower():
            score += 1
    msg_count = sum(1 for m in messages if m.get("type") == "message")
    if msg_count > 20:
        score += 1
    return min(10, score)


async def _llm_extract_facts(messages: list[dict], model_config: dict) -> list[dict]:
    """LLM-based fact extraction. Truncates input to 8000 chars."""
    import app as _app

    text = _truncate_messages_text(messages, max_chars=8000)
    prompt = (
        "Extract durable facts from this conversation as a JSON array.\n"
        'Each fact: {"type": "...", "text": "...", "importance": 1-10, "entities": ["..."]}\n\n'
        "Types:\n"
        "- DECISION: choices made, directions agreed upon\n"
        "- ACTION: tasks assigned, commitments, deadlines\n"
        "- FINDING: technical discoveries, bug causes, conclusions\n"
        "- PREFERENCE: user preferences, constraints, requirements\n"
        "- WORKFLOW: processes established, patterns agreed\n"
        "- RELATIONSHIP: who does what, team structure\n"
        "- CORRECTION: mistakes identified, 'do NOT do X'\n"
        "- CONFIG: configuration details, environment specifics\n\n"
        "Rules:\n"
        "- Each fact must be self-contained and understandable without context\n"
        "- Skip greetings, small talk, meta-discussion\n"
        "- Maximum 20 facts\n"
        "- importance 8-10: critical decisions, hard-won insights\n"
        "- importance 5-7: useful patterns, preferences\n"
        "- importance 1-4: minor details (will be filtered out)\n"
        "- Preserve negations exactly: 'We will NOT use MongoDB'\n"
        "- If nothing worth remembering, return []\n\n"
        f"Conversation:\n{text}"
    )
    try:
        result = await _app.call_agent(model_config, prompt)
        # Extract JSON array from response
        json_match = re.search(r'\[.*\]', result or "", re.DOTALL)
        if not json_match:
            return []
        parsed = json.loads(json_match.group(0))
        if not isinstance(parsed, list):
            return []
        # Validate and filter
        valid: list[dict] = []
        for item in parsed[:20]:
            if not isinstance(item, dict):
                continue
            if "type" not in item or "text" not in item:
                continue
            importance = int(item.get("importance", 5))
            if importance < 4:
                continue
            valid.append({
                "type": str(item["type"])[:20],
                "text": str(item["text"])[:200],
                "importance": importance,
                "agent": "llm-distill",
            })
        return valid
    except Exception as exc:
        logger.warning("llm_extract_facts_failed: %s", exc)
        return []


# ── Entity extraction (Phase 2b) ─────────────────────────────────────────────

async def _llm_extract_entities(messages: list[dict], model_config: dict) -> dict[str, str]:
    """LLM entity extraction. Truncates input to 8000 chars."""
    import app as _app

    text = _truncate_messages_text(messages, max_chars=8000)
    prompt = (
        "Extract key entities from this conversation as JSON:\n"
        '{"entity_name": "description of what we know about this entity"}\n\n'
        "Focus on: people, projects, tools, preferences, constraints.\n"
        "Skip generic terms. Only include entities useful in future conversations.\n\n"
        f"Conversation:\n{text}"
    )
    try:
        result = await _app.call_agent(model_config, prompt)
        # Extract JSON object from response
        json_match = re.search(r'\{.*\}', result or "", re.DOTALL)
        if not json_match:
            return {}
        parsed = json.loads(json_match.group(0))
        if not isinstance(parsed, dict):
            return {}
        # Validate: all values must be strings
        validated: dict[str, str] = {}
        for k, v in parsed.items():
            validated[str(k)[:100]] = str(v)[:200]
        return validated
    except Exception as exc:
        logger.warning("llm_extract_entities_failed: %s", exc)
        return {}


def flush_entities(workspace: str | Path, entities: dict[str, str]) -> None:
    """Merge new entities into entities.json. New overwrites old (no archive per CTO review)."""
    if not entities:
        return
    try:
        path = Path(workspace) / "memory" / "entities.json"
        existing: dict[str, Any] = {}
        if path.exists():
            existing = json.loads(path.read_text(encoding="utf-8"))
        for key, new_val in entities.items():
            existing[key] = str(new_val)[:200]
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(existing, ensure_ascii=False, indent=2))
    except Exception as exc:
        logger.warning("Failed to flush entities: %s", exc)


# ── Distillation pipeline (Phase 2a + 2b) ────────────────────────────────────

async def distill_session(
    session_id: str,
    messages: list[dict],
    agent_workspaces: dict[str, str],
    model_config: dict,
) -> None:
    """Post-session fact distillation. Runs as background task.

    Pipeline: triage -> extract facts + entities -> store.
    All wrapped in try/except — failures are silent.
    """
    try:
        # Stage 1: Triage
        score = await _triage_session(messages, model_config)
        logger.info("distill_triage session=%s score=%d", session_id, score)
        if score < 4:
            return

        # Stage 2: Extract facts + entities
        facts = await _llm_extract_facts(messages, model_config)
        entities = await _llm_extract_entities(messages, model_config)

        # Stage 3: Store
        if facts:
            flush_facts_to_memory(facts, agent_workspaces)
        for _agent_name, ws in agent_workspaces.items():
            if entities:
                flush_entities(ws, entities)
        # Stage 4: Persist to session history
        _persist_session_memory(session_id, facts, entities)

        # Stage 5: Consolidate into agent MEMORY.md
        for _agent_name, ws in agent_workspaces.items():
            await _consolidate_agent_memory(ws, model_config)
    except Exception as exc:
        logger.warning("distill_session_failed session=%s error=%s", session_id, exc)


def _persist_session_memory(session_id: str, facts: list[dict], entities: dict[str, str]) -> None:
    """Save extracted facts and entities to history/{session_id}/ for session-level records."""
    try:
        import app as _app
        session_dir = _app.HISTORY_DIR / session_id
        session_dir.mkdir(parents=True, exist_ok=True)

        if facts:
            facts_path = session_dir / "facts.json"
            facts_path.write_text(json.dumps(facts, ensure_ascii=False, indent=2))

        if entities:
            entities_path = session_dir / "entities.json"
            entities_path.write_text(json.dumps(entities, ensure_ascii=False, indent=2))
    except Exception as exc:
        logger.warning("persist_session_memory_failed session=%s: %s", session_id, exc)


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


async def _consolidate_agent_memory(workspace: str | Path, model_config: dict) -> None:
    """Consolidate daily facts + entities into a dated memory file, update MEMORY.md index.

    MEMORY.md is an INDEX — it points to memory files, not raw facts.
    The actual consolidated content goes to memory/consolidated-YYYY-MM-DD.md.

    Runs as part of post-session distillation. Silent on failure.
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
        if not result or result.strip() == "NONE" or len(result.strip()) < 10:
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
    """Add or update an entry in MEMORY.md's Session Memory section."""
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
            new_lines = []
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
        logger.warning("update_memory_index_failed: %s", exc)


async def safe_distill(
    session_id: str,
    messages: list[dict],
    agent_workspaces: dict[str, str],
    model_config: dict,
) -> None:
    """Semaphore + timeout + session dedup + structured logging."""
    if session_id in _distilling_sessions:
        return  # already in progress
    async with _distill_semaphore:
        _distilling_sessions.add(session_id)
        try:
            await asyncio.wait_for(
                distill_session(session_id, messages, agent_workspaces, model_config),
                timeout=60,
            )
        except asyncio.TimeoutError:
            logger.warning("distill_timeout session=%s", session_id)
        except Exception as exc:
            logger.warning("distill_failed session=%s error=%s", session_id, exc)
        finally:
            _distilling_sessions.discard(session_id)
            logger.info("distill_complete session=%s", session_id)
