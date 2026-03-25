import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import type { ChildProcess } from "node:child_process";

// ── Mock child_process at ESM level ─────────────────────────────────────────

const mockSpawn = vi.fn();

vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

// Import after mock is set up
const { streamCliAgent, streamApiAgent, AgentStreamError } = await import(
  "./stream-agent.js"
);
type TokenUsage = import("./stream-agent.js").TokenUsage;

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Create a mock ChildProcess with controllable stdout/stderr. */
function createMockProcess() {
  const stdout = new Readable({ read() {} });
  const stderr = new Readable({ read() {} });
  const proc = new EventEmitter() as ChildProcess & {
    stdout: Readable;
    stderr: Readable;
    pid: number;
    kill: ReturnType<typeof vi.fn>;
  };
  proc.stdout = stdout;
  proc.stderr = stderr;
  proc.pid = 12345;
  proc.kill = vi.fn(() => {
    stdout.push(null);
    stderr.push(null);
    proc.emit("close", 1);
    return true;
  });
  return proc;
}

/** Collect all items from an async generator. */
async function collectAll<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of gen) {
    items.push(item);
  }
  return items;
}

// ── streamCliAgent ──────────────────────────────────────────────────────────

describe("streamCliAgent", () => {
  afterEach(() => {
    mockSpawn.mockReset();
  });

  it("yields text chunks from subprocess stdout", async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);

    setTimeout(() => {
      proc.stdout.push("Hello ");
      proc.stdout.push("world!");
      proc.stdout.push(null); // EOF
      proc.stderr.push(null);
      proc.emit("close", 0);
    }, 10);

    const items = await collectAll(
      streamCliAgent(["echo"], "test prompt", {
        startupTimeoutMs: 2000,
        idleTimeoutMs: 2000,
      }),
    );

    const texts = items.filter((i): i is string => typeof i === "string");
    expect(texts.join("")).toBe("Hello world!");
  });

  it("throws AgentStreamError on startup timeout", async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);

    // Don't push any data — simulate startup timeout
    setTimeout(() => {
      proc.stderr.push(null);
    }, 50);

    try {
      await collectAll(
        streamCliAgent(["slow-agent"], "test", {
          startupTimeoutMs: 50,
          idleTimeoutMs: 5000,
        }),
      );
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(AgentStreamError);
      expect((e as InstanceType<typeof AgentStreamError>).errorType).toBe(
        "startup",
      );
    }
  });

  it("throws AgentStreamError on idle timeout with partial output", async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);

    // Push first chunk (passes startup), then go idle
    setTimeout(() => {
      proc.stdout.push("partial ");
    }, 10);
    setTimeout(() => {
      proc.stderr.push(null);
    }, 200);

    try {
      await collectAll(
        streamCliAgent(["claude"], "test", {
          startupTimeoutMs: 2000,
          idleTimeoutMs: 80,
        }),
      );
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(AgentStreamError);
      expect((e as InstanceType<typeof AgentStreamError>).errorType).toBe(
        "timeout",
      );
      expect(
        (e as InstanceType<typeof AgentStreamError>).partialOutput,
      ).toBe("partial ");
    }
  });

  it("throws AgentStreamError on non-zero exit code with partial output", async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);

    setTimeout(() => {
      proc.stdout.push("some output");
      proc.stdout.push(null); // EOF
      proc.stderr.push(null);
      proc.emit("close", 1); // non-zero exit
    }, 10);

    try {
      await collectAll(
        streamCliAgent(["bad-agent"], "test", {
          startupTimeoutMs: 2000,
          idleTimeoutMs: 2000,
        }),
      );
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(AgentStreamError);
      expect((e as InstanceType<typeof AgentStreamError>).errorType).toBe(
        "crash",
      );
      expect(
        (e as InstanceType<typeof AgentStreamError>).partialOutput,
      ).toBe("some output");
    }
  });

  it("parses TokenUsage from real Claude CLI stream-json format", async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);

    // Real Claude CLI stream-json output format
    const jsonLines = [
      // system init — should be ignored
      JSON.stringify({
        type: "system",
        subtype: "init",
        session_id: "abc-123",
        tools: [],
        mcp_servers: [],
      }),
      // assistant message with nested message.content
      JSON.stringify({
        type: "assistant",
        message: {
          content: [{ type: "text", text: "Hello " }],
        },
      }),
      // hook — should be ignored
      JSON.stringify({
        type: "system",
        subtype: "hook_started",
        hook_name: "pre_tool_use",
      }),
      // another assistant message
      JSON.stringify({
        type: "assistant",
        message: {
          content: [{ type: "text", text: "world!" }],
        },
      }),
      // rate limit event — should be ignored
      JSON.stringify({
        type: "rate_limit_event",
        retry_after: 5,
      }),
      // result with usage
      JSON.stringify({
        type: "result",
        subtype: "success",
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_read_input_tokens: 10,
        },
        result: "Hello world!",
      }),
    ];

    setTimeout(() => {
      for (const line of jsonLines) {
        proc.stdout.push(line + "\n");
      }
      proc.stdout.push(null);
      proc.stderr.push(null);
      proc.emit("close", 0);
    }, 10);

    const items = await collectAll(
      streamCliAgent(["claude"], "test", {
        startupTimeoutMs: 2000,
        idleTimeoutMs: 2000,
        jsonOutput: true,
      }),
    );

    const texts = items.filter((i): i is string => typeof i === "string");
    expect(texts.join("")).toBe("Hello world!");

    const usages = items.filter(
      (i): i is TokenUsage =>
        typeof i === "object" && i !== null && "input" in i,
    );
    expect(usages).toHaveLength(1);
    expect(usages[0]).toEqual({ input: 100, output: 50, cached: 10 });
  });

  it("passes prompt as last argument to spawn", async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);

    setTimeout(() => {
      proc.stdout.push("ok");
      proc.stdout.push(null);
      proc.stderr.push(null);
      proc.emit("close", 0);
    }, 10);

    await collectAll(
      streamCliAgent(["claude", "--print"], "my prompt here", {
        startupTimeoutMs: 2000,
        idleTimeoutMs: 2000,
      }),
    );

    expect(mockSpawn).toHaveBeenCalledWith(
      "claude",
      ["--print", "my prompt here"],
      expect.objectContaining({ stdio: expect.anything() }),
    );
  });
});

