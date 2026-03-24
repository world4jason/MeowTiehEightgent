# Chat Migration Phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the Chat conversation engine and WebSocket handler to Node.js, so chat can run on the unified Mth server. Python backend continues serving REST endpoints during transition.

**Architecture:** Port conversation_engine.py to TypeScript as a clean module. Create a Chat WebSocket endpoint in the Mth Express server that uses the ported engine + Mth's existing adapter system for subprocess execution. Port build_prompt and session management. Python REST endpoints remain as-is (strangler fig — they'll be ported in Plan B2).

**Tech Stack:** TypeScript, Node.js, Express, ws (WebSocket), child_process

**Spec:** `docs/superpowers/specs/2026-03-24-backend-merge-design.md`
**Depends on:** Plan A (Foundation) — completed

---

## Scope

**In scope (this plan):**
- ConversationEngine → TypeScript
- Chat WebSocket endpoint in Mth server
- build_prompt → TypeScript
- stream_cli_agent → TypeScript (reusing patterns from Mth adapters)
- Session/history file I/O (read/write messages.json)

**Out of scope (Plan B2):**
- REST endpoint migration (agents, models, skills, workspaces, scenarios, marketplace)
- History compression/summarization (history_manager.py)
- UI switching (chatClient → api)
- Retiring Python backend

---

## File Structure

### New Files
- `server/src/chat/conversation-engine.ts` — Ported ConversationEngine class
- `server/src/chat/conversation-engine.test.ts` — Unit tests
- `server/src/chat/build-prompt.ts` — Prompt assembly for chat agents
- `server/src/chat/stream-agent.ts` — CLI/API agent subprocess streaming
- `server/src/chat/session-store.ts` — File-based session/history I/O
- `server/src/chat/chat-ws.ts` — WebSocket endpoint handler
- `server/src/chat/types.ts` — Chat-specific TypeScript types

### Modified Files
- `server/src/app.ts` — Mount chat WebSocket route
- `server/src/index.ts` — Enable chat WS in startup

---

## Task 1: ConversationEngine → TypeScript

**Files:**
- Create: `server/src/chat/conversation-engine.ts`
- Create: `server/src/chat/conversation-engine.test.ts`

Port the Python ConversationEngine class (200 lines) to TypeScript. This is a pure logic module with no I/O dependencies — clean port.

### Key behaviors to preserve:
- Round-robin turn scheduling
- @mention: jump agent to front, drop rest of round, next cycle starts from mentioned agent
- Probabilistic silence: ≤2 agents never pass, 3+ agents have base pass chance
- Pass count decay (consecutive passes halve pass probability)
- Spoke-alone penalty (+20% pass per consecutive solo round, max 60%)
- add_agent / remove_agent mid-session
- on_human resets order
- extract_mention static method (with longest-match for CJK names)

### Interface:
```typescript
interface ChatAgent {
  name: string;
  [key: string]: unknown;
}

class ConversationEngine {
  constructor(agents: ChatAgent[], options?: { silence?: boolean });
  nextSpeaker(): ChatAgent;
  onMention(agentName: string): ChatAgent | null;
  onHuman(): void;
  addAgent(agent: ChatAgent): boolean;
  removeAgent(agentName: string): boolean;
  static extractMention(text: string, agents?: ChatAgent[]): string | null;
}
```

### Tests (port from Python behavior):
- [ ] test_round_robin — agents cycle in order
- [ ] test_mention_jumps_queue — @agent reorders
- [ ] test_mention_next_cycle — cycle after mention returns to base+mentioned-first
- [ ] test_on_human_resets — human message resets to base order
- [ ] test_add_agent — new agent joins mid-session
- [ ] test_remove_agent — agent leaves mid-session
- [ ] test_silence_never_with_two — ≤2 agents never pass
- [ ] test_extract_mention — @Name extraction
- [ ] test_extract_mention_longest_match — CJK longest match
- [ ] test_everyone_passes_safety — force first agent if all pass

- [ ] **Step 1:** Write test file with all 10 tests
- [ ] **Step 2:** Run tests, verify they fail
- [ ] **Step 3:** Implement ConversationEngine
- [ ] **Step 4:** Run tests, verify all pass
- [ ] **Step 5:** Commit

---

## Task 2: Chat Types + Session Store

**Files:**
- Create: `server/src/chat/types.ts`
- Create: `server/src/chat/session-store.ts`

### types.ts
```typescript
export interface ChatMessage {
  type: "message" | "system";
  agent: string;          // agent name or "Human"
  text: string;
  timestamp: string;      // ISO
  color?: string;
  skill?: string;
  images?: string[];
  mode?: "chat" | "think";
  duration_ms?: number;
  usage?: { input: number; output: number; cached?: number };
}

export interface ChatSession {
  id: string;
  messages: ChatMessage[];
  workspaceId?: string | null;
  topic?: string;
}

export interface WsInitMessage {
  topic: string;
  agents: string[];
  auto?: boolean;
  rounds?: number;
  silence?: boolean;
  resume_from?: string;
  workspace_id?: string;
  scenario_id?: string;
  blank_mode?: boolean;
}
```

