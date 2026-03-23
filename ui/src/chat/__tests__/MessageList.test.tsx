import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "../../context/ThemeContext";
import { MessageList } from "../MessageList";
import type { ChatMessage } from "../types";

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe("MessageList", () => {
  it("renders agent name with color", () => {
    const msgs: ChatMessage[] = [
      { id: "1", role: "agent", agentName: "Claude", agentColor: "#a78bfa", content: "hi", timestamp: 0 },
    ];
    renderWithTheme(<MessageList messages={msgs} />);
    expect(screen.getByText("Claude")).toBeInTheDocument();
  });

  it("renders user messages", () => {
    const msgs: ChatMessage[] = [
      { id: "1", role: "user", content: "hello there", timestamp: 0 },
    ];
    renderWithTheme(<MessageList messages={msgs} />);
    expect(screen.getByText("hello there")).toBeInTheDocument();
  });

  // ─── P0-1: Markdown rendering ─────────────────────────────
  it("renders bold markdown as <strong>", () => {
    const msgs: ChatMessage[] = [
      { id: "1", role: "agent", agentName: "Claude", content: "this is **bold** text", timestamp: 0 },
    ];
    renderWithTheme(<MessageList messages={msgs} />);
    const strong = screen.getByText("bold");
    expect(strong.tagName).toBe("STRONG");
  });

  it("renders markdown links as <a>", () => {
    const msgs: ChatMessage[] = [
      { id: "1", role: "agent", agentName: "Claude", content: "click [here](https://example.com)", timestamp: 0 },
    ];
    renderWithTheme(<MessageList messages={msgs} />);
    const link = screen.getByText("here");
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "https://example.com");
  });

  it("renders code blocks with <pre><code>", () => {
    const msgs: ChatMessage[] = [
      { id: "1", role: "agent", agentName: "Claude", content: "```js\nconsole.log('hi')\n```", timestamp: 0 },
    ];
    renderWithTheme(<MessageList messages={msgs} />);
    expect(screen.getByText("console.log('hi')")).toBeInTheDocument();
  });

  it("renders markdown lists", () => {
    const msgs: ChatMessage[] = [
      { id: "1", role: "agent", agentName: "Claude", content: "- item one\n- item two", timestamp: 0 },
    ];
    renderWithTheme(<MessageList messages={msgs} />);
    expect(screen.getByText("item one")).toBeInTheDocument();
    expect(screen.getByText("item two")).toBeInTheDocument();
  });

  it("still shows streaming indicator", () => {
    const msgs: ChatMessage[] = [
      { id: "1", role: "agent", agentName: "Claude", content: "thinking...", timestamp: 0, streaming: true },
    ];
    renderWithTheme(<MessageList messages={msgs} />);
    expect(screen.getByText("▌")).toBeInTheDocument();
  });

  it("renders plain text for user messages (no markdown)", () => {
    const msgs: ChatMessage[] = [
      { id: "1", role: "user", content: "**not bold** for users", timestamp: 0 },
    ];
    renderWithTheme(<MessageList messages={msgs} />);
    // User messages should show as-is, not rendered as markdown
    expect(screen.getByText("**not bold** for users")).toBeInTheDocument();
  });
});
