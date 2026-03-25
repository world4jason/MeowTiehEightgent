/**
 * chat-ws.ts — WebSocket handler for Chat mode
 *
 * Ties together session-store, conversation-engine, build-prompt,
 * and stream-agent to provide a full multi-agent chat over WS.
 *
 * Port of Python backend's @app.websocket("/ws") handler.
 */

import { createRequire } from "node:module";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { IncomingMessage } from "node:http";
import type { ChildProcess } from "node:child_process";

import { ConversationEngine, type ChatAgent } from "./conversation-engine.js";
import {
  createSession,
  loadSession,
  saveMessage,
} from "./session-store.js";
import { buildPrompt } from "./build-prompt.js";
import {
  streamCliAgent,
  streamApiAgent,
  AgentStreamError,
  type TokenUsage,
} from "./stream-agent.js";
import type {
  ChatMessage,
  WsInitMessage,
  WsServerMessage,
  WsClientMessage,
  WsSessionControl,
} from "./types.js";
import { logger } from "../middleware/logger.js";

// ── WS import (same pattern as live-events-ws.ts) ───────────────────────────

const require = createRequire(import.meta.url);
const { WebSocket, WebSocketServer } = require("ws") as {
  WebSocket: { OPEN: number };
  WebSocketServer: new (opts: { noServer: boolean }) => WsServer;
};

interface WsSocket {
  readyState: number;
  ping(): void;
  send(data: string): void;
  terminate(): void;
  close(code?: number, reason?: string): void;
  on(event: "message", listener: (data: Buffer | string) => void): void;
  on(event: "pong", listener: () => void): void;
  on(event: "close", listener: () => void): void;
  on(event: "error", listener: (err: Error) => void): void;
  once(event: "message", listener: (data: Buffer | string) => void): void;
  removeAllListeners(event?: string): void;
}

interface WsServer {
  clients: Set<WsSocket>;
  on(
    event: "connection",
    listener: (socket: WsSocket, req: IncomingMessage) => void,
  ): void;
  on(event: "close", listener: () => void): void;
  handleUpgrade(
    req: IncomingMessage,
    socket: import("node:stream").Duplex,
    head: Buffer,
    callback: (ws: WsSocket) => void,
  ): void;
  emit(event: "connection", ws: WsSocket, req: IncomingMessage): boolean;
}

// ── MergedAgent type ─────────────────────────────────────────────────────────

export interface MergedAgent {
  name: string;
  workspace: string;
  type: "cli" | "api";
  cmd?: string[];
  baseUrl?: string;
  model?: string;
  adapter?: string;
  emoji?: string;
  color?: string;
  skills?: string[];
  idle_timeout_seconds?: number;
  startup_timeout_seconds?: number;
  supports_image?: boolean;
  model_tiers?: Record<string, string>;
  pending_continuation?: boolean;
  configVersion?: number;
  [key: string]: unknown;
}

// ── Agent Registry Loading ──────────────────────────────────────────────────

/** Read project root config.json → adapter_presets (or convert legacy models). */
async function loadAdapterPresets(
  projectRoot: string,
): Promise<Record<string, Record<string, unknown>>> {
  const configPath = path.join(projectRoot, "config.json");
  let cfg: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(configPath, "utf-8");
    cfg = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }

  if (cfg.adapter_presets && typeof cfg.adapter_presets === "object") {
    return cfg.adapter_presets as Record<string, Record<string, unknown>>;
  }

  // Fallback: convert old models dict
  const models = (cfg.models ?? {}) as Record<string, Record<string, unknown>>;
  const presets: Record<string, Record<string, unknown>> = {};
  for (const [mid, m] of Object.entries(models)) {
    const preset: Record<string, unknown> = { ...m };
    const cmdList = m.cmd as string[] | undefined;
    if (cmdList && Array.isArray(cmdList) && cmdList.length > 0) {
      preset.command = cmdList[0];
      preset.defaultArgs = cmdList.slice(1);
    }
    if (m.apiModel) {
      preset.defaultModel = m.apiModel;
    }
    if (m.idle_timeout_seconds !== undefined) {
      preset.timeoutSec = m.idle_timeout_seconds;
    }
    if (m.startup_timeout_seconds !== undefined) {
      preset.startupTimeoutSec = m.startup_timeout_seconds;
    }
    presets[mid] = preset;
  }
  return presets;
}

