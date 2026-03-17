import itertools
from session import Session


def run(session: Session):
    history = f"Topic:\n{session.topic}\n"
    turn_count = 0
    agent_cycle = itertools.cycle(session.agents)

    print(f"\n{'='*60}")
    print(f"Session started — {len(session.agents)} agents")
    print(f"Topic: {session.topic}")
    print(f"{'='*60}\n")

    while True:
        agent = next(agent_cycle)
        print(f"[{agent.name} is thinking...]\n")

        response = agent.respond(history)
        print(f"=== {agent.name} ===\n{response}\n")
        history += f"\n[{agent.name}]: {response}\n"

        turn_count += 1
        if session.max_rounds and turn_count >= session.max_rounds * len(session.agents):
            print("Max rounds reached.")
            break

        try:
            user_input = input("Enter 繼續 / 輸入插嘴 / q 結束: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nBye.")
            break

        if user_input.lower() == "q":
            print("Session ended.")
            break
        elif user_input:
            history += f"\n[Human]: {user_input}\n"
            # Reset cycle so next turn starts from first agent
            agent_cycle = itertools.cycle(session.agents)
            print()
