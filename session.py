from dataclasses import dataclass, field
from agent import Agent


@dataclass
class Session:
    topic: str
    agents: list[Agent]
    max_rounds: int = 0  # 0 = unlimited