/** Read legacy models dict from config.json (for v0 agent resolution). */
async function loadModels(
  projectRoot: string,
): Promise<Record<string, Record<string, unknown>>> {
  const configPath = path.join(projectRoot, "config.json");
  try {
    const raw = await fs.readFile(configPath, "utf-8");
    const cfg = JSON.parse(raw) as Record<string, unknown>;
    return (cfg.models ?? {}) as Record<string, Record<string, unknown>>;
  } catch {
    return {};
  }
}

/** Merge v0 agent config with model entry. */
function mergeV0Agent(
  agent: Record<string, unknown>,
  agentDir: string,
  models: Record<string, Record<string, unknown>>,
): [string, MergedAgent] {
  const name = path.basename(agentDir);
  agent.name = name;
  agent.workspace = agentDir;

  const modelId = (agent.model as string) ?? "";
  agent.model_id = modelId;

  if (modelId in models) {
    const m = models[modelId];
    agent.type = (m.type as string) ?? "cli";
    if (m.cmd && Array.isArray(m.cmd)) {
      const baseCmd = [...(m.cmd as string[])];
      const extraFlags = (m.extra_flags as string[]) ?? [];
      for (const flag of extraFlags) {
        if (!baseCmd.includes(flag)) {
          baseCmd.push(flag);
        }
      }
      agent.cmd = baseCmd;
    }
    if (m.baseUrl) agent.baseUrl = m.baseUrl;
    if (m.apiModel) agent.model = m.apiModel;
    for (const tk of ["idle_timeout_seconds", "startup_timeout_seconds"]) {
      if (!(tk in agent) && tk in m) {
        agent[tk] = m[tk];
      }
    }
  }

  return [name, agent as unknown as MergedAgent];
}

/** Merge v1 agent config with adapter preset. */
function mergeV1Agent(
  agent: Record<string, unknown>,
  agentDir: string,
  presets: Record<string, Record<string, unknown>>,
): [string, MergedAgent] {
  const name = (agent.name as string) ?? path.basename(agentDir);
  agent.name = name;
  agent.workspace = agentDir;

  const adapterType = (agent.adapter as string) ?? "";
  const adapterConfig =
    (agent.adapterConfig as Record<string, unknown>) ?? {};
  const preset = presets[adapterType] ?? {};

  // Determine type
  if (preset.baseUrl) {
    agent.type = "api";
    agent.baseUrl = preset.baseUrl;
  } else {
    agent.type = "cli";
  }

  // Build cmd from preset command + defaultArgs
  const command =
    (adapterConfig.command as string) ?? (preset.command as string);
  if (command) {
    const defaultArgs = (preset.defaultArgs as string[]) ?? [];
    agent.cmd = [command, ...defaultArgs];
  }

  // Model: adapterConfig.model > preset.defaultModel
  const model =
    (adapterConfig.model as string) ?? (preset.defaultModel as string);
  if (model) {
    agent.model = model;
  }

  agent.model_id = adapterType;

  // Timeouts
  const timeoutSec =
    (adapterConfig.timeoutSec as number) ?? (preset.timeoutSec as number);
  if (timeoutSec !== undefined && timeoutSec !== null) {
    agent.idle_timeout_seconds = timeoutSec;
  }

  const startupTimeoutSec =
    (adapterConfig.startupTimeoutSec as number) ??
    (preset.startupTimeoutSec as number);
  if (startupTimeoutSec !== undefined && startupTimeoutSec !== null) {
    agent.startup_timeout_seconds = startupTimeoutSec;
  }

  // supports_image from preset
  if (preset.supports_image !== undefined && agent.supports_image === undefined) {
    agent.supports_image = preset.supports_image;
  }

  return [name, agent as unknown as MergedAgent];
}

/**
 * Load all agents by scanning agents/ folders for config.json.
 * Supports both v0 (model soft-ref) and v1 (adapter-based) configs.
 * Mirrors Python's get_agent_registry().
 */
