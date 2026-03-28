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

# ── Constants ─────────────────────────────────────────────────────────────────

#: Maximum character length for extracted fact text.
_MAX_FACT_TEXT_LEN = 200

#: Maximum character length for extracted fact type labels.
_MAX_FACT_TYPE_LEN = 20

#: Maximum character length for entity keys.
_MAX_ENTITY_KEY_LEN = 100

#: Maximum character length for entity values.
_MAX_ENTITY_VALUE_LEN = 200

#: Minimum importance score for a fact to be stored.
_MIN_IMPORTANCE_THRESHOLD = 4

# ── Heuristic fact extraction (Phase 1) ──────────────────────────────────────

# Tightened regex patterns with importance scores
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

#: Keywords used for heuristic triage scoring when LLM is unavailable.
_TRIAGE_KEYWORDS: list[str] = [
    'decided', 'chose', 'bug', 'fix', 'todo', 'action', 'prefer',
    '決定', '確定', '原因', '修正',
]


def _format_fact_line(fact_type: str, fact_text: str) -> str:
    """Format a single fact as a markdown bullet line.

    Consistent format: ``- [TYPE] text``
    """
    return f"- [{fact_type}] {fact_text}"


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


# ── Memory injection helpers (Phase 1) ───────────────────────────────────────

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


# ── Post-session distillation (Phase 2a) ─────────────────────────────────────

_distill_semaphore = asyncio.Semaphore(3)
_distilling_sessions: set[str] = set()


def _flatten_message_texts(messages: list[dict[str, Any]]) -> list[str]:
    """Extract formatted text lines from messages of type ``"message"``.

    Args:
        messages: List of message dicts.

    Returns:
        List of ``[agent]: text`` formatted strings.
    """
    return [
        f"[{m.get('agent', '?')}]: {m.get('text', '')}"
        for m in messages
        if m.get("type") == "message"
    ]


def _sample_messages_text(messages: list[dict[str, Any]], max_chars: int = 3000) -> str:
    """Sample begin + mid + end of message texts (1/3 budget each).

    Used for triage scoring where a representative sample suffices.

    Args:
        messages: List of message dicts.
        max_chars: Maximum total character budget.

    Returns:
        Sampled text string.
    """
    full = "\n".join(_flatten_message_texts(messages))
    if len(full) <= max_chars:
        return full
    third = max_chars // 3
    mid_start = len(full) // 2 - third // 2
    mid_end = len(full) // 2 + third // 2
    return full[:third] + "\n...\n" + full[mid_start:mid_end] + "\n...\n" + full[-third:]


def _truncate_messages_text(messages: list[dict[str, Any]], max_chars: int = 8000) -> str:
    """Flatten messages to text, truncated to max_chars.

    Args:
        messages: List of message dicts.
        max_chars: Maximum character length of result.

    Returns:
        Concatenated message text, possibly truncated.
    """
    full = "\n".join(_flatten_message_texts(messages))
    if len(full) > max_chars:
        return full[:max_chars]
    return full


async def _triage_session(messages: list[dict[str, Any]], model_config: dict[str, Any]) -> int:
    """Score session 1-10 for durable knowledge content.

    Attempts LLM scoring first; falls back to keyword-based heuristic
    if the LLM call fails or returns unparseable output.

    Args:
        messages: Conversation messages to evaluate.
        model_config: Model configuration for LLM calls.

    Returns:
        Integer score in range [1, 10].
    """
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

    # Heuristic fallback: keyword scoring + message count
    return _triage_heuristic(messages)


def _triage_heuristic(messages: list[dict[str, Any]]) -> int:
    """Keyword-based heuristic scoring when LLM is unavailable.

    Scores baseline 3, adds +1 per matched keyword, +1 if > 20 messages.
    Clamped to [1, 10].

    Args:
        messages: Conversation messages.

    Returns:
        Integer score in range [1, 10].
    """
    text = _truncate_messages_text(messages, max_chars=5000)
    score = 3  # baseline
    text_lower = text.lower()
    for kw in _TRIAGE_KEYWORDS:
        if kw.lower() in text_lower:
            score += 1
    msg_count = sum(1 for m in messages if m.get("type") == "message")
    if msg_count > 20:
        score += 1
    return min(10, score)


def _parse_llm_facts_response(raw: str | None) -> list[dict[str, Any]]:
    """Parse and validate an LLM fact extraction response.

    Extracts a JSON array, validates structure, filters by importance.
    Returns empty list on any parsing failure.
    """
    if not raw:
        return []
    json_match = re.search(r'\[.*\]', raw, re.DOTALL)
    if not json_match:
        return []
    try:
        parsed = json.loads(json_match.group(0))
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    valid: list[dict[str, Any]] = []
    for item in parsed[:20]:
        if not isinstance(item, dict):
            continue
        if "type" not in item or "text" not in item:
            continue
        try:
            importance = int(item.get("importance", 5))
        except (ValueError, TypeError):
            importance = 5
        if importance < _MIN_IMPORTANCE_THRESHOLD:
            continue
        valid.append({
            "type": str(item["type"])[:_MAX_FACT_TYPE_LEN],
            "text": str(item["text"])[:_MAX_FACT_TEXT_LEN],
            "importance": importance,
            "agent": "llm-distill",
        })
    return valid


