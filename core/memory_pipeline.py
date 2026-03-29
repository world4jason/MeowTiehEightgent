"""Orchestration: distill_session and safe_distill.

Imports from both session_memory and agent_memory — this module exists
specifically to avoid cross-imports between those two.
"""
import asyncio
import logging
from typing import Any

from core.memory_utils import _MIN_IMPORTANCE_THRESHOLD
from core.session_memory import (
    _triage_session,
    _llm_extract_facts,
    _llm_extract_entities,
    _cross_validate_facts,
    _persist_session_memory,
)
from core.agent_memory import (
    flush_facts_to_memory,
    flush_entities,
    _agent_scoped_extract,
    _consolidate_agent_memory,
)

logger = logging.getLogger(__name__)

_distill_semaphore = asyncio.Semaphore(3)
_distilling_sessions: set[str] = set()


async def _stage_triage(
    session_id: str, messages: list[dict[str, Any]], model_config: dict[str, Any]
) -> int:
    """Stage 1: Score session worth. Returns score (1-10). Skip if < threshold."""
    score = await _triage_session(messages, model_config)
    logger.info("distill_triage session=%s score=%d", session_id, score)
    return score


async def _stage_global_extract(
    messages: list[dict[str, Any]], model_config: dict[str, Any]
) -> tuple[list[dict[str, Any]], dict[str, str]]:
    """Stage 2: Global fact + entity extraction (third-person, for Session Record)."""
    facts = await _llm_extract_facts(messages, model_config)
    entities = await _llm_extract_entities(messages, model_config)
    if facts:
        facts = await _cross_validate_facts(facts, messages, model_config)
    return facts, entities


def _stage_persist_session(
    session_id: str, facts: list[dict[str, Any]], entities: dict[str, str]
) -> None:
    """Stage 3: Write global facts + entities to Session Record."""
    _persist_session_memory(session_id, facts, entities)


async def _stage_agent_memory(
    agent_name: str,
    workspace: str,
    messages: list[dict[str, Any]],
    model_config: dict[str, Any],
    global_facts: list[dict[str, Any]],
    global_entities: dict[str, str],
) -> None:
    """Stage 4: Per-agent first-person extraction + storage.

    Tries agent-scoped extraction first. Falls back to global facts
    if scoped extraction returns nothing or fails.
    """
    try:
        agent_facts = await _agent_scoped_extract(
            agent_name, workspace, messages, model_config,
        )
        if agent_facts:
            flush_facts_to_memory(agent_facts, {agent_name: workspace})
        elif global_facts:
            flush_facts_to_memory(global_facts, {agent_name: workspace})
        if global_entities:
            flush_entities(workspace, global_entities)
    except Exception as exc:
        logger.warning("agent_memory_failed agent=%s: %s", agent_name, exc)
        if global_facts:
            flush_facts_to_memory(global_facts, {agent_name: workspace})


async def _stage_consolidate(
    agent_workspaces: dict[str, str], model_config: dict[str, Any]
) -> None:
    """Stage 5: Consolidate daily facts into MEMORY.md for each agent."""
    for _agent_name, ws in agent_workspaces.items():
        await _consolidate_agent_memory(ws, model_config)


async def distill_session(
    session_id: str,
    messages: list[dict[str, Any]],
    agent_workspaces: dict[str, str],
    model_config: dict[str, Any],
) -> None:
    """Post-session distillation pipeline. Runs as background task.

    5-stage pipeline:
      1. Triage — score session, skip if low value
      2. Global extract — facts + entities (third-person)
      3. Persist session — write to history/{session_id}/
      4. Agent memory — per-agent first-person extraction + storage
      5. Consolidate — update each agent's MEMORY.md

    All stages wrapped in try/except — failures are silent.
    """
    try:
        # Stage 1
        score = await _stage_triage(session_id, messages, model_config)
        if score < _MIN_IMPORTANCE_THRESHOLD:
            return

        # Stage 2
        global_facts, global_entities = await _stage_global_extract(messages, model_config)

        # Stage 3
        _stage_persist_session(session_id, global_facts, global_entities)

        # Stage 4
        for agent_name, ws in agent_workspaces.items():
            await _stage_agent_memory(
                agent_name, ws, messages, model_config,
                global_facts, global_entities,
            )

        # Stage 5
        await _stage_consolidate(agent_workspaces, model_config)
    except Exception as exc:
        logger.warning("distill_session_failed session=%s: %s", session_id, exc)


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
