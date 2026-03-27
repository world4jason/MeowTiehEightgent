/**
 * marketplace.ts — REST endpoints for agent marketplace (browse + install)
 *
 * Mirrors the Python backend's /marketplace/agents endpoints.
 * Marketplace templates live in `marketplace/{id}/config.json + AGENT.md + IDENTITY.md + SOUL.md`.
 * Install forks a template into `agents/{uuid-prefix}-{name}/`.
 *
 * Prefix: /chat/api  (applied externally when mounting)
 */

import { Router } from "express";
import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

// ── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_MEMORY_MD =
  "# MEMORY.md - Long-Term Memory\n\n_Sessions will be recorded here._\n";

// ── Agent-name resolution helpers ───────────────────────────────────────────

/**
 * Get a set of display names for all installed agents.
 * Handles both v0 (folder name) and v1 (config.name field).
 */
async function getInstalledAgentNames(
  agentsDir: string,
): Promise<Set<string>> {
  const names = new Set<string>();
  let entries: string[];
  try {
    entries = await fs.readdir(agentsDir);
  } catch {
    return names;
  }
  for (const entry of entries) {
    if (entry.startsWith("_") || entry.startsWith(".")) continue;
    const dir = path.join(agentsDir, entry);
    const stat = await fs.stat(dir).catch(() => null);
    if (!stat?.isDirectory()) continue;
    const configPath = path.join(dir, "config.json");
    try {
      const raw = await fs.readFile(configPath, "utf-8");
      const cfg = JSON.parse(raw) as Record<string, unknown>;
      names.add((cfg.name as string) ?? entry);
    } catch {
      names.add(entry);
    }
  }
  return names;
}

/**
 * Find an agent folder by display name.
 * Returns the directory path or null.
 */
async function findAgentDir(
  agentsDir: string,
  name: string,
): Promise<string | null> {
  if (name === "_default") {
    const p = path.join(agentsDir, "_default");
    return fsSync.existsSync(p) ? p : null;
  }
  let entries: string[];
  try {
    entries = await fs.readdir(agentsDir);
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (entry.startsWith("_") || entry.startsWith("Default_")) continue;
    const dir = path.join(agentsDir, entry);
    const stat = await fs.stat(dir).catch(() => null);
    if (!stat?.isDirectory()) continue;
    const configPath = path.join(dir, "config.json");
    try {
      const raw = await fs.readFile(configPath, "utf-8");
      const cfg = JSON.parse(raw) as Record<string, unknown>;
      if ("name" in cfg) {
        if (cfg.name === name) return dir;
      } else {
        if (entry === name) return dir;
      }
    } catch {
      if (entry === name) return dir;
    }
  }
  return null;
}

/** Read a text file, returning "" if it does not exist. */
async function readTextOrEmpty(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return "";
  }
}

// ── Router ──────────────────────────────────────────────────────────────────

