/**
 * workspaces.ts — REST endpoints for workspace CRUD + file management
 *
 * Mirrors the Python backend's /workspaces endpoints.
 * Workspaces live in `workspaces/{id}/config.json` + `workspaces/{id}/files/`.
 *
 * Prefix: /chat/api  (applied externally when mounting)
 */

import { Router } from "express";
import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import * as path from "node:path";

// ── Helpers ─────────────────────────────────────────────────────────────────

function sanitizeId(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-")
      .replace(/^-+|-+$/g, "") || "workspace"
  );
}

// ── Router ──────────────────────────────────────────────────────────────────

export function createWorkspaceRoutes(projectRoot: string): Router {
  const router = Router();
  const workspacesDir = path.join(projectRoot, "workspaces");
  const historyDir = path.join(projectRoot, "history");

  // Ensure directory exists
  fsSync.mkdirSync(workspacesDir, { recursive: true });

  // ── GET /workspaces ───────────────────────────────────────────────────────
  router.get("/workspaces", async (_req, res) => {
    try {
      let entries: string[];
      try {
        entries = await fs.readdir(workspacesDir);
      } catch {
        res.json([]);
        return;
      }

      entries.sort();
      const result: Array<Record<string, unknown>> = [];

      for (const entry of entries) {
        const dir = path.join(workspacesDir, entry);
        const stat = await fs.stat(dir).catch(() => null);
        if (!stat?.isDirectory()) continue;

        const configPath = path.join(dir, "config.json");
        try {
          const raw = await fs.readFile(configPath, "utf-8");
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

  // ── POST /workspaces ──────────────────────────────────────────────────────
  router.post("/workspaces", async (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      const name = ((body.name as string) ?? "").trim();
      if (!name) {
        res.status(400).json({ error: "name required" });
        return;
      }

      let workspaceId = sanitizeId(name);
      const base = workspaceId;
      let idx = 2;
      while (fsSync.existsSync(path.join(workspacesDir, workspaceId))) {
        workspaceId = `${base}-${idx}`;
        idx++;
      }

      const dir = path.join(workspacesDir, workspaceId);
      await fs.mkdir(dir, { recursive: true });
      await fs.mkdir(path.join(dir, "files"), { recursive: true });

      const cfg = {
        id: workspaceId,
        name,
        description: (body.description as string) ?? "",
        system_prompt: (body.system_prompt as string) ?? "",
        default_agents: (body.default_agents as string[]) ?? [],
        created_at: new Date().toISOString(),
      };

      await fs.writeFile(
        path.join(dir, "config.json"),
        JSON.stringify(cfg, null, 2),
        "utf-8",
      );
      res.json(cfg);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Internal error" });
    }
  });

  // ── GET /workspaces/:id ───────────────────────────────────────────────────
  router.get("/workspaces/:id", async (req, res) => {
    try {
      const workspaceId = req.params.id;
      const configPath = path.join(
        workspacesDir,
        workspaceId,
        "config.json",
      );

      let cfg: Record<string, unknown>;
      try {
        const raw = await fs.readFile(configPath, "utf-8");
        cfg = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        res.status(404).json({ error: "Workspace not found" });
        return;
      }

      // List files
      const filesDir = path.join(workspacesDir, workspaceId, "files");
      let files: string[] = [];
      try {
        const entries = await fs.readdir(filesDir);
        files = entries
          .filter((f) => {
            try {
              return fsSync.statSync(path.join(filesDir, f)).isFile();
            } catch {
              return false;
            }
          })
          .sort();
      } catch {
        // files dir may not exist
      }

      res.json({ ...cfg, files });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Internal error" });
    }
  });

  // ── PUT /workspaces/:id ──────────────────────────────────────────────────
  router.put("/workspaces/:id", async (req, res) => {
    try {
      const workspaceId = req.params.id;
      const configPath = path.join(
        workspacesDir,
        workspaceId,
        "config.json",
      );

      let cfg: Record<string, unknown>;
      try {
        const raw = await fs.readFile(configPath, "utf-8");
        cfg = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        res.status(404).json({ error: "Workspace not found" });
        return;
      }

      const body = req.body as Record<string, unknown>;
      for (const key of [
        "name",
        "description",
        "system_prompt",
        "default_agents",
      ]) {
        if (key in body) cfg[key] = body[key];
      }

      await fs.writeFile(
        configPath,
        JSON.stringify(cfg, null, 2),
        "utf-8",
      );
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Internal error" });
    }
  });

  // ── DELETE /workspaces/:id ───────────────────────────────────────────────
  router.delete("/workspaces/:id", async (req, res) => {
    try {
      const workspaceId = req.params.id;
      const dir = path.join(workspacesDir, workspaceId);

      try {
        await fs.access(dir);
      } catch {
        res.status(404).json({ error: "Workspace not found" });
        return;
      }

      // Hard delete
      await fs.rm(dir, { recursive: true, force: true });

      // Detach sessions that belonged to this workspace
      try {
        const sessionEntries = await fs.readdir(historyDir);
        for (const sid of sessionEntries) {
          const mf = path.join(historyDir, sid, "messages.json");
          try {
            const raw = await fs.readFile(mf, "utf-8");
            const msgs = JSON.parse(raw) as Array<Record<string, unknown>>;
            let changed = false;
            for (const m of msgs) {
              if (m.workspace_id === workspaceId) {
                m.workspace_id = null;
                changed = true;
              }
            }
            if (changed) {
              await fs.writeFile(
                mf,
                JSON.stringify(msgs, null, 2),
                "utf-8",
              );
            }
          } catch {
            // skip
          }
        }
      } catch {
        // history dir may not exist
      }

      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Internal error" });
    }
  });

  // ── POST /workspaces/:id/files — File upload ─────────────────────────────
  // Note: expects raw body with filename in query or Content-Disposition.
  // For multipart, consider adding multer middleware externally.
  router.post("/workspaces/:id/files", async (req, res) => {
    try {
      const workspaceId = req.params.id;
      const filesDir = path.join(workspacesDir, workspaceId, "files");

      try {
        await fs.access(filesDir);
      } catch {
        res.status(404).json({ error: "Workspace not found" });
        return;
      }

      // Accept filename from query param or body field
      const body = req.body as Record<string, unknown>;
      const filename = ((req.query.filename as string) ??
        (body.filename as string) ??
        ""
      ).trim();
      if (!filename || filename.includes("/") || filename.includes("\\")) {
        res.status(400).json({ error: "Valid filename required" });
        return;
      }

      // If body has content (base64 or text), write it
      const content = (body.content as string) ?? "";
      const encoding = (body.encoding as string) ?? "utf-8";

      if (encoding === "base64") {
        await fs.writeFile(
          path.join(filesDir, filename),
          Buffer.from(content, "base64"),
        );
      } else {
        await fs.writeFile(
          path.join(filesDir, filename),
          content,
          "utf-8",
        );
      }

      res.json({ ok: true, filename });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Internal error" });
    }
  });

  // ── DELETE /workspaces/:id/files/:filename ───────────────────────────────
  router.delete("/workspaces/:id/files/:filename", async (req, res) => {
    try {
      const workspaceId = req.params.id;
      const filename = req.params.filename;
      const filePath = path.join(
        workspacesDir,
        workspaceId,
        "files",
        filename,
      );

      try {
        await fs.access(filePath);
      } catch {
        res.status(404).json({ error: "File not found" });
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
