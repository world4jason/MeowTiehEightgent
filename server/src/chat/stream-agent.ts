/**
 * stream-agent.ts — Thin wrapper around CLI/API agent execution for Chat streaming
 *
 * Provides async generators that yield text chunks (and optionally TokenUsage)
 * from CLI subprocess stdout or Ollama HTTP streaming responses.
 *
 * Unlike Mth's full adapter pipeline, this module only handles:
 *   spawn → stream → done
 * No session codec, workspace ops, or skill sync.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { type Readable } from "node:stream";

// ── Types ───────────────────────────────────────────────────────────────────

export interface TokenUsage {
  input: number;
  output: number;
  cached?: number;
}

export interface StreamAgentOptions {
  images?: string[];
  tempDir?: string;
  idleTimeoutMs?: number;
  startupTimeoutMs?: number;
  jsonOutput?: boolean;
  cwd?: string;
}

// ── Errors ──────────────────────────────────────────────────────────────────

export class AgentStreamError extends Error {
  constructor(
    public agent: string,
    public errorType: "startup" | "timeout" | "crash",
    public partialOutput: string,
    message: string,
  ) {
    super(message);
    this.name = "AgentStreamError";
  }
}

// ── Internal helpers ────────────────────────────────────────────────────────

/**
 * Parse a JSONL line from stream-json output.
 * Returns [textChunk | null, usage | null].
 */
function parseJsonLine(line: string): [string | null, TokenUsage | null] {
  if (!line.trim()) return [null, null];
  try {
    const obj = JSON.parse(line);

    // Text content: {"type":"assistant","content":[{"type":"text","text":"..."}]}
    if (obj.type === "assistant" && Array.isArray(obj.content)) {
      const texts: string[] = [];
      for (const block of obj.content) {
        if (block.type === "text" && typeof block.text === "string") {
          texts.push(block.text);
        }
      }
      return [texts.length > 0 ? texts.join("") : null, null];
    }

    // Usage/result: {"type":"result","usage":{...}}
    if (obj.type === "result" && obj.usage) {
      const u = obj.usage;
      return [
        null,
        {
          input: u.input_tokens ?? u.input ?? 0,
          output: u.output_tokens ?? u.output ?? 0,
          cached: u.cache_read_input_tokens ?? u.cached ?? 0,
        },
      ];
    }

    return [null, null];
  } catch {
    return [null, null];
  }
}

/**
 * Read from a Readable stream with a timeout.
 * Resolves with the data chunk, or null on EOF, or rejects on timeout.
 */
function readWithTimeout(
  stream: Readable,
  timeoutMs: number,
): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    // If the stream is already ended/destroyed, resolve immediately with null
    if (stream.readableEnded || stream.destroyed) {
      resolve(null);
      return;
    }

    let settled = false;

    function cleanup() {
      clearTimeout(timer);
      stream.removeListener("data", onData);
      stream.removeListener("end", onEnd);
      stream.removeListener("close", onEnd);
      stream.removeListener("error", onError);
    }

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error("TIMEOUT"));
      }
    }, timeoutMs);

    function onData(chunk: Buffer) {
      if (!settled) {
        settled = true;
        cleanup();
        // Pause to avoid losing further chunks
        stream.pause();
        resolve(chunk);
      }
    }

    function onEnd() {
      if (!settled) {
        settled = true;
        cleanup();
        resolve(null);
      }
    }

    function onError(err: Error) {
      if (!settled) {
        settled = true;
        cleanup();
        reject(err);
      }
    }

    stream.on("data", onData);
    stream.on("end", onEnd);
    stream.on("close", onEnd);
    stream.on("error", onError);
    stream.resume();
  });
}

/**
 * Wait for a child process to emit 'close', returning the exit code.
 * If the process has already closed, resolve immediately.
 */
function waitForClose(proc: ChildProcess): Promise<number | null> {
  return new Promise((resolve) => {
    proc.on("close", (code) => resolve(code));
  });
}

// ── streamCliAgent ──────────────────────────────────────────────────────────

/**
 * Stream output from a CLI agent subprocess.
 *
 * Spawns cmd[0] with [...cmd.slice(1), prompt] as arguments.
 * Yields text chunks as they arrive from stdout.
 * In jsonOutput mode, parses JSONL lines and yields a final TokenUsage object.
 *
 * Throws AgentStreamError on startup timeout, idle timeout, or non-zero exit.
 */