### session-store.ts
File-based session store — reads/writes to `history/{session_id}/messages.json`. Port from Python's session handling:
- `loadSession(sessionId)` → ChatMessage[]
- `saveMessage(sessionId, message)` → append to messages.json
- `createSession()` → new session ID (timestamp_uuid format)
- `listSessions(limit, offset)` → session list with first message preview

- [ ] **Step 1:** Write types.ts
- [ ] **Step 2:** Write session-store.ts with tests
- [ ] **Step 3:** Run tests
- [ ] **Step 4:** Commit

---

## Task 3: build-prompt → TypeScript

**Files:**
- Create: `server/src/chat/build-prompt.ts`

Port Python's build_prompt() function. Assembles the full prompt sent to each agent:
1. Mode prefix (chat: concise instructions, think: normal)
2. Context injection (scenario > workspace > blank)
3. Workspace system_prompt + injected files (up to 50KB)
4. AGENT.md content
5. IDENTITY.md content
6. SOUL.md content
7. USER.md content
8. Today's memory file
9. Agent skills
10. Dynamic participants header
11. Full history text
12. Continuation hint

The function reads markdown files from the agent's folder and constructs a single prompt string.

- [ ] **Step 1:** Write build-prompt.ts
- [ ] **Step 2:** Write basic tests (mock file system)
- [ ] **Step 3:** Run tests
- [ ] **Step 4:** Commit

---

## Task 4: stream-agent → TypeScript

**Files:**
- Create: `server/src/chat/stream-agent.ts`

Port stream_cli_agent and stream_api_agent. Uses child_process.spawn to run CLI agents (claude, gemini, codex) and streams output.

### Key behaviors:
- Spawn subprocess with agent's cmd + prompt
- Stream stdout chunks as they arrive
- Handle JSON output mode (stream-json for token tracking)
- Idle timeout (no output for N seconds → TimeoutError)
- Startup timeout (no initial output → StartupError)
- Graceful error handling (partial output preserved)
- Image file injection (--add-file flag)
- Token usage tracking (TokenUsage sentinel)

### Interface:
```typescript
async function* streamAgent(
  agent: MergedAgent,
  prompt: string,
  options?: {
    images?: string[];
    onThinking?: () => void;
  }
): AsyncGenerator<string | TokenUsage>;
```

Uses adapter_presets for command resolution (same merge logic as Python).

- [ ] **Step 1:** Write stream-agent.ts
- [ ] **Step 2:** Write tests (mock subprocess)
- [ ] **Step 3:** Run tests
- [ ] **Step 4:** Commit

---

## Task 5: Chat WebSocket Endpoint

**Files:**
- Create: `server/src/chat/chat-ws.ts`
- Modify: `server/src/app.ts` — mount WS route
- Modify: `server/src/index.ts` — enable chat WS

The main WebSocket handler. Port from Python's `/ws` endpoint.

### Connection lifecycle:
1. Client connects to `/chat/ws`
2. Client sends init JSON (WsInitMessage)
3. Server loads/creates session, builds ConversationEngine
4. Main loop: nextSpeaker → buildPrompt → streamAgent → send chunks
5. Handle human messages (buffer if agent is streaming)
6. Handle add_agent / remove_agent events
7. Handle mode toggle (chat/think)
8. Handle @mention reordering

### WS message types (server → client):
- `thinking` — agent is about to speak
- `stream_start` — streaming begins
- `chunk` — text chunk from agent
- `message_end` — agent finished, includes token usage
- `token_update` — cumulative token counts
- `ready` — waiting for human input
- `system` — system notification
- `agent_error` — agent subprocess error

### WS message types (client → server):
- `human` — user message with optional images
- `set_mode` — toggle chat/think mode
- `add_agent` / `remove_agent`
- `stop` — interrupt agent
- `next` — resume paused session

- [ ] **Step 1:** Write chat-ws.ts with full WebSocket handler
- [ ] **Step 2:** Mount in app.ts at path `/chat/ws`
- [ ] **Step 3:** Add project root config for file paths (agents/, history/, etc.)
- [ ] **Step 4:** Test manually: connect via wscat or browser
- [ ] **Step 5:** Commit

---

## Task 6: Integration & Verification

- [ ] **Step 1:** Start Mth server with `pnpm dev:server`
- [ ] **Step 2:** Connect to `ws://localhost:3100/chat/ws` with test client
- [ ] **Step 3:** Send init message with agents list
- [ ] **Step 4:** Send a human message
- [ ] **Step 5:** Verify agent responds with streaming chunks
- [ ] **Step 6:** Verify session saved to history/ folder
- [ ] **Step 7:** Commit any fixes
