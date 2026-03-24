/**
 * session-store.ts — File-based session/history I/O
 *
 * Ported from Python backend (app.py). Both servers share the same
 * history/{session_id}/messages.json file format on disk.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";

import type { ChatMessage } from "./types.js";

// ── Helpers ─────────────────────────────────────────────────────────────────

function generateSessionId(): string {
  const now = new Date();
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const datePart = [
    now.getFullYear(),
    pad2(now.getMonth() + 1),
    pad2(now.getDate()),
  ].join("-");
  const timePart = [
    pad2(now.getHours()),
    pad2(now.getMinutes()),
    pad2(now.getSeconds()),
  ].join("-");
  const hex = crypto.randomBytes(3).toString("hex"); // 6 hex chars
  return `${datePart}_${timePart}_${hex}`;
}

function messagesPath(historyDir: string, sessionId: string): string {
  return path.join(historyDir, sessionId, "messages.json");
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Create a new session directory with an empty messages.json.
 * Returns the generated session ID (format: YYYY-MM-DD_HH-MM-SS_{6hex}).
 */
export async function createSession(historyDir: string): Promise<string> {
  const id = generateSessionId();
  const sessionDir = path.join(historyDir, id);
  await fs.mkdir(sessionDir, { recursive: true });
  await fs.writeFile(messagesPath(historyDir, id), "[]", "utf-8");
  return id;
}

/**
 * Load all messages from a session's messages.json.
 * Returns an empty array if the session or file does not exist.
 */
export async function loadSession(
  historyDir: string,
  sessionId: string,
): Promise<ChatMessage[]> {
  const filePath = messagesPath(historyDir, sessionId);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as ChatMessage[];
  } catch {
    // File or directory missing → empty session
    return [];
  }
}

/**
 * Append a single message to a session's messages.json.
 * Atomic: reads current messages, appends, writes back.
 * Creates the session directory if it does not exist.
 */
export async function saveMessage(
  historyDir: string,
  sessionId: string,
  message: ChatMessage,
): Promise<void> {
  const sessionDir = path.join(historyDir, sessionId);
  await fs.mkdir(sessionDir, { recursive: true });

  const filePath = messagesPath(historyDir, sessionId);

  // Read existing messages (empty array if file doesn't exist)
  let messages: ChatMessage[];
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    messages = JSON.parse(raw) as ChatMessage[];
  } catch {
    messages = [];
  }

  messages.push(message);

  await fs.writeFile(
    filePath,
    JSON.stringify(messages, null, 2),
    "utf-8",
  );
}

export interface SessionListItem {
  id: string;
  topic?: string;
  first_message?: string;
  timestamp: string;
}

/**
 * List sessions sorted by newest first (by directory mtime).
 * Supports pagination via limit and offset.
 *
 * For each session, reads messages.json to extract the first system
 * message text as the topic/first_message preview.
 */
export async function listSessions(
  historyDir: string,
  options?: { limit?: number; offset?: number },
): Promise<SessionListItem[]> {
  const limit = options?.limit ?? 30;
  const offset = options?.offset ?? 0;

  // Read all entries in the history directory
  let entries: string[];
  try {
    entries = await fs.readdir(historyDir);
  } catch {
    return [];
  }

  // Filter to directories that contain messages.json, collect with mtime
  const sessions: { id: string; mtime: number }[] = [];
  for (const entry of entries) {
    const msgPath = messagesPath(historyDir, entry);
    try {
      const stat = await fs.stat(msgPath);
      if (stat.isFile()) {
        sessions.push({ id: entry, mtime: stat.mtimeMs });
      }
    } catch {
      // No messages.json → skip
    }
  }

  // Sort by mtime descending (newest first)
  sessions.sort((a, b) => b.mtime - a.mtime);

  // Paginate
  const page = sessions.slice(offset, offset + limit);

  // Build result with first_message preview
  const results: SessionListItem[] = [];
  for (const { id, mtime } of page) {
    try {
      const raw = await fs.readFile(messagesPath(historyDir, id), "utf-8");
      const msgs = JSON.parse(raw) as ChatMessage[];
      const sysMsg = msgs.find((m) => m.type === "system");
      results.push({
        id,
        first_message: sysMsg ? sysMsg.text.slice(0, 60) : undefined,
        timestamp: new Date(mtime).toISOString(),
      });
    } catch {
      results.push({
        id,
        timestamp: new Date(mtime).toISOString(),
      });
    }
  }

  return results;
}
