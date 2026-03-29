"""Session-level memory: triage, global fact/entity extraction, cross-validation, persistence.

Writes to ``history/{session_id}/``. All functions that call LLM use lazy
``import app`` to avoid circular imports.
"""
import json
import logging
import re
from typing import Any

from core.memory_utils import (
    _MAX_ENTITY_KEY_LEN,
    _MAX_ENTITY_VALUE_LEN,
    _sample_messages_text,
    _truncate_messages_text,
    _parse_llm_facts_response,
    _triage_heuristic,
)

logger = logging.getLogger(__name__)

# ── Triage ────────────────────────────────────────────────────────────────────


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


# ── Global fact extraction ────────────────────────────────────────────────────


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


# ── Global entity extraction ──────────────────────────────────────────────────


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


# ── Session persistence ───────────────────────────────────────────────────────


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