export function createMarketplaceRoutes(projectRoot: string): Router {
  const router = Router();
  const marketplaceDir = path.join(projectRoot, "marketplace");
  const agentsDir = path.join(projectRoot, "agents");

  // ── GET /marketplace/agents ───────────────────────────────────────────────
  router.get("/marketplace/agents", async (_req, res) => {
    try {
      let entries: string[];
      try {
        entries = await fs.readdir(marketplaceDir);
      } catch {
        res.json([]);
        return;
      }

      entries.sort();
      const installedNames = await getInstalledAgentNames(agentsDir);
      const result: Array<Record<string, unknown>> = [];

      for (const entry of entries) {
        const dir = path.join(marketplaceDir, entry);
        const stat = await fs.stat(dir).catch(() => null);
        if (!stat?.isDirectory()) continue;

        const configPath = path.join(dir, "config.json");
        try {
          const raw = await fs.readFile(configPath, "utf-8");
          const cfg = JSON.parse(raw) as Record<string, unknown>;
          result.push({
            id: entry,
            emoji: cfg.emoji ?? "\u{1F916}",
            color: cfg.color ?? "#888",
            description: cfg.description ?? "",
            installed: installedNames.has(entry),
          });
        } catch {
          // skip dirs without valid config
        }
      }

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Internal error" });
    }
  });

  // ── GET /marketplace/agents/:id ──────────────────────────────────────────
  router.get("/marketplace/agents/:id", async (req, res) => {
    try {
      const agentId = req.params.id;
      const dir = path.join(marketplaceDir, agentId);

      const stat = await fs.stat(dir).catch(() => null);
      if (!stat?.isDirectory()) {
        res.status(404).json({ error: "Agent not found in marketplace" });
        return;
      }

      let cfg: Record<string, unknown> = {};
      try {
        const raw = await fs.readFile(
          path.join(dir, "config.json"),
          "utf-8",
        );
        cfg = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        // empty config
      }

      const installed = (await findAgentDir(agentsDir, agentId)) !== null;

      res.json({
        id: agentId,
        emoji: cfg.emoji ?? "\u{1F916}",
        color: cfg.color ?? "#888",
        description: cfg.description ?? "",
        agent_md: await readTextOrEmpty(path.join(dir, "AGENT.md")),
        identity_md: await readTextOrEmpty(path.join(dir, "IDENTITY.md")),
        soul_md: await readTextOrEmpty(path.join(dir, "SOUL.md")),
        installed,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Internal error" });
    }
  });

  // ── POST /marketplace/agents/:id/install — Fork to agents/ ───────────────
  router.post("/marketplace/agents/:id/install", async (req, res) => {
    try {
      const agentId = req.params.id;
      const src = path.join(marketplaceDir, agentId);

      const stat = await fs.stat(src).catch(() => null);
      if (!stat?.isDirectory()) {
        res.status(404).json({ error: "Agent not found in marketplace" });
        return;
      }

      const body = (req.body ?? {}) as Record<string, unknown>;
      const destName = ((body.name as string) ?? agentId).trim();
      if (!destName) {
        res.status(400).json({ error: "Name cannot be empty" });
        return;
      }

      // Check if agent with this display name already exists
      if ((await findAgentDir(agentsDir, destName)) !== null) {
        res
          .status(409)
          .json({ error: `Agent '${destName}' already exists` });
        return;
      }

      // Generate UUID and create v1 folder
      const newAgentId = randomUUID();
      const shortId = newAgentId.slice(0, 8);
      const folderName = `${shortId}-${destName}`;
      const dst = path.join(agentsDir, folderName);

      await fs.mkdir(dst, { recursive: true });
      await fs.mkdir(path.join(dst, "memory"), { recursive: true });

      // Copy markdown files
      for (const fname of ["AGENT.md", "IDENTITY.md", "SOUL.md"]) {
        const srcFile = path.join(src, fname);
        if (fsSync.existsSync(srcFile)) {
          await fs.copyFile(srcFile, path.join(dst, fname));
        }
      }

      // Merge marketplace config into v1 format
      let mktCfg: Record<string, unknown> = {};
      try {
        const raw = await fs.readFile(
          path.join(src, "config.json"),
          "utf-8",
        );
        mktCfg = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        // empty
      }

      const cfg = {
        configVersion: 1,
        id: newAgentId,
        name: destName,
        role: mktCfg.role ?? "",
        title: mktCfg.title ?? "",
        emoji: mktCfg.emoji ?? "\u{1F916}",
        color: mktCfg.color ?? "#888",
        description: mktCfg.description ?? "",
        enabled: true,
        adapter:
          (body.model as string) ??
          (mktCfg.adapter as string) ??
          (mktCfg.model as string) ??
          "",
        adapterConfig: mktCfg.adapterConfig ?? {},
        model_tiers: mktCfg.model_tiers ?? null,
        skills: mktCfg.skills ?? [],
        reportsTo: mktCfg.reportsTo ?? null,
        permissions: mktCfg.permissions ?? {},
        budget: mktCfg.budget ?? {},
        heartbeat: mktCfg.heartbeat ?? null,
      };

      await fs.writeFile(
        path.join(dst, "config.json"),
        JSON.stringify(cfg, null, 2),
        "utf-8",
      );
      await fs.writeFile(
        path.join(dst, "MEMORY.md"),
        DEFAULT_MEMORY_MD,
        "utf-8",
      );

      res.json({ ok: true, name: destName, id: newAgentId });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Internal error" });
    }
  });

  return router;
}
