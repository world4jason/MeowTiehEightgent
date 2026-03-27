"""Subprocess error hierarchy and token usage types."""


class SubprocessError(Exception):
    """Base class for all CLI subprocess failures."""
    def __init__(self, agent: str, partial_output: str = "", stderr_output: str = "", **_):
        super().__init__(agent)
        self.agent = agent
        self.partial_output = partial_output
        self.stderr_output = stderr_output


class SubprocessStartupError(SubprocessError):
    """Command not found, permission denied, or no output within startup_timeout."""
    def __init__(self, agent: str, cause: str = "", **_):
        super().__init__(agent, partial_output="", stderr_output="")
        self.cause = cause


class SubprocessTimeoutError(SubprocessError):
    """Idle timeout: no new chunk within idle_timeout_seconds."""
    def __init__(self, agent: str, partial_output: str, stderr_output: str,
                 timeout_seconds: float, **_):
        super().__init__(agent, partial_output, stderr_output)
        self.timeout_seconds = timeout_seconds


class SubprocessCrashError(SubprocessError):
    """Process exited non-zero or raised an unexpected exception."""
    def __init__(self, agent: str, partial_output: str = "", stderr_output: str = "",
                 exit_code: int | None = None, cause: str = "", **_):
        super().__init__(agent, partial_output, stderr_output)
        self.exit_code = exit_code
        self.cause = cause


class TokenUsage:
    """Sentinel yielded at end of a JSON-mode CLI stream with per-turn token counts."""
    __slots__ = ("input_tokens", "output_tokens", "cached_tokens")

    def __init__(self, input_tokens: int = 0, output_tokens: int = 0, cached_tokens: int = 0):
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens
        self.cached_tokens = cached_tokens
