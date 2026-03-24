/**
 * sessions.ts — REST endpoints for Chat sessions
 *
 * Mirrors the Python backend's /sessions endpoints so the React UI
 * can talk to whichever backend is active.
 *
 * Prefix: /chat/api  (applied externally when mounting)
 */

import { Router } from "express";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import {
  createSession,
  loadSession,
  listSessions,
  type SessionListItem,
} from "../session-store.js";
import type { ChatMessage } from "../types.js";

// ── Hidden-sessions helpers ─────────────────────────────────────────────────

async function loadHidden(projectRoot: string): Promise<Set<string>> {
  const filePath = path.join(projectRoot, "hidden_sessions.json");
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const arr = JSON.parse(raw) as string[];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

async function saveHidden(
  projectRoot: string,
  ids: Set<string>,
): Promise<void> {
  const filePath = path.join(projectRoot, "hidden_sessions.json");
  const sorted = [...ids].sort();
  await fs.writeFile(filePath, JSON.stringify(sorted), "utf-8");
}

// ── Session config helpers ──────────────────────────────────────────────────

interface SessionConfig {
  topic?: string;
  workspace_id?: string | null;
}

async function loadSessionConfig(
  historyDir: string,
  sessionId: string,
): Promise<SessionConfig> {
  const filePath = path.join(historyDir, sessionId, "session_config.json");
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as SessionConfig;
  } catch {
    return {};
  }
}

async function saveSessionConfig(
  historyDir: string,
  sessionId: string,
  config: SessionConfig,
): Promise<void> {
  const dirPath = path.join(historyDir, sessionId);
  await fs.mkdir(dirPath, { recursive: true });
  const filePath = path.join(dirPath, "session_config.json");
  await fs.writeFile(
    filePath,
    JSON.stringify(config, null, 2),
    "utf-8",
  );
}

// ── Router ──────────────────────────────────────────────────────────────────

export function createSessionRoutes(projectRoot: string): Router {
  const router = Router();
  const historyDir = path.join(projectRoot, "history");

  /**
   * GET /sessions — List sessions with pagination
   * Query: limit (default 50), offset (default 0), workspace_id (optional)
   */
  router.get("/sessions", async (req, res) => {
    try {
      const limit = Math.max(1, parseInt(req.query.limit as string, 10) || 50);
      const offset = Math.max(
        0,
        parseInt(req.query.offset as string, 10) || 0,
      );
      const workspaceFilter = (req.query.workspace_id as string) || undefined;

      const hidden = await loadHidden(projectRoot);

      // Get all sessions from store
      // We fetch a larger set so we can filter hidden/workspace, then paginate
      const all = await listSessions(historyDir, {
        limit: 10_000,
        offset: 0,
      });

      // Enrich with session_config.json data (topic, workspace_id)
      const enriched: Array<
        SessionListItem & { workspace_id?: string | null }
      > = [];

      for (const item of all) {
        if (hidden.has(item.id)) continue;

        const cfg = await loadSessionConfig(historyDir, item.id);

        // Also try extracting workspace_id from first system message
        // (Python stores it on the message itself)
        let workspaceId = cfg.workspace_id ?? undefined;
        if (workspaceId === undefined) {
          try {
            const raw = await fs.readFile(
              path.join(historyDir, item.id, "messages.json"),
              "utf-8",
            );
            const msgs = JSON.parse(raw) as ChatMessage[];
            const sysMsg = msgs.find((m) => m.type === "system");
            if (sysMsg && "workspace_id" in sysMsg) {
              workspaceId = (sysMsg as any).workspace_id ?? undefined;
            }
          } catch {
            // ignore
          }
        }

        // Apply workspace filter
        if (workspaceFilter && workspaceId !== workspaceFilter) continue;

        enriched.push({
          ...item,
          topic: cfg.topic ?? item.topic,
          workspace_id: workspaceId ?? null,
        });
      }

      const total = enriched.length;
      const page = enriched.slice(offset, offset + limit);

      res.json({ sessions: page, total, offset, limit });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Internal error" });
    }
  });

  /**
   * POST /sessions — Create an empty session
   */
  router.post("/sessions", async (_req, res) => {
    try {
      const id = await createSession(historyDir);
      res.json({ id });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Internal error" });
    }
  });

  /**
   * GET /sessions/:id — Get all messages in a session
   * Returns ChatMessage[] (raw array).
   */
  router.get("/sessions/:id", async (req, res) => {
    try {
      const sessionId = req.params.id;
      const messages = await loadSession(historyDir, sessionId);
      res.json(messages);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Internal error" });
    }
  });

  /**
   * DELETE /sessions/:id — Hide (soft-delete) a session
   */
  router.delete("/sessions/:id", async (req, res) => {
    try {
      const sessionId = req.params.id;
      const hidden = await loadHidden(projectRoot);
      hidden.add(sessionId);
      await saveHidden(projectRoot, hidden);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Internal error" });
    }
  });

  /**
   * PUT /sessions/:id/topic — Rename session topic
   * Body: { topic: string }
   *
   * Updates both session_config.json and the first system message text
   * (for backward compat with Python backend).
   */
  router.put("/sessions/:id/topic", async (req, res) => {
    try {
      const sessionId = req.params.id;
      const newTopic = ((req.body as any)?.topic ?? "").trim();
      if (!newTopic) {
        res.status(400).json({ error: "topic required" });
        return;
      }

      const msgPath = path.join(historyDir, sessionId, "messages.json");
      try {
        await fs.access(msgPath);
      } catch {
        res.status(404).json({ error: "Session not found" });
        return;
      }

      // Update session_config.json
      const cfg = await loadSessionConfig(historyDir, sessionId);
      cfg.topic = newTopic;
      await saveSessionConfig(historyDir, sessionId, cfg);

      // Also update first system message (Python compat)
      try {
        const raw = await fs.readFile(msgPath, "utf-8");
        const msgs = JSON.parse(raw) as ChatMessage[];
        const sysMsg = msgs.find((m) => m.type === "system");
        if (sysMsg) {
          sysMsg.text = `Topic: ${newTopic}`;
          await fs.writeFile(
            msgPath,
            JSON.stringify(msgs, null, 2),
            "utf-8",
          );
        }
      } catch {
        // Best-effort; session_config is the source of truth going forward
      }

      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Internal error" });
    }
  });

  /**
   * PUT /sessions/:id/workspace — Assign workspace to session
   * Body: { workspace_id: string | null }
   */
  router.put("/sessions/:id/workspace", async (req, res) => {
    try {
      const sessionId = req.params.id;
      const workspaceId: string | null =
        (req.body as any)?.workspace_id ?? null;

      const msgPath = path.join(historyDir, sessionId, "messages.json");
      try {
        await fs.access(msgPath);
      } catch {
        res.status(404).json({ error: "Session not found" });
        return;
      }

      // Update session_config.json
      const cfg = await loadSessionConfig(historyDir, sessionId);
      cfg.workspace_id = workspaceId;
      await saveSessionConfig(historyDir, sessionId, cfg);

      // Also update all messages (Python compat — stamps workspace_id on each msg)
      try {
        const raw = await fs.readFile(msgPath, "utf-8");
        const msgs = JSON.parse(raw) as Record<string, unknown>[];
        for (const m of msgs) {
          m.workspace_id = workspaceId;
        }
        await fs.writeFile(
          msgPath,
          JSON.stringify(msgs, null, 2),
          "utf-8",
        );
      } catch {
        // Best-effort
      }

      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Internal error" });
    }
  });

  return router;
}