export async function loadChatAgentRegistry(
  projectRoot: string,
): Promise<Record<string, MergedAgent>> {
  const agentsDir = path.join(projectRoot, "agents");
  const [presets, models] = await Promise.all([
    loadAdapterPresets(projectRoot),
    loadModels(projectRoot),
  ]);

  const registry: Record<string, MergedAgent> = {};

  let entries: string[];
  try {
    entries = await fs.readdir(agentsDir);
  } catch {
    return registry;
  }

  entries.sort();

  for (const entry of entries) {
    // Skip _default, dotfiles
    if (entry.startsWith("_") || entry.startsWith(".")) continue;

    const agentDir = path.join(agentsDir, entry);
    let stat;
    try {
      stat = await fs.stat(agentDir);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;

    const configPath = path.join(agentDir, "config.json");
    let raw: string;
    try {
      raw = await fs.readFile(configPath, "utf-8");
    } catch {
      continue;
    }

    let agent: Record<string, unknown>;
    try {
      agent = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      continue;
    }

    try {
      const configVersion = (agent.configVersion as number) ?? 0;
      let key: string;
      let merged: MergedAgent;
      if (configVersion >= 1) {
        [key, merged] = mergeV1Agent(agent, agentDir, presets);
      } else {
        [key, merged] = mergeV0Agent(agent, agentDir, models);
      }
      registry[key] = merged;
    } catch {
      continue;
    }
  }

  return registry;
}

// ── History text helpers ────────────────────────────────────────────────────

function formatHistoryText(messages: ChatMessage[], topic: string): string {
  const parts: string[] = [];
  for (const msg of messages) {
    if (msg.type === "system") continue;
    parts.push(`[${msg.agent}]: ${msg.text}`);
  }
  return parts.length > 0
    ? parts.join("\n") + "\n"
    : `[Human]: ${topic}\n`;
}

// ── Resolve thinking model (mirrors Python resolve_thinking_model) ──────────

function resolveThinkingModel(
  agent: MergedAgent,
  models: Record<string, Record<string, unknown>>,
): MergedAgent | null {
  const tiers = agent.model_tiers;
  if (!tiers || !tiers.thinking) return null;
  const thinkingKey = tiers.thinking;

  // v1 agents: model_tiers are model variant names
  if ((agent.configVersion ?? 0) >= 1) {
    return { ...agent, model: thinkingKey };
  }

  // v0 path: look up in models
  if (!(thinkingKey in models)) return null;
  const m = models[thinkingKey];
  const resolved: MergedAgent = { ...agent };
  if (m.cmd && Array.isArray(m.cmd)) {
    const baseCmd = [...(m.cmd as string[])];
    const extraFlags = (m.extra_flags as string[]) ?? [];
    for (const flag of extraFlags) {
      if (!baseCmd.includes(flag)) {
        baseCmd.push(flag);
      }
    }
    resolved.cmd = baseCmd;
  }
  resolved.type = (m.type as string as "cli" | "api") ?? "cli";
  if (m.baseUrl) resolved.baseUrl = m.baseUrl as string;
  if (m.apiModel) resolved.model = m.apiModel as string;
  for (const tk of [
    "idle_timeout_seconds",
    "startup_timeout_seconds",
  ] as const) {
    if (m[tk] !== undefined) {
      resolved[tk] = m[tk] as number;
    }
  }
  return resolved;
}

// ── Main WS handler ─────────────────────────────────────────────────────────

export function handleChatWebSocket(
  ws: WsSocket,
  _req: IncomingMessage,
  config: { projectRoot: string },
): void {
  const { projectRoot } = config;
  const historyDir = path.join(projectRoot, "history");

  // Wrap entire lifecycle in an async IIFE
  void (async () => {
    // ── 1. Wait for init message ──────────────────────────────────────────
    let initData: WsInitMessage;
    try {
      initData = await waitForMessage<WsInitMessage>(ws);
    } catch {
      ws.close(1008, "No init message received");
      return;
    }

    const topic = (initData.topic ?? "General Discussion").trim();
    const selectedNames: string[] = initData.agents ?? [];
    let autoMode = initData.auto ?? true;
    const manualRounds = initData.rounds ?? 2;
    const silenceMode = initData.silence ?? false;
    const resumeFrom = initData.resume_from ?? null;
    const workspaceId = initData.workspace_id ?? null;
    const scenarioId = initData.scenario_id ?? null;
    const blankMode = initData.blank_mode ?? false;

    // ── 2. Session ──────────────────────────────────────────────────────────
    let sessionId: string;
    let messages: ChatMessage[];

    if (resumeFrom) {
      sessionId = resumeFrom;
      messages = await loadSession(historyDir, sessionId);
    } else {
      sessionId = await createSession(historyDir);
      messages = [];
    }

    // ── 3. Agent Registry ───────────────────────────────────────────────────
    let registry = await loadChatAgentRegistry(projectRoot);
    const activeAgents: MergedAgent[] = [];

    for (const name of selectedNames) {
      if (name in registry) {
        const agent = registry[name];
        if (agent.enabled !== false) {
          activeAgents.push(agent);
        }
      }
    }

    if (activeAgents.length === 0) {
      send(ws, { type: "system", text: "No agents selected." });
      ws.close(1000, "No agents");
      return;
    }

    // Per-agent mode state
    const agentModes: Record<string, "chat" | "think"> = {};
    for (const a of activeAgents) {
      agentModes[a.name] = (a.mode as "chat" | "think") ?? "chat";
    }

    // ── 4. Scenario context ─────────────────────────────────────────────────
    let scenarioSystemPrompt: string | null = null;
    let effectiveBlankMode = blankMode;

    if (scenarioId) {
      const scenarioFile = path.join(
        projectRoot,
        "scenarios",
        `${scenarioId}.json`,
      );
      try {
        const raw = await fs.readFile(scenarioFile, "utf-8");
        const sc = JSON.parse(raw) as Record<string, unknown>;
        scenarioSystemPrompt = (sc.system_prompt as string) ?? null;
      } catch {
        // scenario file not found → blank mode
      }
      if (!scenarioSystemPrompt) {
        effectiveBlankMode = true;
      }
    }

    // ── 5. Build initial history text ──────────────────────────────────────
    let historyText: string;
    if (resumeFrom && messages.length > 0) {
      historyText = formatHistoryText(messages, topic);
    } else {
      // New session: treat topic as the opening human turn
      historyText = `[Human]: ${topic}\n`;
      const hmsg: ChatMessage = {
        type: "message",
        agent: "Human",
        text: topic,
        timestamp: new Date().toISOString(),
        color: "#60a5fa",
      };
      messages.push(hmsg);
      await saveMessage(historyDir, sessionId, hmsg);
    }

    // ── 6. Engine ───────────────────────────────────────────────────────────
    const engine = new ConversationEngine(
      activeAgents as ChatAgent[],
      { silence: silenceMode },
    );

    // ── 7. Send system message with session info ────────────────────────────
    const agentNames = activeAgents.map((a) => a.name).join(", ");
    const modeLabel = autoMode ? "Auto" : "Manual";
    send(ws, {
      type: "system",
      text: `Session started -- ${topic}  [${agentNames}]  ${modeLabel}`,
    });

    // Log system message to session
    const sysMsg: ChatMessage = {
      type: "system",
      agent: "System",
      text: `Topic: ${topic}`,
      timestamp: new Date().toISOString(),
    };
    messages.push(sysMsg);
    await saveMessage(historyDir, sessionId, sysMsg);

    // ── 8. Event queue for incoming WS messages ─────────────────────────────
    const eventQueue: WsClientMessage[] = [];
    let eventResolve: ((msg: WsClientMessage) => void) | null = null;
    let wsOpen = true;

    // Agent abort controllers for pause/resume — keyed by agent name
    const agentControllers = new Map<string, { controller: AbortController; status: "active" | "paused" }>();

    ws.on("message", (data) => {
      let parsed: WsClientMessage;
      try {
        const str = typeof data === "string" ? data : data.toString("utf-8");
        parsed = JSON.parse(str) as WsClientMessage;
      } catch {
        return; // ignore malformed
      }

      // SYNCHRONOUS pause/resume/redirect — must NOT go through eventQueue
      if (parsed.type === "session:control") {
        const ctrl = parsed as WsSessionControl;
        if (ctrl.action === "pause" && ctrl.agentId) {
          const entry = agentControllers.get(ctrl.agentId);
          if (entry) {
            entry.controller.abort();
            entry.status = "paused";
          }
          send(ws, { type: "agent:status", agentId: ctrl.agentId, status: "idle", detail: "paused" });
          return; // Don't push to eventQueue
        }
        if (ctrl.action === "resume" && ctrl.agentId) {
          agentControllers.delete(ctrl.agentId);
          engine.onMention(ctrl.agentId); // Push agent to front of turn queue
          send(ws, { type: "agent:status", agentId: ctrl.agentId, status: "chatting" });
          return;
        }
        if (ctrl.action === "redirect" && ctrl.agentId && ctrl.instruction) {
          agentControllers.delete(ctrl.agentId);
          // Inject redirect as human message in history
          const redirectMsg: ChatMessage = {
            type: "message",
            agent: "Human",
            text: `[對 ${ctrl.agentId} 的指示] ${ctrl.instruction}`,
            timestamp: new Date().toISOString(),
          };
          messages.push(redirectMsg);
          void saveMessage(historyDir, sessionId, redirectMsg);
          engine.onMention(ctrl.agentId);
          send(ws, { type: "agent:status", agentId: ctrl.agentId, status: "chatting" });
          return;
        }
        // set_goal falls through to eventQueue (not time-critical)
      }

      if (eventResolve) {
        const resolve = eventResolve;
        eventResolve = null;
        resolve(parsed);
      } else {
        eventQueue.push(parsed);
      }
    });

    ws.on("close", () => {
      wsOpen = false;
      // Unblock any pending wait
      if (eventResolve) {
        const resolve = eventResolve;
        eventResolve = null;
        resolve({ type: "stop" });
      }
    });

    ws.on("error", (err) => {
      logger.warn({ err }, "chat websocket client error");
      wsOpen = false;
    });

    /** Wait for next client event with optional timeout (ms). Returns null on timeout. */
    async function nextEvent(
      timeoutMs?: number,
    ): Promise<WsClientMessage | null> {
      // Drain from buffer first
      if (eventQueue.length > 0) {
        return eventQueue.shift()!;
      }
      if (!wsOpen) return { type: "stop" };

      return new Promise<WsClientMessage | null>((resolve) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        eventResolve = (msg) => {
          if (timer) clearTimeout(timer);
          resolve(msg);
        };
        if (timeoutMs !== undefined) {
          timer = setTimeout(() => {
            eventResolve = null;
            resolve(null);
          }, timeoutMs);
        }
      });
    }

    // ── Helper: handle add/remove agent ───────────────────────────────────
    async function handleMemberEvent(evt: WsClientMessage): Promise<boolean> {
      if (evt.type === "add_agent") {
        const name = evt.agent;
        // Refresh registry in case agent was added to filesystem
        registry = await loadChatAgentRegistry(projectRoot);
        if (
          name in registry &&
          !activeAgents.some((a) => a.name === name)
        ) {
          const agent = registry[name];
          activeAgents.push(agent);
          agentModes[name] = (agent.mode as "chat" | "think") ?? "chat";
          engine.addAgent(agent as ChatAgent);
          historyText += `\n[System]: ${name} joined the conversation\n`;
          const emoji = agent.emoji ?? "";
          send(ws, {
            type: "system",
            text: `${emoji} ${name} joined the chat`,
          });
        }
        return true;
      }
      if (evt.type === "remove_agent") {
        const name = evt.agent;
        const idx = activeAgents.findIndex((a) => a.name === name);
        if (idx !== -1) {
          const removed = activeAgents[idx];
          activeAgents.splice(idx, 1);
          engine.removeAgent(name);
          delete agentModes[name];
          const emoji = removed.emoji ?? "";
          send(ws, {
            type: "system",
            text: `${emoji} ${name} left the chat`,
          });
        }
        return true;
      }
      return false;
    }

    // ── Helper: handle set_mode ────────────────────────────────────────────
    function handleSetMode(evt: WsClientMessage): void {
      if (evt.type !== "set_mode") return;
      const agentName = evt.agent;
      const mode = evt.mode;
      if (!(agentName in agentModes)) {
        send(ws, { type: "system", text: `Unknown agent: ${agentName}` });
        return;
      }
      if (mode !== "chat" && mode !== "think") {
        send(ws, { type: "system", text: `Invalid mode: ${mode}` });
        return;
      }
      agentModes[agentName] = mode;
      send(ws, { type: "system", text: `${agentName} mode set to ${mode}` });
    }

    // ── Helper: process a human message ──────────────────────────────────
    async function processHumanMessage(evt: {
      type: "human";
      text: string;
      images?: string[];
    }): Promise<void> {
      const text = evt.text;
      historyText += `\n[Human]: ${text}\n`;
      const hmsg: ChatMessage = {
        type: "message",
        agent: "Human",
        text,
        timestamp: new Date().toISOString(),
        color: "#60a5fa",
      };
      if (evt.images && evt.images.length > 0) {
        hmsg.images = evt.images;
      }
      messages.push(hmsg);
      await saveMessage(historyDir, sessionId, hmsg);
      send(ws, { type: "message", agent: "Human", text, color: "#60a5fa" });

      const mention = ConversationEngine.extractMention(
        text,
        activeAgents as ChatAgent[],
      );
      if (mention && engine.onMention(mention) !== null) {
        // engine reordered; next nextSpeaker() returns @target
      } else {
        engine.onHuman();
      }
    }

    // ── 9. Main loop ────────────────────────────────────────────────────────
    // Pre-load models for thinking model resolution
    const modelsDict = await loadModels(projectRoot);
    let running = true;
    let batchTurns = 0;
    const pendingHumans: Array<{
      type: "human";
      text: string;
      images?: string[];
    }> = [];
    const sessionTokenTotals: Record<
      string,
      { input: number; output: number }
    > = {};

    try {
      while (running && wsOpen) {
        if (activeAgents.length === 0) {
          send(ws, { type: "system", text: "No agents remain in session." });
          break;
        }

        const agent = engine.nextSpeaker() as unknown as MergedAgent;

        // Send thinking indicator
        send(ws, {
          type: "thinking",
          agent: agent.name,
          color: agent.color,
        });

        const tStart = Date.now();
        const chunkParts: string[] = [];
        let cancelled = false;
        let hadError: AgentStreamError | null = null;
        let turnUsage: TokenUsage | null = null;
        const currentMode = agentModes[agent.name] ?? "chat";

        // Resolve thinking model if in think mode
        let effectiveAgent = agent;
        if (currentMode === "think") {
          const resolved = resolveThinkingModel(agent, modelsDict);
          if (resolved) effectiveAgent = resolved;
        }

        // Build prompt
        let prompt: string;
        try {
          prompt = await buildPrompt({
            agent: {
              name: effectiveAgent.name,
              workspace: effectiveAgent.workspace,
              skills: effectiveAgent.skills,
              pending_continuation: effectiveAgent.pending_continuation,
            },
            historyText,
            workspaceId,
            allAgents: activeAgents.map((a) => ({ name: a.name })),
            mode: currentMode,
            scenarioSystemPrompt,
            blankMode: effectiveBlankMode,
            projectRoot,
          });
        } catch (err) {
          logger.error(
            { err, agent: effectiveAgent.name },
            "Failed to build prompt",
          );
          send(ws, {
            type: "agent_error",
            agent: agent.name,
            error_type: "prompt_build",
            message: `Failed to build prompt: ${err instanceof Error ? err.message : String(err)}`,
          });
          continue;
        }

        // Stream agent response
        // We run the streaming in a nested async block with interleaved event draining
        let streamStarted = false;

        try {
          if (effectiveAgent.type === "api" && effectiveAgent.baseUrl) {
            // API agent (Ollama)
            send(ws, {
              type: "stream_start",
              agent: agent.name,
              color: agent.color,
            });
            streamStarted = true;

            for await (const chunk of streamApiAgent(
              effectiveAgent.baseUrl,
              effectiveAgent.model ?? "",
              prompt,
            )) {
              if (!wsOpen) {
                cancelled = true;
                break;
              }
              chunkParts.push(chunk);
              send(ws, { type: "chunk", agent: agent.name, text: chunk });
            }
          } else if (effectiveAgent.cmd && effectiveAgent.cmd.length > 0) {
            // CLI agent — build command with json output flags
            const idleTimeoutMs =
              (effectiveAgent.idle_timeout_seconds ?? 120) * 1000;
            const startupTimeoutMs =
              (effectiveAgent.startup_timeout_seconds ?? 120) * 1000;

            // Add --output-format stream-json for token tracking (same as Python _get_json_output_flags)
            const adapterType = effectiveAgent.adapter ?? "";
            const jsonFlags: string[] = [];
            const useJson = adapterType === "claude_local" || adapterType === "gemini_local";
            if (useJson) {
              jsonFlags.push("--output-format", "stream-json");
              if (adapterType === "claude_local") jsonFlags.push("--verbose");
            }
            // Inject json flags between binary and rest of args (before --print/-p to avoid yargs issues)
            const cmdBinary = effectiveAgent.cmd.slice(0, 1);
            const cmdRest = effectiveAgent.cmd.slice(1);
            const fullCmd = [...cmdBinary, ...jsonFlags, ...cmdRest];

            const ac = new AbortController();
            agentControllers.set(agent.name, { controller: ac, status: "active" });

            for await (const chunk of streamCliAgent(
              fullCmd,
              prompt,
              {
                idleTimeoutMs,
                startupTimeoutMs,
                jsonOutput: useJson,
                cwd: projectRoot,
                signal: ac.signal,
              },
            )) {
              if (!wsOpen) {
                cancelled = true;
                break;
              }

              if (typeof chunk === "string") {
                if (!streamStarted) {
                  streamStarted = true;
                  send(ws, {
                    type: "stream_start",
                    agent: agent.name,
                    color: agent.color,
                  });
                }
                chunkParts.push(chunk);
                send(ws, {
                  type: "chunk",
                  agent: agent.name,
                  text: chunk,
                });
              } else {
                // TokenUsage object
                turnUsage = chunk;
              }
            }

            // Handle pause-abort: save partial output with [TRUNCATED]
            if (ac.signal.aborted && chunkParts.length > 0) {
              const partialText = chunkParts.join("") + " [TRUNCATED]";
              const _currentMode = agentModes[agent.name] ?? "chat";
              const msg: ChatMessage = {
                type: "message",
                agent: agent.name,
                text: partialText,
                mode: _currentMode,
                timestamp: new Date().toISOString(),
              };
              messages.push(msg);
              await saveMessage(historyDir, sessionId, msg);
              historyText += `\n[${agent.name}]: ${partialText}\n`;
              send(ws, { type: "message_end", agent: agent.name, truncated: true });
              agent.pending_continuation = true;
              agentControllers.delete(agent.name);
              continue; // Skip normal message handling, move to next turn
            }
            agentControllers.delete(agent.name);

            // Drain any pending events that arrived during streaming
            while (true) {
              const evt = await nextEvent(0);
              if (!evt) break;
              if (evt.type === "stop") {
                cancelled = true;
                running = false;
                break;
              }
              if (evt.type === "add_agent" || evt.type === "remove_agent") {
                await handleMemberEvent(evt);
              } else if (evt.type === "set_mode") {
                handleSetMode(evt);
              } else if (evt.type === "human") {
                pendingHumans.push(evt);
              }
            }
          } else {
            send(ws, {
              type: "agent_error",
              agent: agent.name,
              error_type: "config",
              message: `Agent ${agent.name} has no cmd or API config`,
            });
            continue;
          }
        } catch (err) {
          if (err instanceof AgentStreamError) {
            hadError = err;
          } else {
            logger.error(
              { err, agent: agent.name },
              "Unexpected error streaming agent",
            );
            send(ws, {
              type: "agent_error",
              agent: agent.name,
              error_type: "unknown",
              message: err instanceof Error ? err.message : String(err),
            });
            continue;
          }
        }

        if (cancelled) break;

        // ── Handle error or success ─────────────────────────────────────────
        let response: string | null;
        if (hadError) {
          const partial = hadError.partialOutput ?? "";
          const suffix = partial ? " [TRUNCATED]" : "";
          response = (partial + suffix).trim() || null;

          send(ws, {
            type: "agent_error",
            agent: agent.name,
            error_type: hadError.errorType,
            message: hadError.message,
          });
          agent.pending_continuation = true;
        } else {
          response =
            chunkParts.length > 0
              ? chunkParts.join("").trim() || null
              : null;
        }

        const durationMs = Date.now() - tStart;

        if (!response) continue;

        // Record in history
        historyText += `\n[${agent.name}]: ${response}\n`;

        const ts = new Date().toISOString();
        const agentMsg: ChatMessage = {
          type: "message",
          agent: agent.name,
          color: agent.color,
          text: response,
          timestamp: ts,
          duration_ms: durationMs,
          mode: currentMode,
        };
        if (turnUsage) {
          agentMsg.usage = {
            input: turnUsage.input,
            output: turnUsage.output,
            cached: turnUsage.cached,
          };
        }

        messages.push(agentMsg);
        await saveMessage(historyDir, sessionId, agentMsg);

        // Send message_end
        const msgEnd: WsServerMessage = {
          type: "message_end",
          agent: agent.name,
          text: response,
          duration_ms: durationMs,
          usage: turnUsage
            ? {
                input: turnUsage.input,
                output: turnUsage.output,
                cached: turnUsage.cached,
              }
            : undefined,
        };
        send(ws, msgEnd);

        // Token tracking
        if (turnUsage) {
          if (!sessionTokenTotals[agent.name]) {
            sessionTokenTotals[agent.name] = { input: 0, output: 0 };
          }
          sessionTokenTotals[agent.name].input += turnUsage.input;
          sessionTokenTotals[agent.name].output += turnUsage.output;

          send(ws, {
            type: "token_update",
            agent: agent.name,
            turn: { input: turnUsage.input, output: turnUsage.output },
            cumulative: sessionTokenTotals[agent.name],
          });
        }

        batchTurns += 1;

        // ── Process pending human messages buffered during agent execution ──
        if (pendingHumans.length > 0) {
          for (const ph of pendingHumans) {
            await processHumanMessage(ph);
          }
          pendingHumans.length = 0;
          batchTurns = 0;
        }

        // ── Ready signal + event handling ───────────────────────────────────
        const pauseNow =
          !autoMode &&
          batchTurns >= manualRounds * activeAgents.length;

        send(ws, { type: "ready", auto: autoMode, pause: pauseNow });

        if (autoMode || !pauseNow) {
          // Brief wait for events during auto mode
          const evt = await nextEvent(2000);
          if (evt) {
            switch (evt.type) {
              case "stop":
                running = false;
                break;
              case "add_agent":
              case "remove_agent":
                await handleMemberEvent(evt);
                break;
              case "set_mode":
                handleSetMode(evt);
                break;
              case "human":
                await processHumanMessage(evt);
                batchTurns = 0;
                break;
              case "next":
                break;
            }
          }
        } else {
          // Manual mode pause: wait for explicit next/human/stop
          batchTurns = 0;
          let waiting = true;
          while (waiting && running && wsOpen) {
            const evt = await nextEvent();
            if (!evt) continue;
            switch (evt.type) {
              case "stop":
                running = false;
                waiting = false;
                break;
              case "next":
                waiting = false;
                break;
              case "add_agent":
              case "remove_agent":
                await handleMemberEvent(evt);
                break;
              case "set_mode":
                handleSetMode(evt);
                break;
              case "human":
                await processHumanMessage(evt);
                waiting = false;
                break;
            }
          }
        }
      }
    } catch (err) {
      logger.error({ err }, "chat-ws main loop error");
    }

    // ── Cleanup ───────────────────────────────────────────────────────────
    try {
      send(ws, { type: "system", text: "Session ended." });
    } catch {
      // ws may already be closed
    }

    try {
      ws.close(1000, "Session ended");
    } catch {
      // already closed
    }
  })().catch((err) => {
    logger.error({ err }, "chat-ws unhandled error");
    try {
      ws.close(1011, "Internal error");
    } catch {
      // ignore
    }
  });
}

// ── Utility helpers ─────────────────────────────────────────────────────────

/** Type-safe send: serializes WsServerMessage to JSON. */
function send(ws: WsSocket, msg: WsServerMessage): void {
  try {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  } catch {
    // swallow write errors on closed sockets
  }
}

/** Wait for the first WS message (used for init handshake). */
function waitForMessage<T>(ws: WsSocket, timeoutMs = 30_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error("Timeout waiting for init message"));
      }
    }, timeoutMs);

    ws.once("message", (data) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        const str = typeof data === "string" ? data : data.toString("utf-8");
        resolve(JSON.parse(str) as T);
      } catch (err) {
        reject(err);
      }
    });

    ws.on("close", () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error("WebSocket closed before init message"));
      }
    });
  });
}

// ── Exported WS server factory ──────────────────────────────────────────────

/**
 * Create a noServer WebSocketServer for the chat endpoint.
 * Returns the WSS instance to be used with handleUpgrade.
 */
export function createChatWebSocketServer(): WsServer {
  return new WebSocketServer({ noServer: true });
}

export { WebSocket };
export type { WsSocket, WsServer };
