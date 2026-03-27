/**
 * scenarios.ts — REST endpoints for scenario CRUD
 *
 * Mirrors the Python backend's /scenarios endpoints.
 * Scenarios live in `scenarios/{id}.json`.
 *
 * Prefix: /chat/api  (applied externally when mounting)
 */

import { Router } from "express";
import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import * as path from "node:path";

// ── Router ──────────────────────────────────────────────────────────────────

export function createScenarioRoutes(projectRoot: string): Router {
  const router = Router();
  const scenariosDir = path.join(projectRoot, "scenarios");

  // ── GET /scenarios ────────────────────────────────────────────────────────
  router.get("/scenarios", async (_req, res) => {
    try {
      let entries: string[];
      try {
        entries = await fs.readdir(scenariosDir);
      } catch {
        res.json([]);
        return;
      }

      entries.sort();
      const result: Array<Record<string, unknown>> = [];

      for (const entry of entries) {
        if (!entry.endsWith(".json")) continue;
        const filePath = path.join(scenariosDir, entry);
        try {
          const raw = await fs.readFile(filePath, "utf-8");
          result.push(JSON.parse(raw) as Record<string, unknown>);
        } catch {
          // skip malformed
        }
      }

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Internal error" });
    }
  });

  // ── GET /scenarios/:id ────────────────────────────────────────────────────
  router.get("/scenarios/:id", async (req, res) => {
    try {
      const scenarioId = req.params.id;
      const filePath = path.join(scenariosDir, `${scenarioId}.json`);

      try {
        const raw = await fs.readFile(filePath, "utf-8");
        res.json(JSON.parse(raw) as Record<string, unknown>);
      } catch {
        res.status(404).json({ error: "Scenario not found" });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Internal error" });
    }
  });

  // ── POST /scenarios ──────────────────────────────────────────────────────
  router.post("/scenarios", async (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      const sid = ((body.id as string) ?? "").trim();
      if (!sid || /[/\\.\s]/.test(sid) || sid.length > 64) {
        res.status(400).json({ error: "Invalid scenario id" });
        return;
      }

      await fs.mkdir(scenariosDir, { recursive: true });
      const filePath = path.join(scenariosDir, `${sid}.json`);

      if (fsSync.existsSync(filePath)) {
        res
          .status(409)
          .json({ error: `Scenario '${sid}' already exists` });
        return;
      }

      const data = {
        id: sid,
        name: (body.name as string) ?? sid,
        description: (body.description as string) ?? "",
        system_prompt: (body.system_prompt as string) ?? "",
        suggested_agents: (body.suggested_agents as string[]) ?? [],
        topic_hint: (body.topic_hint as string) ?? "",
      };

      await fs.writeFile(
        filePath,
        JSON.stringify(data, null, 2),
        "utf-8",
      );
      res.json({ ok: true, id: sid });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Internal error" });
    }
  });

  // ── PUT /scenarios/:id ───────────────────────────────────────────────────
  router.put("/scenarios/:id", async (req, res) => {
    try {
      const scenarioId = req.params.id;
      const filePath = path.join(scenariosDir, `${scenarioId}.json`);

      let data: Record<string, unknown>;
      try {
        const raw = await fs.readFile(filePath, "utf-8");
        data = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        res.status(404).json({ error: "Scenario not found" });
        return;
      }

      const body = req.body as Record<string, unknown>;
      for (const key of [
        "name",
        "description",
        "system_prompt",
        "suggested_agents",
        "topic_hint",
      ]) {
        if (key in body) data[key] = body[key];
      }

      await fs.writeFile(
        filePath,
        JSON.stringify(data, null, 2),
        "utf-8",
      );
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Internal error" });
    }
  });

  // ── DELETE /scenarios/:id ────────────────────────────────────────────────
  router.delete("/scenarios/:id", async (req, res) => {
    try {
      const scenarioId = req.params.id;
      const filePath = path.join(scenariosDir, `${scenarioId}.json`);

      try {
        await fs.access(filePath);
      } catch {
        res.status(404).json({ error: "Scenario not found" });
        return;
      }

      await fs.unlink(filePath);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Internal error" });
    }
  });

  return router;
}
