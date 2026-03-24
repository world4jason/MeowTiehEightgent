/**
 * chat/routes/agents.ts — REST endpoints for Chat Agent CRUD
 *
 * All routes are mounted under `/chat/api` by the caller.
 * Reads/writes from the file-based `agents/` directory,
 * mirroring the Python backend's agent endpoints.
 */

import { Router } from "express";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { loadChatAgentRegistry, type MergedAgent } from "../chat-ws.js";
import { streamCliAgent, streamApiAgent } from "../stream-agent.js";
import { logger } from "../../middleware/logger.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Find an agent folder by display name.
 *
 * Scans agents/ directory. For v1 configs (has `name` field), matches against
 * the config name. For v0 configs (no `name` field), matches against folder name.
 * Skips _default/ and Default_* folders (unless name === "_default").
 */
async function findAgentDir(
  agentsDir: string,
  name: string,
): Promise<string | null> {
  if (name === "_default") {
    const p = path.join(agentsDir, "_default");
    try {
      const stat = await fs.stat(p);
      return stat.isDirectory() ? p : null;
    } catch {
      return null;
    }
  }

  let entries: string[];
  try {
    entries = await fs.readdir(agentsDir);
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (entry.startsWith("_") || entry.startsWith("Default_")) continue;

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

    let cfg: Record<string, unknown>;
    try {
      cfg = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      continue;
    }

    // v1 config: has `name` field — match against it
    if ("name" in cfg) {
      if (cfg.name === name) return agentDir;
    } else {
      // v0 config: match against folder name
      if (entry === name) return agentDir;
    }
  }

  return null;
}

/**
 * List all skill slugs from the skills/ directory.
 */
async function listSkillSlugs(projectRoot: string): Promise<string[]> {
  const skillsDir = path.join(projectRoot, "skills");
  try {
    const entries = await fs.readdir(skillsDir);
    const slugs: string[] = [];
    for (const entry of entries) {
      const stat = await fs.stat(path.join(skillsDir, entry));
      if (stat.isDirectory()) slugs.push(entry);
    }
    return slugs.sort();
  } catch {
    return [];
  }
}

/**
 * Read an agent markdown file (AGENT.md, IDENTITY.md, SOUL.md).
 * Falls back to direct path for _default or unknown agents.
 */
async function readAgentFile(
  agentsDir: string,
  name: string,
  fname: string,
): Promise<string> {
  let agentDir = await findAgentDir(agentsDir, name);
  if (agentDir === null) {
    // Fallback: try direct path for _default or unknown
    agentDir = path.join(agentsDir, name);
  }

  // Ensure directory and memory subdir exist
  await fs.mkdir(agentDir, { recursive: true });
  await fs.mkdir(path.join(agentDir, "memory"), { recursive: true });

  const filePath = path.join(agentDir, fname);
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return "";
  }
}

/**
 * Write an agent markdown file.
 */
async function writeAgentFile(
  agentsDir: string,
  name: string,
  fname: string,
  content: string,
): Promise<void> {
  let agentDir = await findAgentDir(agentsDir, name);
  if (agentDir === null) {
    agentDir = path.join(agentsDir, name);
  }

  const filePath = path.join(agentDir, fname);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf-8");
}

// ── Router factory ───────────────────────────────────────────────────────────

