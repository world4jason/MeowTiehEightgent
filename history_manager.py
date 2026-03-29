"""
history_manager.py — History truncation & summarization utilities for the chat backend.

Extracted from app.py to keep app.py manageable.
Includes compress_history() for Phase 2 history summarization.
"""
import json
import logging
import re
from datetime import datetime
from pathlib import Path
from typing import Callable, Awaitable

logger = logging.getLogger(__name__)

HISTORY_DIR = Path(__file__).parent / "history"

TRUNCATION_MARKER = "[... 較早對話已省略 ...]\n\n"

SUMMARIZATION_PROMPT = """請閱讀以下多人對話，先判斷對話性質，再據此摘要。

如果是任務導向對話（有明確目標、計畫、技術討論）：
  → 保留關鍵決策、結論、每位參與者的主要觀點、未解決問題

如果是自由閒聊：
  → 忠實摘要對話脈絡，保留每位參與者的語氣和立場

用自然敘述，控制在 500 字以內。請用對話中的主要語言撰寫摘要。

{overflow_text}"""

# Lazy references — set to None so unittest.mock.patch() can replace them.
# At call time, compress_history() falls back to importing from app if still None.
call_agent = None
load_models = None

# Cooldown after a failed summarization attempt (seconds)
_FAILURE_COOLDOWN_SECONDS = 300  # 5 minutes


def truncate_history(history_text: str, max_chars: int) -> str:
    """Sliding window: remove oldest [Agent]: blocks until under max_chars."""
    if len(history_text) <= max_chars:
        return history_text
    segments = re.split(r'(?=\n\[[\w\s\-]+\]: )', history_text)
    while segments and len("".join(segments)) > max_chars:
        segments.pop(0)
    truncated = "".join(segments)
    return TRUNCATION_MARKER + truncated.lstrip("\n")


def apply_sliding_window(messages: list, max_rounds: int = 30) -> list:
    """Keep only the most recent max_rounds messages; discard older ones."""
    if len(messages) <= max_rounds:
        return messages
    return messages[-max_rounds:]


# ── Per-session config ────────────────────────────────────────────────────────

def load_session_config(session_id: str) -> dict:
    """Load per-session config overrides from history/{session_id}/session_config.json."""
    path = HISTORY_DIR / session_id / "session_config.json"
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text())
    except Exception:
        return {}


# ── History formatting ────────────────────────────────────────────────────────

def _format_history_text(topic: str, summary_prefix: str, windowed_messages: list) -> str:
    """Format summary + windowed messages into history_text string."""
    lines = [f"Topic: {topic}"]
    if summary_prefix:
        lines.append(f"\n[對話摘要]: {summary_prefix}")
    for m in windowed_messages:
        if m.get("type") == "message":
            lines.append(f"\n[{m['agent']}]: {m['text']}")
    return "\n".join(lines) + "\n"


# ── History summarization (Phase 2) ──────────────────────────────────────────

async def compress_history(
    session_id: str,
    messages: list,
    *,
    window_size: int = 30,
    summary_model: str = "haiku",
    trigger_threshold: int = 5,
    on_progress: Callable[[str], Awaitable[None]] | None = None,
    agent_workspaces: dict[str, str] | None = None,
) -> tuple[str, list]:
    """Compress history: summarize overflow messages beyond the sliding window.

    Returns (summary_text, windowed_messages).
    - If all messages fit in window_size, returns ("", messages).
    - If overflow exists but summary_model is empty, returns ("", windowed).
    - Otherwise, calls the summarization model or reuses cached summary.
    """
    total = len(messages)

    # No overflow → return early
    if total <= window_size:
        return "", messages

    overflow = messages[:total - window_size]
    windowed = messages[total - window_size:]
    overflow_count = len(overflow)

    # Guard: empty summary_model → skip summarization
    if not summary_model:
        return "", windowed

    # Read cached summary.json
    session_dir = HISTORY_DIR / session_id
    summary_path = session_dir / "summary.json"
    cached = _load_summary_cache(summary_path)

    # Check failure cooldown
    if cached.get("failed"):
        failed_at_str = cached.get("failed_at", "")
        if failed_at_str:
            try:
                failed_at = datetime.fromisoformat(failed_at_str)
                elapsed = (datetime.now() - failed_at).total_seconds()
                if elapsed < _FAILURE_COOLDOWN_SECONDS:
                    return "", windowed
            except (ValueError, TypeError):
                pass

    # Check if cached summary is still fresh
    cached_covered = cached.get("covered_message_count", 0)
    new_overflow = overflow_count - cached_covered

    if cached.get("summary_text") and new_overflow < trigger_threshold:
        # Reuse cached summary, just update total_message_count
        cached["total_message_count"] = total
        _write_summary_cache(summary_path, cached)
        return cached["summary_text"], windowed

    # Pre-compaction heuristic extraction — save important facts before they get summarized
    if agent_workspaces:
        try:
            from core.agent_memory import heuristic_extract_facts, flush_facts_to_memory
            heuristic_facts = heuristic_extract_facts(overflow)
            if heuristic_facts:
                flush_facts_to_memory(heuristic_facts, agent_workspaces)
        except Exception as exc:
            logger.warning("Pre-compaction fact extraction failed: %s", exc)

    # Build overflow text for summarization
    overflow_text_lines = []
    for m in overflow:
        if m.get("type") == "message":
            overflow_text_lines.append(f"[{m.get('agent', '?')}]: {m.get('text', '')}")
    overflow_text = "\n".join(overflow_text_lines)

    # Include previous summary as context if exists
    prev_summary = cached.get("summary_text", "")
    if prev_summary:
        overflow_text = f"[先前摘要]: {prev_summary}\n\n[新增對話]:\n{overflow_text}"

    prompt = SUMMARIZATION_PROMPT.format(overflow_text=overflow_text)

    # Call summarization model
    # Import at call time to avoid circular imports.
    # Use globals() lookup so unittest.mock.patch("history_manager.call_agent", ...)
    # can intercept the call.
    try:
        _call_agent = globals().get("call_agent")
        _load_models = globals().get("load_models")
        if _call_agent is None or _load_models is None:
            from app import call_agent as _ca, load_models as _lm
            if _call_agent is None:
                _call_agent = _ca
            if _load_models is None:
                _load_models = _lm
        models = _load_models()
        model_cfg = models.get(summary_model, {})
        agent_dict = {
            "name": f"_summarizer_{summary_model}",
            "workspace": str(session_dir),
            **model_cfg,
        }
        if on_progress:
            await on_progress("正在壓縮對話歷史...")
        summary_text = await _call_agent(agent_dict, prompt)
    except Exception as exc:
        logger.warning("Summarization failed for session %s: %s", session_id, exc)
        # Write failure marker
        _write_summary_cache(summary_path, {
            "failed": True,
            "failed_at": datetime.now().isoformat(),
        })
        return "", windowed

    if on_progress:
        await on_progress("歷史壓縮完成")

    # Write successful summary cache
    _write_summary_cache(summary_path, {
        "summary_text": summary_text,
        "covered_message_count": overflow_count,
        "total_message_count": total,
        "updated_at": datetime.now().isoformat(),
    })

    return summary_text, windowed


def _load_summary_cache(path: Path) -> dict:
    """Load summary.json; return empty dict on missing/corrupt file."""
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text())
    except Exception:
        return {}


def _write_summary_cache(path: Path, data: dict) -> None:
    """Write summary.json, creating parent dirs as needed."""
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    except Exception as exc:
        logger.warning("Failed to write summary cache %s: %s", path, exc)