async def _llm_extract_facts(
    messages: list[dict[str, Any]], model_config: dict[str, Any]
) -> list[dict[str, Any]]:
    """LLM-based fact extraction with multi-round support.

    Round 1: Initial extraction from conversation.
    Round 2+: Supplementary extraction focusing on missed facts
    (implicit decisions, cross-turn conclusions, negations).

    Number of rounds controlled by config ``extraction_rounds`` (default 1, max 3).

    Args:
        messages: Conversation messages.
        model_config: Model configuration for LLM calls.

    Returns:
        List of validated fact dicts, or ``[]`` on failure.
    """
    import app as _app

    text = _truncate_messages_text(messages, max_chars=8000)

    # Determine extraction rounds from config
    try:
        cfg = _app.load_config()
        rounds = max(1, min(3, int(cfg.get("extraction_rounds", 1))))
    except Exception:
        rounds = 1

    all_facts: list[dict[str, Any]] = []

    try:
        # Round 1: Initial extraction
        round1_prompt = (
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

        round1_facts = _parse_llm_facts_response(
            await _app.call_agent(model_config, round1_prompt)
        )
        all_facts.extend(round1_facts)
        logger.info("extract_round=1 facts=%d", len(round1_facts))

        # Round 2+: Supplementary extraction (look for what was missed)
        for round_num in range(2, rounds + 1):
            if not all_facts:
                break  # nothing found in round 1, no point continuing
            existing_summary = "\n".join(
                f"- [{f['type']}] {f['text']}" for f in all_facts
            )
            supplement_prompt = (
                "A previous extraction found these facts from the conversation:\n\n"
                f"{existing_summary}\n\n"
                "Review the conversation again. Extract ONLY facts that were MISSED "
                "in the previous extraction. Focus on:\n"
                "- Implicit decisions (not stated as 'we decided' but implied by actions)\n"
                "- Cross-turn conclusions (problem in one turn, solution in another)\n"
                "- Negations and constraints ('do NOT', 'never', 'avoid')\n"
                "- Relationships between people/tools/concepts\n"
                "- Configuration details mentioned in passing\n\n"
                "Return a JSON array of NEW facts only. If nothing was missed, return [].\n\n"
                f"Conversation:\n{text}"
            )
            new_facts = _parse_llm_facts_response(
                await _app.call_agent(model_config, supplement_prompt)
            )
            # Dedup against existing facts
            existing_texts = {f["text"].lower() for f in all_facts}
            genuinely_new = [
                f for f in new_facts if f["text"].lower() not in existing_texts
            ]
            all_facts.extend(genuinely_new)
            logger.info("extract_round=%d new=%d dedup_kept=%d", round_num, len(new_facts), len(genuinely_new))

        return all_facts[:20]  # cap total
    except Exception as exc:
        logger.warning("llm_extract_facts_failed: %s", exc)
        return []


# ── Entity extraction (Phase 2b) ─────────────────────────────────────────────

async def _llm_extract_entities(
    messages: list[dict[str, Any]], model_config: dict[str, Any]
) -> dict[str, str]:
    """LLM entity extraction. Truncates input to 8000 chars.

    Parses the LLM response as a JSON object and converts all values to
    truncated strings.

    Args:
        messages: Conversation messages.
        model_config: Model configuration for LLM calls.

    Returns:
        Dict of ``{entity_name: description}``, or ``{}`` on failure.
    """
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
        # Validate: all values converted to truncated strings
        validated: dict[str, str] = {}
        for k, v in parsed.items():
            validated[str(k)[:_MAX_ENTITY_KEY_LEN]] = str(v)[:_MAX_ENTITY_VALUE_LEN]
        return validated
    except Exception as exc:
        logger.warning("llm_extract_entities_failed: %s", exc)
        return {}


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


# ── Cross-validation (anti-hallucination) ─────────────────────────────────────

_CROSS_VALIDATE_PROMPT = """\
You are a fact-checker. Verify each claimed fact against the actual conversation.

Claimed facts:
{facts_json}

Actual conversation:
{conversation}

For each fact, respond with a JSON array:
[{{"index": 0, "valid": true/false, "reason": "..."}}]

Rules:
- Mark "valid": true ONLY if the fact is directly supported by the conversation text
- Mark "valid": false if the fact is hallucinated, exaggerated, or not supported
- Be strict: if the conversation says "considering X" but the fact says "decided X", that is false
- Negation check: if the conversation says "NOT X" but the fact says "X", that is false
- If unsure, mark false (err on the side of caution)

Respond with ONLY the JSON array."""


async def _cross_validate_facts(
    facts: list[dict[str, Any]],
    messages: list[dict[str, Any]],
    model_config: dict[str, Any],
) -> list[dict[str, Any]]:
    """Use LLM to verify extracted facts against the actual conversation.

    Removes facts the validator marks as hallucinated or unsupported.
    Returns the filtered list. On any failure, returns the original list unchanged.
    """
    if not facts:
        return facts
    try:
        import app as _app

        facts_json = json.dumps(
            [{"index": i, "type": f["type"], "text": f["text"]} for i, f in enumerate(facts)],
            ensure_ascii=False,
        )
        conversation = _truncate_messages_text(messages, max_chars=6000)

        prompt = _CROSS_VALIDATE_PROMPT.format(
            facts_json=facts_json,
            conversation=conversation,
        )

        # Use a different model if available for true cross-validation
        # Fall back to same model if only one is configured
        cfg = _app.load_config()
        validator_model_key = cfg.get("summarization_model", "")  # use cheap model for validation
        models = _app.load_models()
        validator_cfg = models.get(validator_model_key, {})

        if validator_cfg and validator_cfg != model_config:
            validator_agent = {
                "name": f"_validator_{validator_model_key}",
                "workspace": model_config.get("workspace", "."),
                **validator_cfg,
            }
        else:
            # Same model fallback — still useful for self-consistency check
            validator_agent = model_config

        result = await _app.call_agent(validator_agent, prompt)

        # Parse validation results
        json_match = re.search(r'\[.*\]', result or "", re.DOTALL)
        if not json_match:
            return facts  # can't parse → keep all

        validations = json.loads(json_match.group(0))
        if not isinstance(validations, list):
            return facts

        # Build set of invalid indices
        invalid_indices: set[int] = set()
        for v in validations:
            if isinstance(v, dict) and v.get("valid") is False:
                idx = v.get("index")
                if isinstance(idx, int) and 0 <= idx < len(facts):
                    invalid_indices.add(idx)
                    logger.info(
                        "fact_rejected index=%d type=%s reason=%s",
                        idx, facts[idx].get("type"), v.get("reason", ""),
                    )

        if invalid_indices:
            validated = [f for i, f in enumerate(facts) if i not in invalid_indices]
            logger.info(
                "cross_validation_complete total=%d rejected=%d kept=%d",
                len(facts), len(invalid_indices), len(validated),
            )
            return validated

        return facts
    except Exception as exc:
        logger.warning("cross_validate_failed: %s — keeping all facts", exc)
        return facts  # on failure, keep everything (safe fallback)


# ── Distillation pipeline (Phase 2a + 2b) ────────────────────────────────────

async def distill_session(
    session_id: str,
    messages: list[dict[str, Any]],
    agent_workspaces: dict[str, str],
    model_config: dict[str, Any],
) -> None:
    """Post-session fact distillation. Runs as background task.

    Pipeline: triage -> extract facts + entities -> store -> consolidate.
    All wrapped in try/except — failures are silent.

    Args:
        session_id: Unique session identifier.
        messages: Conversation messages from the session.
        agent_workspaces: Mapping of agent name to workspace path.
        model_config: Model configuration for LLM calls.
    """
    try:
        # Stage 1: Triage
        score = await _triage_session(messages, model_config)
        logger.info("distill_triage session=%s score=%d", session_id, score)
        if score < _MIN_IMPORTANCE_THRESHOLD:
            return

        # Stage 2: Extract facts + entities
        facts = await _llm_extract_facts(messages, model_config)
        entities = await _llm_extract_entities(messages, model_config)

        # Stage 2.5: Cross-validate facts to reduce hallucination
        if facts:
            facts = await _cross_validate_facts(facts, messages, model_config)

        # Stage 3: Store facts + entities to agent workspaces
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
        logger.warning("distill_session_failed session=%s: %s", session_id, exc)


def _persist_session_memory(
    session_id: str, facts: list[dict[str, Any]], entities: dict[str, str]
) -> None:
    """Save extracted facts and entities to history/{session_id}/ for session-level records.

    Args:
        session_id: Unique session identifier.
        facts: Extracted facts to persist.
        entities: Extracted entities to persist.
    """
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

#: Minimum length of LLM consolidation output to be considered valid.
_MIN_CONSOLIDATION_LEN = 10


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


async def safe_distill(
    session_id: str,
    messages: list[dict[str, Any]],
    agent_workspaces: dict[str, str],
    model_config: dict[str, Any],
) -> None:
    """Entry point for post-session distillation with safety guards.

    Guards: semaphore (max 3 concurrent), timeout (60s), session dedup.

    Args:
        session_id: Unique session identifier.
        messages: Conversation messages from the session.
        agent_workspaces: Mapping of agent name to workspace path.
        model_config: Model configuration for LLM calls.
    """
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
            logger.warning("distill_failed session=%s: %s", session_id, exc)
        finally:
            _distilling_sessions.discard(session_id)
            logger.info("distill_complete session=%s", session_id)