export function createChatAgentRoutes(projectRoot: string): Router {
  const router = Router();
  const agentsDir = path.join(projectRoot, "agents");

  // ── GET /agents — List all agents ────────────────────────────────────────
  router.get("/agents", async (_req, res) => {
    try {
      const registry = await loadChatAgentRegistry(projectRoot);
      const list = Object.values(registry)
        .filter((a) => {
          const folderName = path.basename(a.workspace);
          return (
            !folderName.startsWith("_") && !folderName.startsWith("Default_")
          );
        })
        .map((a) => ({
          name: a.name,
          emoji: a.emoji ?? "\u{1F916}",
          color: a.color ?? "#888",
          description: (a as Record<string, unknown>).description ?? "",
          enabled: (a as Record<string, unknown>).enabled ?? false,
          adapter: a.adapter ?? "",
          model: (a as Record<string, unknown>).model_id ?? "",
          model_tiers: a.model_tiers ?? null,
          skills: a.skills ?? [],
          role: (a as Record<string, unknown>).role ?? "",
          title: (a as Record<string, unknown>).title ?? "",
          type: a.type ?? "cli",
          source: "chat",
        }));
      res.json(list);
    } catch (err) {
      logger.error({ err }, "Failed to list agents");
      res.status(500).json({ error: "Failed to list agents" });
    }
  });

  // ── GET /agents/:name — Get agent detail ─────────────────────────────────
  router.get("/agents/:name", async (req, res) => {
    try {
      const { name } = req.params;
      const agentDir = await findAgentDir(agentsDir, name);
      if (agentDir === null) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }

      const configPath = path.join(agentDir, "config.json");
      let raw: string;
      try {
        raw = await fs.readFile(configPath, "utf-8");
      } catch {
        res.status(404).json({ error: "Agent not found" });
        return;
      }

      const data = JSON.parse(raw) as Record<string, unknown>;
      data.name = name;

      // Also read markdown files
      const [agentMd, identity, soul] = await Promise.all([
        readAgentFile(agentsDir, name, "AGENT.md"),
        readAgentFile(agentsDir, name, "IDENTITY.md"),
        readAgentFile(agentsDir, name, "SOUL.md"),
      ]);
      data["agent-md"] = agentMd;
      data.identity = identity;
      data.soul = soul;

      res.json(data);
    } catch (err) {
      logger.error({ err }, "Failed to get agent");
      res.status(500).json({ error: "Failed to get agent" });
    }
  });

  // ── POST /agents — Create new agent ──────────────────────────────────────
  router.post("/agents", async (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      const name = (typeof body.name === "string" ? body.name : "").trim();

      // Validate name
      if (!name || /[/\\.\s]/.test(name) || name.length > 64) {
        res
          .status(400)
          .json({ error: "Name required (no slashes, dots, or spaces)" });
        return;
      }

      // Check if agent already exists
      if ((await findAgentDir(agentsDir, name)) !== null) {
        res.status(409).json({ error: "Agent already exists" });
        return;
      }

      // Generate UUID and create v1 folder: {short-uuid-8chars}-{name}/
      const agentId = randomUUID();
      const shortId = agentId.slice(0, 8);
      const folderName = `${shortId}-${name}`;
      const agentDir = path.join(agentsDir, folderName);
      await fs.mkdir(agentDir, { recursive: true });
      await fs.mkdir(path.join(agentDir, "memory"), { recursive: true });

      // Copy template files from _default, substituting {name}
      const defaultDir = path.join(agentsDir, "_default");
      for (const fname of ["AGENT.md", "IDENTITY.md", "SOUL.md", "MEMORY.md"]) {
        const src = path.join(defaultDir, fname);
        const dst = path.join(agentDir, fname);
        try {
          const template = await fs.readFile(src, "utf-8");
          await fs.writeFile(dst, template.replace(/\{name\}/g, name), "utf-8");
        } catch {
          // Template file not found; write default MEMORY.md
          if (fname === "MEMORY.md") {
            await fs.writeFile(
              dst,
              "# MEMORY.md - Long-Term Memory\n\n_Sessions will be recorded here._\n",
              "utf-8",
            );
          }
        }
      }

      // Resolve skills
      const skills =
        body.skills && Array.isArray(body.skills)
          ? (body.skills as string[])
          : await listSkillSlugs(projectRoot);

      // Write v1 config.json
      const config: Record<string, unknown> = {
        configVersion: 1,
        id: agentId,
        name,
        role: body.role ?? "",
        title: body.title ?? "",
        emoji: body.emoji ?? "\u{1F916}",
        color: body.color ?? "#888888",
        description: body.description ?? "",
        enabled: body.enabled ?? false,
        adapter: body.adapter ?? (body.model ?? ""),
        adapterConfig: body.adapterConfig ?? {},
        model_tiers: body.model_tiers ?? null,
        skills,
        reportsTo: body.reportsTo ?? null,
        permissions: body.permissions ?? {},
        budget: body.budget ?? {},
        heartbeat: body.heartbeat ?? null,
      };

      await fs.writeFile(
        path.join(agentDir, "config.json"),
        JSON.stringify(config, null, 2),
        "utf-8",
      );

      res.json({ ok: true, name, id: agentId });
    } catch (err) {
      logger.error({ err }, "Failed to create agent");
      res.status(500).json({ error: "Failed to create agent" });
    }
  });

  // ── PUT /agents/:name — Update agent config ─────────────────────────────
  router.put("/agents/:name", async (req, res) => {
    try {
      const { name } = req.params;
      const agentDir = await findAgentDir(agentsDir, name);
      if (agentDir === null) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }

      const configPath = path.join(agentDir, "config.json");
      let raw: string;
      try {
        raw = await fs.readFile(configPath, "utf-8");
      } catch {
        res.status(404).json({ error: "Agent not found" });
        return;
      }

      const body = req.body as Record<string, unknown>;
      delete body.name; // Don't allow renaming via PUT

      const existing = JSON.parse(raw) as Record<string, unknown>;
      Object.assign(existing, body);

      await fs.writeFile(
        configPath,
        JSON.stringify(existing, null, 2),
        "utf-8",
      );

      res.json({ ok: true });
    } catch (err) {
      logger.error({ err }, "Failed to update agent");
      res.status(500).json({ error: "Failed to update agent" });
    }
  });

  // ── DELETE /agents/:name — Soft delete (enabled: false) ──────────────────
  router.delete("/agents/:name", async (req, res) => {
    try {
      const { name } = req.params;
      const agentDir = await findAgentDir(agentsDir, name);
      if (agentDir !== null) {
        const configPath = path.join(agentDir, "config.json");
        try {
          const raw = await fs.readFile(configPath, "utf-8");
          const data = JSON.parse(raw) as Record<string, unknown>;
          data.enabled = false;
          await fs.writeFile(
            configPath,
            JSON.stringify(data, null, 2),
            "utf-8",
          );
        } catch {
          // config.json doesn't exist or is malformed — skip silently
        }
      }
      res.json({ ok: true });
    } catch (err) {
      logger.error({ err }, "Failed to delete agent");
      res.status(500).json({ error: "Failed to delete agent" });
    }
  });

  // ── GET /agents/:name/agent-md — Get AGENT.md content ───────────────────
  router.get("/agents/:name/agent-md", async (req, res) => {
    try {
      const content = await readAgentFile(agentsDir, req.params.name, "AGENT.md");
      res.json({ content });
    } catch (err) {
      logger.error({ err }, "Failed to read AGENT.md");
      res.status(500).json({ error: "Failed to read AGENT.md" });
    }
  });

  // ── PUT /agents/:name/agent-md — Update AGENT.md ────────────────────────
  router.put("/agents/:name/agent-md", async (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      await writeAgentFile(
        agentsDir,
        req.params.name,
        "AGENT.md",
        typeof body.content === "string" ? body.content : "",
      );
      res.json({ ok: true });
    } catch (err) {
      logger.error({ err }, "Failed to write AGENT.md");
      res.status(500).json({ error: "Failed to write AGENT.md" });
    }
  });

  // ── GET /agents/:name/identity — Get IDENTITY.md ────────────────────────
  router.get("/agents/:name/identity", async (req, res) => {
    try {
      const content = await readAgentFile(
        agentsDir,
        req.params.name,
        "IDENTITY.md",
      );
      res.json({ content });
    } catch (err) {
      logger.error({ err }, "Failed to read IDENTITY.md");
      res.status(500).json({ error: "Failed to read IDENTITY.md" });
    }
  });

  // ── PUT /agents/:name/identity — Update IDENTITY.md ─────────────────────
  router.put("/agents/:name/identity", async (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      await writeAgentFile(
        agentsDir,
        req.params.name,
        "IDENTITY.md",
        typeof body.content === "string" ? body.content : "",
      );
      res.json({ ok: true });
    } catch (err) {
      logger.error({ err }, "Failed to write IDENTITY.md");
      res.status(500).json({ error: "Failed to write IDENTITY.md" });
    }
  });

  // ── GET /agents/:name/soul — Get SOUL.md ────────────────────────────────
  router.get("/agents/:name/soul", async (req, res) => {
    try {
      const content = await readAgentFile(agentsDir, req.params.name, "SOUL.md");
      res.json({ content });
    } catch (err) {
      logger.error({ err }, "Failed to read SOUL.md");
      res.status(500).json({ error: "Failed to read SOUL.md" });
    }
  });

  // ── PUT /agents/:name/soul — Update SOUL.md ─────────────────────────────
  router.put("/agents/:name/soul", async (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      await writeAgentFile(
        agentsDir,
        req.params.name,
        "SOUL.md",
        typeof body.content === "string" ? body.content : "",
      );
      res.json({ ok: true });
    } catch (err) {
      logger.error({ err }, "Failed to write SOUL.md");
      res.status(500).json({ error: "Failed to write SOUL.md" });
    }
  });

  // ── POST /agents/:name/test — Test agent ─────────────────────────────────
  router.post("/agents/:name/test", async (req, res) => {
    try {
      const { name } = req.params;
      const registry = await loadChatAgentRegistry(projectRoot);
      if (!(name in registry)) {
        res.json({ ok: false, error: "Unknown agent" });
        return;
      }

      const agent = registry[name];
      const testPrompt = "Reply with exactly three words: I am ready.";
      const timeoutMs = 30_000;

      const chunks: string[] = [];

      const collectResponse = async (): Promise<string> => {
        if (agent.type === "api" && agent.baseUrl) {
          for await (const chunk of streamApiAgent(
            agent.baseUrl,
            agent.model ?? "",
            testPrompt,
          )) {
            chunks.push(chunk);
          }
        } else if (agent.cmd && agent.cmd.length > 0) {
          for await (const chunk of streamCliAgent(agent.cmd, testPrompt, {
            idleTimeoutMs: 30_000,
            startupTimeoutMs: 30_000,
            cwd: projectRoot,
          })) {
            if (typeof chunk === "string") {
              chunks.push(chunk);
            }
          }
        } else {
          throw new Error(`Agent ${name} has no cmd or API config`);
        }
        return chunks.join("").trim();
      };

      // Run with timeout
      const response = await Promise.race([
        collectResponse(),
        new Promise<never>((_resolve, reject) =>
          setTimeout(() => reject(new Error("Timeout (30s)")), timeoutMs),
        ),
      ]);

      res.json({
        ok: Boolean(response),
        response: response ? response.slice(0, 300) : "(empty)",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.json({ ok: false, error: message });
    }
  });

  return router;
}

export { findAgentDir };