export async function* streamCliAgent(
  cmd: string[],
  prompt: string,
  options?: StreamAgentOptions,
): AsyncGenerator<string | TokenUsage> {
  const idleTimeoutMs = options?.idleTimeoutMs ?? 120_000;
  const startupTimeoutMs = options?.startupTimeoutMs ?? 120_000;
  const jsonOutput = options?.jsonOutput ?? false;
  const agentName = cmd[0] ?? "unknown";

  let buffer = "";
  let usage: TokenUsage | null = null;

  // Build args: [...rest of cmd, ...image flags, prompt]
  const args = [...cmd.slice(1)];
  if (options?.images) {
    for (const imgPath of options.images) {
      args.push("--add-file", imgPath);
    }
  }
  args.push(prompt);

  const proc = spawn(cmd[0], args, {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: options?.cwd,
  });

  // Collect stderr for error reporting
  const stderrChunks: Buffer[] = [];
  proc.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

  // Track close event
  const closePromise = waitForClose(proc);

  try {
    // ── Startup timeout: wait for first data ──
    let firstChunk: Buffer | null;
    try {
      firstChunk = await readWithTimeout(proc.stdout!, startupTimeoutMs);
    } catch (err) {
      if (err instanceof Error && err.message === "TIMEOUT") {
        proc.kill();
        await closePromise;
        throw new AgentStreamError(
          agentName,
          "startup",
          "",
          `Agent ${agentName} failed to produce output within ${startupTimeoutMs}ms`,
        );
      }
      throw err;
    }

    if (firstChunk === null) {
      // EOF immediately — process produced no output
      const exitCode = await closePromise;
      if (exitCode !== 0) {
        throw new AgentStreamError(
          agentName,
          "crash",
          "",
          `Agent ${agentName} exited with code ${exitCode} without output`,
        );
      }
      return;
    }

    // Process first chunk
    const firstText = firstChunk.toString("utf-8");
    if (jsonOutput) {
      for (const line of firstText.split("\n")) {
        const [text, u] = parseJsonLine(line);
        if (u) usage = u;
        if (text) {
          buffer += text;
          yield text;
        }
      }
    } else {
      buffer += firstText;
      yield firstText;
    }

    // ── Idle timeout loop: read subsequent chunks ──
    while (true) {
      let chunk: Buffer | null;
      try {
        chunk = await readWithTimeout(proc.stdout!, idleTimeoutMs);
      } catch (err) {
        if (err instanceof Error && err.message === "TIMEOUT") {
          proc.kill();
          await closePromise;
          throw new AgentStreamError(
            agentName,
            "timeout",
            buffer,
            `Agent ${agentName} idle for ${idleTimeoutMs}ms`,
          );
        }
        throw err;
      }

      if (chunk === null) {
        break; // EOF
      }

      const text = chunk.toString("utf-8");
      if (jsonOutput) {
        for (const line of text.split("\n")) {
          const [parsed, u] = parseJsonLine(line);
          if (u) usage = u;
          if (parsed) {
            buffer += parsed;
            yield parsed;
          }
        }
      } else {
        buffer += text;
        yield text;
      }
    }

    // ── Check exit code ──
    const exitCode = await closePromise;
    if (exitCode !== null && exitCode !== 0) {
      throw new AgentStreamError(
        agentName,
        "crash",
        buffer,
        `Agent ${agentName} exited with code ${exitCode}`,
      );
    }

    // ── Yield token usage if available ──
    if (jsonOutput && usage && (usage.input || usage.output)) {
      yield usage;
    }
  } catch (err) {
    if (err instanceof AgentStreamError) throw err;
    // Unexpected error: kill and wrap
    proc.kill();
    await closePromise;
    throw new AgentStreamError(
      agentName,
      "crash",
      buffer,
      `Agent ${agentName} failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ── streamApiAgent ──────────────────────────────────────────────────────────

/**
 * Stream output from an API agent (Ollama).
 *
 * HTTP POST to {baseUrl}/api/generate with {model, prompt, stream: true}.
 * Reads NDJSON response: each line is {"response": "text", "done": false}.
 * Yields response text chunks until done: true.
 */
export async function* streamApiAgent(
  baseUrl: string,
  model: string,
  prompt: string,
): AsyncGenerator<string> {
  const resp = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: true }),
  });

  if (!resp.ok) {
    throw new Error(
      `Ollama API error: ${resp.status} ${resp.statusText}`,
    );
  }

  if (!resp.body) {
    throw new Error("No response body from Ollama API");
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let leftover = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    leftover += decoder.decode(value, { stream: true });
    const lines = leftover.split("\n");
    // Keep the last incomplete line
    leftover = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const data = JSON.parse(line);
        if (data.done) return;
        if (data.response) {
          yield data.response;
        }
      } catch {
        // Skip malformed JSON lines
      }
    }
  }

  // Process any remaining data
  if (leftover.trim()) {
    try {
      const data = JSON.parse(leftover);
      if (!data.done && data.response) {
        yield data.response;
      }
    } catch {
      // Skip
    }
  }
}
