"""Filename validation and path traversal prevention."""
import os
import re

PROTECTED_FILENAMES: frozenset[str] = frozenset({
    "guide.md",
    "config.json",
    ".env",
    "requirements.txt",
})

_SAFE_FILENAME_RE = re.compile(r'^[\w\-. ]+$')
_MAX_FILENAME_LENGTH = 255


def validate_filename(filename: str, *, allow_protected: bool = False) -> None:
    """Raise ValueError if filename is unsafe or protected."""
    if not filename:
        raise ValueError("Filename cannot be empty")
    if len(filename) > _MAX_FILENAME_LENGTH:
        raise ValueError(f"Filename too long: {len(filename)} chars")
    if "/" in filename or "\\" in filename:
        raise ValueError(f"Filename must not contain path separators: {filename!r}")
    if ".." in filename:
        raise ValueError(f"Filename must not contain '..': {filename!r}")
    if not _SAFE_FILENAME_RE.match(filename):
        raise ValueError(f"Filename contains invalid characters: {filename!r}")
    if not allow_protected and filename in PROTECTED_FILENAMES:
        raise ValueError(f"Filename is protected and cannot be written by agents: {filename!r}")


def safe_workspace_path(workspace_dir: str, filename: str) -> str:
    """Return safe full path; raise ValueError if it resolves outside workspace_dir."""
    full_path = os.path.realpath(os.path.join(workspace_dir, filename))
    workspace_real = os.path.realpath(workspace_dir)
    if not full_path.startswith(workspace_real + os.sep) and full_path != workspace_real:
        raise ValueError(f"Path traversal detected: {filename!r} resolves outside workspace")
    return full_path
