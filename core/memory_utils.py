"""Shared pure-function utilities for memory extraction and formatting.

No IO, no LLM calls, no side effects. CPU-only helpers used by both
session_memory and agent_memory modules.
"""
import json
import re
from typing import Any

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

#: Minimum length of LLM consolidation output to be considered valid.
_MIN_CONSOLIDATION_LEN = 10

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
