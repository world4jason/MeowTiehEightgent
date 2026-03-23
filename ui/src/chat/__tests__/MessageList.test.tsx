import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "../../context/ThemeContext";
import { MessageList } from "../MessageList";
import { ImageLightbox } from "../ImageLightbox";
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

  it("renders thinking animation for thinking messages", () => {
    const msgs: ChatMessage[] = [
      { id: "1", role: "agent", agentName: "Claude", agentColor: "#a78bfa", content: "", timestamp: 0, thinking: true },
    ];
    renderWithTheme(<MessageList messages={msgs} />);
    expect(screen.getByText("思考中")).toBeInTheDocument();
  });

  // ─── P1-10: Message Timestamps ────────────────────────────
  it("displays timestamp for agent messages", () => {
    const ts = new Date(2026, 2, 23, 14, 32).getTime();
    const msgs: ChatMessage[] = [
      { id: "1", role: "agent", agentName: "Claude", content: "hello", timestamp: ts },
    ];
    renderWithTheme(<MessageList messages={msgs} />);
    expect(screen.getByText("14:32")).toBeInTheDocument();
  });

  it("does not show timestamp when timestamp is 0", () => {
    const msgs: ChatMessage[] = [
      { id: "1", role: "agent", agentName: "Claude", content: "hello", timestamp: 0 },
    ];
    renderWithTheme(<MessageList messages={msgs} />);
    // Should not show "00:00" as a timestamp label when ts is falsy
    expect(screen.queryByText("00:00")).not.toBeInTheDocument();
  });
});

// ─── P1-9: ImageLightbox ──────────────────────────────────
describe("ImageLightbox", () => {
  it("renders the image with the given src", () => {
    const onClose = () => {};
    render(<ImageLightbox src="https://example.com/image.png" alt="test image" onClose={onClose} />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "https://example.com/image.png");
    expect(img).toHaveAttribute("alt", "test image");
  });

  it("calls onClose when Escape key is pressed", () => {
    const onClose = vi.fn();
    render(<ImageLightbox src="https://example.com/image.png" onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when overlay (outside image) is clicked", () => {
    const onClose = vi.fn();
    const { container } = render(<ImageLightbox src="https://example.com/image.png" onClose={onClose} />);
    // Click the overlay div (the fixed container)
    const overlay = container.firstChild as HTMLElement;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does NOT call onClose when clicking the image itself", () => {
    const onClose = vi.fn();
    render(<ImageLightbox src="https://example.com/image.png" alt="lightbox image" onClose={onClose} />);
    const img = screen.getByRole("img");
    fireEvent.click(img);
    expect(onClose).not.toHaveBeenCalled();
  });
});
