/**
 * adapter-presets.ts — REST endpoints for adapter preset CRUD + legacy model compat
 *
 * Mirrors the Python backend's /adapter-presets, /models, and
 * /providers/ollama/* endpoints.
 *
 * Prefix: /chat/api  (applied externally when mounting)
 */

import { Router } from "express";
import * as fsSync from "node:fs";
import * as path from "node:path";

// ── Config helpers ───────────────────────────────────────────────────────────

function loadGlobalConfig(projectRoot: string): Record<string, unknown> {
  try {
    const raw = fsSync.readFileSync(
      path.join(projectRoot, "config.json"),
      "utf-8",
    );
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function saveGlobalConfig(
  projectRoot: string,
  config: Record<string, unknown>,
): void {
  fsSync.writeFileSync(
    path.join(projectRoot, "config.json"),
    JSON.stringify(config, null, 2) + "\n",
  );
}

/** Return the config key that holds adapter presets. */
function adapterPresetsKey(
  cfg: Record<string, unknown>,
): "adapter_presets" | "models" {
  return "adapter_presets" in cfg ? "adapter_presets" : "models";
}

/** Load adapter presets, converting legacy models on the fly. */
function loadAdapterPresets(
  projectRoot: string,
): Record<string, Record<string, unknown>> {
  const cfg = loadGlobalConfig(projectRoot);
  if (
    cfg.adapter_presets &&
    typeof cfg.adapter_presets === "object"
  ) {
    return cfg.adapter_presets as Record<string, Record<string, unknown>>;
  }
  // Fallback: convert old models dict
  const models = (cfg.models ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  const presets: Record<string, Record<string, unknown>> = {};
  for (const [mid, m] of Object.entries(models)) {
    const preset: Record<string, unknown> = { ...m };
    const cmdList = m.cmd as string[] | undefined;
    if (Array.isArray(cmdList) && cmdList.length > 0) {
      preset.command = cmdList[0];
      preset.defaultArgs = cmdList.slice(1);
    }
    if (m.apiModel) preset.defaultModel = m.apiModel;
    if (m.idle_timeout_seconds !== undefined)
      preset.timeoutSec = m.idle_timeout_seconds;
    if (m.startup_timeout_seconds !== undefined)
      preset.startupTimeoutSec = m.startup_timeout_seconds;
    presets[mid] = preset;
  }
  return presets;
}

/** Resolve Ollama base URL from adapter_presets (v1) or models (v0). */
function resolveOllamaBaseUrl(projectRoot: string): string {
  const presets = loadAdapterPresets(projectRoot);
  if (presets.ollama_api?.baseUrl) return presets.ollama_api.baseUrl as string;
  if (presets.ollama?.baseUrl) return presets.ollama.baseUrl as string;
  return "http://127.0.0.1:11434";
}

// ── Router ──────────────────────────────────────────────────────────────────

export function createAdapterPresetRoutes(projectRoot: string): Router {
  const router = Router();

  // ── GET /adapter-presets ───────────────────────────────────────────────────
  router.get("/adapter-presets", (_req, res) => {
    try {
      const presets = loadAdapterPresets(projectRoot);
      const result = Object.entries(presets).map(([k, v]) => ({
        adapter_type: k,
        ...v,
      }));
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Internal error" });
    }
  });

  // ── POST /adapter-presets ─────────────────────────────────────────────────
  router.post("/adapter-presets", (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      const adapterType = ((body.adapter_type as string) ?? "").trim();
      if (!adapterType) {
        res.status(400).json({ error: "adapter_type required" });
        return;
      }

      const cfg = loadGlobalConfig(projectRoot);
      const key = adapterPresetsKey(cfg);
      if (!(key in cfg)) (cfg as any)[key] = {};
      const presets = (cfg as any)[key] as Record<string, unknown>;
      if (adapterType in presets) {
        res.status(409).json({ error: "Adapter preset already exists" });
        return;
      }

      const entry: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(body)) {
        if (k !== "adapter_type") entry[k] = v;
      }
      presets[adapterType] = entry;
      saveGlobalConfig(projectRoot, cfg);
      res.json({ ok: true, adapter_type: adapterType });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Internal error" });
    }
  });

  // ── PUT /adapter-presets/:type ────────────────────────────────────────────
  router.put("/adapter-presets/:type", (req, res) => {
    try {
      const adapterType = req.params.type;
      const body = req.body as Record<string, unknown>;

      const cfg = loadGlobalConfig(projectRoot);
      const key = adapterPresetsKey(cfg);
      const presets = ((cfg as any)[key] ?? {}) as Record<
        string,
        Record<string, unknown>
      >;
      if (!(adapterType in presets)) {
        res.status(404).json({ error: "Adapter preset not found" });
        return;
      }

      delete body.adapter_type;
      Object.assign(presets[adapterType], body);
      saveGlobalConfig(projectRoot, cfg);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Internal error" });
    }
  });

  // ── DELETE /adapter-presets/:type ─────────────────────────────────────────
  router.delete("/adapter-presets/:type", (req, res) => {
    try {
      const adapterType = req.params.type;
      const cfg = loadGlobalConfig(projectRoot);
      const key = adapterPresetsKey(cfg);
      const presets = ((cfg as any)[key] ?? {}) as Record<string, unknown>;
      delete presets[adapterType];
      saveGlobalConfig(projectRoot, cfg);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Internal error" });
    }
  });

  // ── GET /models — backward compat alias ───────────────────────────────────
  router.get("/models", (_req, res) => {
    try {
      const presets = loadAdapterPresets(projectRoot);
      const result = Object.entries(presets).map(([mid, m]) => ({
        id: mid,
        ...m,
      }));
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Internal error" });
    }
  });

  // ── GET /providers/ollama/models ──────────────────────────────────────────
  router.get("/providers/ollama/models", async (req, res) => {
    try {
      let baseUrl = ((req.query.base_url as string) ?? "").trim();
      if (!baseUrl) baseUrl = resolveOllamaBaseUrl(projectRoot);

      const response = await fetch(`${baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        res.json({ ok: false, models: [], error: `HTTP ${response.status}` });
        return;
      }
      const data = (await response.json()) as {
        models?: Array<{ name: string }>;
      };
      const models = (data.models ?? []).map((m) => m.name);
      res.json({ ok: true, models });
    } catch (err: any) {
      res.json({
        ok: false,
        models: [],
        error: err.message ?? String(err),
      });
    }
  });

  // ── POST /providers/ollama/pull — SSE streaming ──────────────────────────
  router.post("/providers/ollama/pull", async (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      let baseUrl = ((body.base_url as string) ?? "").trim();
      if (!baseUrl) baseUrl = resolveOllamaBaseUrl(projectRoot);
      const modelName = ((body.model as string) ?? "").trim();
      if (!modelName) {
        res.status(400).json({ error: "model required" });
        return;
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      try {
        const upstream = await fetch(`${baseUrl}/api/pull`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: modelName }),
        });

        if (!upstream.body) {
          res.write(`data: ${JSON.stringify({ error: "No response body" })}\n\n`);
          res.write("data: [DONE]\n\n");
          res.end();
          return;
        }

        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) {
              res.write(`data: ${trimmed}\n\n`);
            }
          }
        }
        if (buffer.trim()) {
          res.write(`data: ${buffer.trim()}\n\n`);
        }
      } catch (err: any) {
        res.write(
          `data: ${JSON.stringify({ error: err.message ?? String(err) })}\n\n`,
        );
      }

      res.write("data: [DONE]\n\n");
      res.end();
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(500).json({ error: err.message ?? "Internal error" });
      }
    }
  });

  return router;
}
