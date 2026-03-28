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

def load_recent_facts(memory_dir: Path | str, max_chars: int = 500) -> str:
    """Load recent facts with importance-weighted selection + read-time dedup.

    Reads last 3 days of memory files, parses ``- [TYPE] text`` lines,
    sorts by importance DESC then recency DESC, accumulates to *max_chars*.
    """
    memory_dir = Path(memory_dir)
    if not memory_dir.exists():
        return ""

    today = datetime.now()
    entries: list[dict[str, Any]] = []
    seen_hashes: set[str] = set()

    for day_offset in range(3):
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
    except Exception as exc:
        logger.warning("distill_session_failed session=%s error=%s", session_id, exc)


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
