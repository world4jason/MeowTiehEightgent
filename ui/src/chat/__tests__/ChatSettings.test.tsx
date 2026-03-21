import { render, screen } from "@testing-library/react";
import { ChatSettings } from "../ChatSettings";

const chatAgents = [
  { name: "Claude", emoji: "🟣", color: "#a78bfa", model: "claude", enabled: true, source: "chat" as const },
  { name: "Gemini", emoji: "🟢", color: "#34d399", model: "gemini", enabled: true, source: "chat" as const },
];

const coworkAgents = [
  { name: "DevAgent", emoji: "🤖", color: "#888", model: "claude_local", enabled: true, source: "cowork" as const },
];

it("renders the Agents heading", () => {
  render(<ChatSettings chatAgents={chatAgents} coworkAgents={[]} coworkOnline={false} />);
  expect(screen.getByText("Agents")).toBeInTheDocument();
});

it("renders chat agent rows with Chat badge", () => {
  render(<ChatSettings chatAgents={chatAgents} coworkAgents={[]} coworkOnline={false} />);
  expect(screen.getByText("Claude")).toBeInTheDocument();
  expect(screen.getByText("Gemini")).toBeInTheDocument();
  // Chat source badges
  expect(screen.getAllByText("Chat")).toHaveLength(2);
});

it("renders cowork agent rows with Cowork badge when online", () => {
  render(<ChatSettings chatAgents={[]} coworkAgents={coworkAgents} coworkOnline={true} />);
  expect(screen.getByText("DevAgent")).toBeInTheDocument();
  expect(screen.getByText("Cowork")).toBeInTheDocument();
});

it("shows cowork offline message when coworkOnline=false and no cowork agents", () => {
  render(<ChatSettings chatAgents={chatAgents} coworkAgents={[]} coworkOnline={false} />);
  expect(screen.getByText(/cowork offline/i)).toBeInTheDocument();
});

it("shows enabled/disabled status for agents", () => {
  const agents = [
    { name: "Active", emoji: "✅", color: "#0f0", model: "claude", enabled: true, source: "chat" as const },
    { name: "Inactive", emoji: "❌", color: "#f00", model: "gemini", enabled: false, source: "chat" as const },
  ];
  render(<ChatSettings chatAgents={agents} coworkAgents={[]} coworkOnline={false} />);
  expect(screen.getByText("Active")).toBeInTheDocument();
  expect(screen.getByText("Inactive")).toBeInTheDocument();
});
