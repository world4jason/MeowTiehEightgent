/**
 * history-manager.ts — History summarization utilities for the Node.js chat backend.
 *
 * Mirrors the Python `history_manager.py` logic for reading cached summaries.
 * The actual summarization (compress_history) is a stub for now.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SessionSummary {
  summary_text?: string;
  covered_message_count?: number;
  total_message_count?: number;
  updated_at?: string;
  failed?: boolean;
  failed_at?: string;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Read `history/{sessionId}/summary.json` and return the cached summary,
 * or null if the file does not exist or is malformed.
 */
export async function getSessionSummary(
  historyDir: string,
  sessionId: string,
): Promise<SessionSummary | null> {
  const summaryPath = path.join(historyDir, sessionId, "summary.json");
  try {
    const raw = await fs.readFile(summaryPath, "utf-8");
    return JSON.parse(raw) as SessionSummary;
  } catch {
    return null;
  }
}

/**
 * Re-compress a session's history.
 *
 * Stub implementation: returns the existing cached summary without
 * performing actual re-summarization. A future version will call
 * a summarization model (similar to Python's compress_history).
 */
export async function recompressSession(
  historyDir: string,
  sessionId: string,
): Promise<SessionSummary | null> {
  return getSessionSummary(historyDir, sessionId);
}
