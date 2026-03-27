/**
 * conversation-engine.ts — Multi-agent turn scheduling
 *
 * Handles:
 * - Round-robin base order
 * - @mention: jump an agent to front, drop rest of current round,
 *   next cycle starts with that agent
 * - Probabilistic silence: N > 2 agents may randomly pass a turn;
 *   each consecutive pass increases speaking probability next time
 */

export interface ChatAgent {
  name: string;
  [key: string]: unknown;
}

export interface ConversationEngineOptions {
  silence?: boolean;
}

export class ConversationEngine {
  /**
   * Manages who speaks next in a multi-agent conversation.
   *
   * Usage:
   *   const engine = new ConversationEngine(agents);
   *   const agent  = engine.nextSpeaker();        // normal turn
   *   const target = engine.onMention("Claude");   // @Claude jumps queue
   *   engine.onHuman();                            // human spoke, reset order
   */

  private agents: ChatAgent[];
  private silence: boolean;
  private _baseOrder: ChatAgent[];
  private _queue: ChatAgent[];
  private _nextOrder: ChatAgent[] | null;
  private _passCounts: Map<string, number>;
  private _spokeAlone: Map<string, number>;
  private _speakersThisCycle: Set<string>;

  constructor(agents: ChatAgent[], options?: ConversationEngineOptions) {
    if (agents.length === 0) {
      throw new Error("At least one agent required");
    }
    this.agents = [...agents];
    this.silence = options?.silence ?? false;
    this._baseOrder = [...agents];
    this._queue = [...agents];
    this._nextOrder = null;
    this._passCounts = new Map(agents.map((a) => [a.name, 0]));
    this._spokeAlone = new Map(agents.map((a) => [a.name, 0]));
    this._speakersThisCycle = new Set();
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Return the next agent to speak.
   *
   * Applies probabilistic silence: agents may pass their turn.
   * Each consecutive pass halves the pass probability so no agent
   * stays silent indefinitely. With <= 2 agents nobody ever passes.
   */
  nextSpeaker(): ChatAgent {
    const n = this.agents.length;

    for (let i = 0; i < n; i++) {
      const agent = this._popFromQueue();
      if (!this._shouldPass(agent, n)) {
        this._passCounts.set(agent.name, 0);
        this._speakersThisCycle.add(agent.name);
        return agent;
      }
      this._passCounts.set(agent.name, (this._passCounts.get(agent.name) ?? 0) + 1);
    }

    // Everyone passed — force the first agent in base order (safety net)
    const agent = this._baseOrder[0];
    this._passCounts.set(agent.name, 0);
    this._speakersThisCycle.add(agent.name);
    this._queue = this._baseOrder.slice(1);
    return agent;
  }

  /**
   * Handle @AgentName typed by the human.
   *
   * - Drops the rest of the current round.
   * - Returns the target agent (caller should use it as the immediate speaker).
   * - Sets the *next* cycle order to [target] + rest_in_base_order.
   * - Returns null if no agent with that name exists.
   *
   * Example (base order A B C D E F, human @C mid-round):
   *   immediate speaker  -> C
   *   next cycle order   -> C A B D E F
   *   cycle after that   -> A B C D E F  (base)
   */
  onMention(agentName: string): ChatAgent | null {
    const target = this.agents.find(
      (a) => a.name.toLowerCase() === agentName.toLowerCase(),
    ) ?? null;

    if (target === null) {
      return null;
    }

    const others = this._baseOrder.filter((a) => a.name !== target.name);
    this._queue = []; // drop rest of current round
    this._nextOrder = [target, ...others]; // one-time reorder
    this._passCounts = new Map(this.agents.map((a) => [a.name, 0]));
    this._speakersThisCycle = new Set();
    return target;
  }

  /**
   * Add an agent mid-session. Returns false if already present.
   * The agent is appended to base_order and queued for the current cycle.
   */
  addAgent(agent: ChatAgent): boolean {
    if (this.agents.some((a) => a.name === agent.name)) {
      return false;
    }
    this.agents.push(agent);
    this._baseOrder.push(agent);
    this._passCounts.set(agent.name, 0);
    this._spokeAlone.set(agent.name, 0);
    // Also append to the current queue so the new agent can speak this cycle
    this._queue.push(agent);
    return true;
  }

  /**
   * Remove an agent mid-session. Returns false if not found.
   * Drops the agent from every internal list immediately.
   */
  removeAgent(agentName: string): boolean {
    if (!this.agents.some((a) => a.name === agentName)) {
      return false;
    }
    this.agents = this.agents.filter((a) => a.name !== agentName);
    this._baseOrder = this._baseOrder.filter((a) => a.name !== agentName);
    this._queue = this._queue.filter((a) => a.name !== agentName);
    if (this._nextOrder !== null) {
      this._nextOrder = this._nextOrder.filter((a) => a.name !== agentName);
    }
    this._passCounts.delete(agentName);
    this._spokeAlone.delete(agentName);
    this._speakersThisCycle.delete(agentName);
    return true;
  }

  /**
   * Human spoke without @: end the current round and resume
   * from base order on the next cycle.
   */
  onHuman(): void {
    this._queue = [];
    this._nextOrder = null;
    this._passCounts = new Map(this.agents.map((a) => [a.name, 0]));
    this._speakersThisCycle = new Set();
  }

  /**
   * Extract the first @AgentName from a human message.
   * If agents list is provided, matches against known names (longest first)
   * to avoid eating Chinese particles (e.g. @小黑的意見 -> 小黑, not 小黑的意見).
   * Returns the name string or null.
   */
  static extractMention(text: string, agents?: ChatAgent[]): string | null {
    if (agents && agents.length > 0) {
      // Sort by name length descending for longest match
      const sorted = [...agents].sort((a, b) => b.name.length - a.name.length);
      for (const agent of sorted) {
        const escaped = agent.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(`@${escaped}`, "i");
        if (regex.test(text)) {
          return agent.name;
        }
      }
      return null;
    }
    const m = text.match(/@(\w+)/);
    return m ? m[1] : null;
  }

  // ── Internal helpers ─────────────────────────────────────────────────────────

  private _popFromQueue(): ChatAgent {
    if (this._queue.length === 0) {
      // Cycle just ended — update spoke_alone penalties
      this._endCycle();
      const order = this._nextOrder !== null ? this._nextOrder : this._baseOrder;
      this._queue = [...order];
      this._nextOrder = null;
    }
    return this._queue.shift()!;
  }

  private _endCycle(): void {
    /** Called when a cycle completes. Penalise agents that spoke alone. */
    const soleSpeaker =
      this._speakersThisCycle.size === 1 && this.agents.length > 1;

    for (const a of this.agents) {
      if (soleSpeaker && this._speakersThisCycle.has(a.name)) {
        this._spokeAlone.set(a.name, (this._spokeAlone.get(a.name) ?? 0) + 1);
      } else {
        this._spokeAlone.set(a.name, 0);
      }
    }
    this._speakersThisCycle = new Set();
  }

  private _shouldPass(agent: ChatAgent, total: number): boolean {
    /**
     * Probabilistic silence rules:
     *   - 1-2 agents : never pass
     *   - 3 agents   : ~15% base pass chance
     *   - N agents   : up to ~35% base pass chance (grows with N)
     *
     * Modifiers:
     *   - Each consecutive pass halves pass probability (agent speaks eventually).
     *   - Each round the agent spoke alone adds +20% pass penalty (max +60%),
     *     so monopolisers are quieter next time.
     */
    if (!this.silence || total <= 2) {
      return false;
    }
    const base = Math.min(0.35, ((total - 2) / total) * 0.5);
    const passes = this._passCounts.get(agent.name) ?? 0;
    const alone = this._spokeAlone.get(agent.name) ?? 0;
    // Consecutive passes -> easier to speak; spoke alone -> harder to speak
    const prob = base * Math.pow(0.5, passes) + Math.min(0.6, alone * 0.2);
    return Math.random() < Math.min(prob, 0.85); // cap at 85% so agent can still speak
  }
}
