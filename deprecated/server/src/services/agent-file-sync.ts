/**
 * agent-file-sync.ts
 *
 * Startup sync: scans agents/{folder}/ directories and upserts records into the
 * DB `agents` table so that Mth's relational model has rows for every
 * file-managed agent the Chat backend knows about.
 *
 * Designed to run once at server startup, after migrations are applied.
 */

import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { eq, and } from "drizzle-orm";
import type { Db } from "@meowtieheightgent/db";
import { agents, companies } from "@meowtieheightgent/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape of an agent's config.json (v1, configVersion === 1). */
interface AgentFileConfigV1 {
  configVersion: 1;
  id: string;
  name: string;
  role?: string;
  title?: string;
  emoji?: string;
  enabled?: boolean;
  adapter?: string;
  adapterConfig?: Record<string, unknown>;
  instructionsFilePath?: string;
  heartbeat?: Record<string, unknown>;
  skills?: string[];
  permissions?: Record<string, unknown>;
  budget?: number;
  description?: string;
  reportsTo?: string | null;
}

/** Shape of the project-root config.json (the part we care about). */
interface ProjectConfig {
  company?: {
    id?: string;
    name?: string;
  };
}

interface SyncLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

export interface AgentFileSyncResult {
  upserted: number;
  unmarked: number;
  skipped: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isV1Config(raw: unknown): raw is AgentFileConfigV1 {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return false;
  const obj = raw as Record<string, unknown>;
  return obj.configVersion === 1 && typeof obj.id === "string" && typeof obj.name === "string";
}

function statusFromEnabled(enabled: boolean | undefined): string {
  // Default to idle when not specified. Never override "running"/"error" in the
  // caller — that check happens during the upsert.
  return enabled === false ? "paused" : "idle";
}

function buildAdapterConfig(
  config: AgentFileConfigV1,
  agentFolderPath: string,
): Record<string, unknown> {
  const base: Record<string, unknown> = { ...(config.adapterConfig ?? {}) };

  // Auto-inject the path to the agent's AGENT.md instructions file if it
  // exists on disk but isn't explicitly configured.
  if (!base.instructionsFilePath) {
    const agentMdPath = config.instructionsFilePath
      ? path.resolve(agentFolderPath, config.instructionsFilePath)
      : path.resolve(agentFolderPath, "AGENT.md");
    if (existsSync(agentMdPath)) {
      base.instructionsFilePath = agentMdPath;
    }
  }

  return base;
}

function buildRuntimeConfig(config: AgentFileConfigV1): Record<string, unknown> {
  const rc: Record<string, unknown> = {};
  if (config.heartbeat) rc.heartbeat = config.heartbeat;
  if (config.skills && config.skills.length > 0) rc.desiredSkills = config.skills;
  return rc;
}

// ---------------------------------------------------------------------------
// Core sync
// ---------------------------------------------------------------------------

/**
 * Scans `{projectRoot}/agents/` for v1 config folders and upserts to DB.
 *
 * Agents whose folders no longer exist on disk are marked `fileManaged: false`
 * so they stop being overwritten by future syncs while remaining queryable.
 */
export async function syncAgentFilesToDb(
  db: Db,
  projectRoot: string,
  log: SyncLogger,
): Promise<AgentFileSyncResult> {
  const result: AgentFileSyncResult = { upserted: 0, unmarked: 0, skipped: 0, errors: [] };

  // -----------------------------------------------------------------------
  // 1. Read company id from project config
  // -----------------------------------------------------------------------
  const projectConfigPath = path.resolve(projectRoot, "config.json");
  let companyId: string | undefined;
  let companyName = "Default Company";

  if (existsSync(projectConfigPath)) {
    try {
      const raw = JSON.parse(await readFile(projectConfigPath, "utf-8")) as ProjectConfig;
      companyId = raw.company?.id;
      if (raw.company?.name) companyName = raw.company.name;
    } catch (err) {
      log.warn({ err, path: projectConfigPath }, "Failed to parse project config.json");
    }
  }

  if (!companyId) {
    log.info({}, "agent-file-sync: no company.id in config.json — skipping sync");
    return result;
  }

  // -----------------------------------------------------------------------
  // 2. Ensure company exists
  // -----------------------------------------------------------------------
  const existingCompany = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.id, companyId))
    .then((rows) => rows[0] ?? null);

  if (!existingCompany) {
    await db.insert(companies).values({
      id: companyId,
      name: companyName,
    });
    log.info({ companyId, companyName }, "agent-file-sync: created company");
  }

  // -----------------------------------------------------------------------
  // 3. Scan agents/ directory
  // -----------------------------------------------------------------------
  const agentsDir = path.resolve(projectRoot, "agents");
  if (!existsSync(agentsDir)) {
    log.info({ agentsDir }, "agent-file-sync: agents/ directory does not exist — skipping");
    return result;
  }

  const entries = await readdir(agentsDir, { withFileTypes: true });
  const syncedFileKeys = new Set<string>();

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const folderName = entry.name;

    // Skip _default and Default_* templates
    if (folderName === "_default" || folderName.startsWith("Default_")) {
      result.skipped++;
      continue;
    }

    const configPath = path.join(agentsDir, folderName, "config.json");
    if (!existsSync(configPath)) {
      result.skipped++;
      continue;
    }

    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(configPath, "utf-8"));
    } catch (err) {
      const msg = `Failed to parse ${configPath}: ${err instanceof Error ? err.message : String(err)}`;
      log.warn({ folderName, err }, msg);
      result.errors.push(msg);
      result.skipped++;
      continue;
    }

    if (!isV1Config(raw)) {
      result.skipped++;
      continue;
    }

    const config = raw;
    const agentFolderPath = path.join(agentsDir, folderName);
    const fileKey = folderName;
    syncedFileKeys.add(fileKey);

    try {
      await upsertAgent(db, companyId, config, agentFolderPath, fileKey, log);
      result.upserted++;
    } catch (err) {
      const msg = `Failed to upsert agent ${config.name} (${fileKey}): ${err instanceof Error ? err.message : String(err)}`;
      log.error({ folderName, agentId: config.id, err }, msg);
      result.errors.push(msg);
    }
  }

  // -----------------------------------------------------------------------
  // 4. Mark missing agents as no longer file-managed
  // -----------------------------------------------------------------------
  if (syncedFileKeys.size > 0) {
    const fileKeyArray = Array.from(syncedFileKeys);
    // Find agents that are file-managed but whose fileKey is NOT in the scanned set
    const orphaned = await db
      .select({ id: agents.id, fileKey: agents.fileKey })
      .from(agents)
      .where(
        and(
          eq(agents.companyId, companyId),
          eq(agents.fileManaged, true),
        ),
      )
      .then((rows) =>
        rows.filter((r) => r.fileKey != null && !fileKeyArray.includes(r.fileKey)),
      );

    for (const agent of orphaned) {
      await db
        .update(agents)
        .set({ fileManaged: false, updatedAt: new Date() })
        .where(eq(agents.id, agent.id));
      result.unmarked++;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Upsert a single agent
// ---------------------------------------------------------------------------

async function upsertAgent(
  db: Db,
  companyId: string,
  config: AgentFileConfigV1,
  agentFolderPath: string,
  fileKey: string,
  log: SyncLogger,
): Promise<void> {
  const now = new Date();
  const adapterConfig = buildAdapterConfig(config, agentFolderPath);
  const runtimeConfig = buildRuntimeConfig(config);
  const desiredStatus = statusFromEnabled(config.enabled);

  // Check if agent already exists by id
  const existing = await db
    .select({ id: agents.id, status: agents.status })
    .from(agents)
    .where(eq(agents.id, config.id))
    .then((rows) => rows[0] ?? null);

  if (existing) {
    // Don't overwrite running/error status with idle/paused from file
    const shouldUpdateStatus =
      existing.status !== "running" && existing.status !== "error";

    await db
      .update(agents)
      .set({
        companyId,
        name: config.name,
        role: config.role ?? "general",
        title: config.title ?? null,
        icon: config.emoji ?? null,
        ...(shouldUpdateStatus ? { status: desiredStatus } : {}),
        capabilities: config.description ?? null,
        adapterType: config.adapter ?? "process",
        adapterConfig,
        runtimeConfig,
        budgetMonthlyCents: config.budget ?? 0,
        permissions: config.permissions ?? {},
        reportsTo: config.reportsTo ?? null,
        fileKey,
        fileManaged: true,
        updatedAt: now,
      })
      .where(eq(agents.id, config.id));

    log.info({ agentId: config.id, name: config.name, fileKey }, "agent-file-sync: updated agent");
  } else {
    await db.insert(agents).values({
      id: config.id,
      companyId,
      name: config.name,
      role: config.role ?? "general",
      title: config.title ?? null,
      icon: config.emoji ?? null,
      status: desiredStatus,
      capabilities: config.description ?? null,
      adapterType: config.adapter ?? "process",
      adapterConfig,
      runtimeConfig,
      budgetMonthlyCents: config.budget ?? 0,
      permissions: config.permissions ?? {},
      reportsTo: config.reportsTo ?? null,
      fileKey,
      fileManaged: true,
      createdAt: now,
      updatedAt: now,
    });

    log.info({ agentId: config.id, name: config.name, fileKey }, "agent-file-sync: inserted agent");
  }
}
