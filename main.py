from agent import ClaudeAgent, GeminiAgent
from session import Session
from conversation import run


def main():
    print("=== Agent CLI Conversation ===\n")
    topic = input("Discussion topic: ").strip()
    if not topic:
        print("No topic provided. Exiting.")
        return

    agents = [
        ClaudeAgent(name="Claude", role="an ML researcher who proposes creative ideas"),
        GeminiAgent(name="Gemini", role="a skeptical reviewer who critiques ideas and adds alternatives"),
    ]

    session = Session(topic=topic, agents=agents)
    run(session)


if __name__ == "__main__":
    main()
