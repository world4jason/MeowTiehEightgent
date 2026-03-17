"""
conversation_engine.py — Multi-agent turn scheduling

Handles:
- Round-robin base order
- @ mention: jump an agent to front, drop rest of current round,
  next cycle starts with that agent
- Probabilistic silence: N > 2 agents may randomly pass a turn;
  each consecutive pass increases speaking probability next time
"""
import random
import re


class ConversationEngine:
    """
    Manages who speaks next in a multi-agent conversation.

    Usage:
        engine = ConversationEngine(agents)
        agent  = engine.next_speaker()          # normal turn
        target = engine.on_mention("Claude")    # @Claude jumps queue
        engine.on_human()                       # human spoke, reset order
    """

    def __init__(self, agents: list[dict], *, silence: bool = False):
        """
        agents  — list of agent dicts (must have "name" key)
        silence — enable probabilistic silence (agents may randomly pass).
                  Default False (everyone always speaks).
        """
        if not agents:
            raise ValueError("At least one agent required")
        self.agents = agents
        self.silence = silence
        self._base_order: list[dict] = list(agents)
        self._queue: list[dict] = list(agents)      # remaining this cycle
        self._next_order: list[dict] | None = None  # one-time override for next cycle
        self._pass_counts: dict[str, int] = {a["name"]: 0 for a in agents}
        # spoke_alone: how many consecutive rounds this agent was the ONLY speaker
        self._spoke_alone: dict[str, int] = {a["name"]: 0 for a in agents}
        self._speakers_this_cycle: set[str] = set()   # who actually spoke this cycle

    # ── Public API ──────────────────────────────────────────────────────────────

    def next_speaker(self) -> dict:
        """
        Return the next agent to speak.

        Applies probabilistic silence: agents may pass their turn.
        Each consecutive pass halves the pass probability so no agent
        stays silent indefinitely.  With ≤ 2 agents nobody ever passes.
        """
        n = len(self.agents)

        for _ in range(n):
            agent = self._pop_from_queue()
            if not self._should_pass(agent, n):
                self._pass_counts[agent["name"]] = 0
                self._speakers_this_cycle.add(agent["name"])
                return agent
            self._pass_counts[agent["name"]] += 1

        # Everyone passed — force the first agent in base order (safety net)
        agent = self._base_order[0]
        self._pass_counts[agent["name"]] = 0
        self._speakers_this_cycle.add(agent["name"])
        self._queue = self._base_order[1:]
        return agent

    def on_mention(self, agent_name: str) -> dict | None:
        """
        Handle @AgentName typed by the human.

        - Drops the rest of the current round.
        - Returns the target agent (caller should use it as the immediate speaker).
        - Sets the *next* cycle order to [target] + rest_in_base_order.
        - Returns None if no agent with that name exists.

        Example (base order A B C D E F, human @C mid-round):
          immediate speaker  → C
          next cycle order   → C A B D E F
          cycle after that   → A B C D E F  (base)
        """
        target = next(
            (a for a in self.agents if a["name"].lower() == agent_name.lower()),
            None,
        )
        if target is None:
            return None

        others = [a for a in self._base_order if a["name"] != target["name"]]
        self._queue = []                          # drop rest of current round
        self._next_order = [target] + others      # one-time reorder
        self._pass_counts = {a["name"]: 0 for a in self.agents}
        self._speakers_this_cycle = set()
        return target

    def on_human(self) -> None:
        """
        Human spoke without @: end the current round and resume
        from base order on the next cycle.
        """
        self._queue = []
        self._next_order = None
        self._pass_counts = {a["name"]: 0 for a in self.agents}
        self._speakers_this_cycle = set()

    @staticmethod
    def extract_mention(text: str) -> str | None:
        """
        Extract the first @AgentName from a human message.
        Returns the name string or None.
        """
        m = re.search(r"@(\w+)", text)
        return m.group(1) if m else None

    # ── Internal helpers ─────────────────────────────────────────────────────────

    def _pop_from_queue(self) -> dict:
        if not self._queue:
            # Cycle just ended — update spoke_alone penalties
            self._end_cycle()
            order = self._next_order if self._next_order is not None else self._base_order
            self._queue = list(order)
            self._next_order = None
        return self._queue.pop(0)

    def _end_cycle(self) -> None:
        """Called when a cycle completes. Penalise agents that spoke alone."""
        sole_speaker = (
            len(self._speakers_this_cycle) == 1 and len(self.agents) > 1
        )
        for a in self.agents:
            name = a["name"]
            if sole_speaker and name in self._speakers_this_cycle:
                self._spoke_alone[name] += 1
            else:
                self._spoke_alone[name] = 0
        self._speakers_this_cycle = set()

    def _should_pass(self, agent: dict, total: int) -> bool:
        """
        Probabilistic silence rules:
          - 1–2 agents : never pass
          - 3 agents   : ~15 % base pass chance
          - N agents   : up to ~35 % base pass chance (grows with N)

        Modifiers:
          - Each consecutive pass halves pass probability (agent speaks eventually).
          - Each round the agent spoke alone adds +20 % pass penalty (max +60 %),
            so monopolisers are quieter next time.
        """
        if not self.silence or total <= 2:
            return False
        base = min(0.35, (total - 2) / total * 0.5)
        passes = self._pass_counts.get(agent["name"], 0)
        alone  = self._spoke_alone.get(agent["name"], 0)
        # Consecutive passes → easier to speak; spoke alone → harder to speak
        prob = base * (0.5 ** passes) + min(0.60, alone * 0.20)
        return random.random() < min(prob, 0.85)   # cap at 85 % so agent can still speak
