"""
history_manager.py — History truncation utilities for the chat backend.

Extracted from app.py to keep app.py manageable and to prepare for
Task 4 which will add compress_history().
"""
import logging
import re

logger = logging.getLogger(__name__)

TRUNCATION_MARKER = "[... 較早對話已省略 ...]\n\n"

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
