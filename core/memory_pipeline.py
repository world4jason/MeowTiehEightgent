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

        # Stage 2: Global extraction (for Session Record — third-person)
        global_facts = await _llm_extract_facts(messages, model_config)
        global_entities = await _llm_extract_entities(messages, model_config)

        # Stage 2.5: Cross-validate global facts
        if global_facts:
            global_facts = await _cross_validate_facts(global_facts, messages, model_config)

        # Stage 3: Persist to Session Record (history/{session_id}/)
        _persist_session_memory(session_id, global_facts, global_entities)

        # Stage 4: Agent-scoped extraction + storage (first-person, per agent)
        for agent_name, ws in agent_workspaces.items():
            try:
                agent_facts = await _agent_scoped_extract(
                    agent_name, ws, messages, model_config,
                )
                if agent_facts:
                    flush_facts_to_memory(agent_facts, {agent_name: ws})
                else:
                    # Fallback: use global facts if agent-scoped extraction found nothing
                    if global_facts:
                        flush_facts_to_memory(global_facts, {agent_name: ws})
                if global_entities:
                    flush_entities(ws, global_entities)
            except Exception as exc:
                logger.warning("agent_memory_failed agent=%s: %s", agent_name, exc)
                # Fallback: store global facts
                if global_facts:
                    flush_facts_to_memory(global_facts, {agent_name: ws})

        # Stage 5: Consolidate into agent MEMORY.md
        for _agent_name, ws in agent_workspaces.items():
            await _consolidate_agent_memory(ws, model_config)
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
