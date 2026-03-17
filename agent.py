import subprocess
from abc import ABC, abstractmethod


class Agent(ABC):
    def __init__(self, name: str, role: str):
        self.name = name
        self.role = role

    @abstractmethod
    def respond(self, history: str) -> str:
        pass


class ClaudeAgent(Agent):
    def respond(self, history: str) -> str:
        prompt = f"You are {self.role}.\n\n{history}"
        r = subprocess.run(
            ["claude", "--print", prompt],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
        )
        return r.stdout.strip()


class GeminiAgent(Agent):
    def respond(self, history: str) -> str:
        prompt = f"You are {self.role}.\n\n{history}"
        r = subprocess.run(
            ["gemini", "-p", prompt],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
        )
        return r.stdout.strip()