// ── streamCliAgent abort ─────────────────────────────────────────────────────

describe("streamCliAgent abort", () => {
  afterEach(() => {
    mockSpawn.mockReset();
  });

  it("yields zero chunks when signal is pre-aborted", async () => {
    const controller = new AbortController();
    controller.abort(); // pre-abort before starting
    const chunks: string[] = [];
    for await (const chunk of streamCliAgent(["echo", "hello world"], "test prompt", { signal: controller.signal })) {
      if (typeof chunk === "string") chunks.push(chunk);
    }
    expect(chunks.length).toBe(0);
  });

  it("accepts signal as undefined for backward compat", async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);

    setTimeout(() => {
      proc.stdout.push("hello");
      proc.stdout.push(null);
      proc.stderr.push(null);
      proc.emit("close", 0);
    }, 10);

    const chunks: string[] = [];
    for await (const chunk of streamCliAgent(["echo", "hello"], "test", { signal: undefined })) {
      if (typeof chunk === "string") chunks.push(chunk);
    }
    expect(chunks.length).toBeGreaterThan(0);
  });
});

// ── streamApiAgent ──────────────────────────────────────────────────────────

describe("streamApiAgent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("yields chunks from mock HTTP NDJSON response", async () => {
    const lines = [
      JSON.stringify({ response: "Hello ", done: false }),
      JSON.stringify({ response: "world!", done: false }),
      JSON.stringify({ response: "", done: true }),
    ].join("\n");

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(lines));
        controller.close();
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        body: stream,
      }),
    );

    const items = await collectAll(
      streamApiAgent("http://localhost:11434", "llama3.2", "test prompt"),
    );

    expect(items).toEqual(["Hello ", "world!"]);
  });

  it("handles HTTP error response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      }),
    );

    await expect(
      collectAll(
        streamApiAgent("http://localhost:11434", "llama3.2", "test"),
      ),
    ).rejects.toThrow(/500/);
  });
});
