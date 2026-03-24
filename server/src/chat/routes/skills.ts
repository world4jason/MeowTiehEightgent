/**
 * skills.ts — REST endpoints for skill CRUD
 *
 * Mirrors the Python backend's /skills endpoints.
 * Skills live in `skills/{slug}/SKILL.md` with YAML frontmatter.
 *
 * Prefix: /chat/api  (applied externally when mounting)
 */

import { Router } from "express";
import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import * as path from "node:path";

// ── Skill parsing helpers ───────────────────────────────────────────────────

interface ParsedSkill {
  name: string;
  description: string;
  body: string;
  source: string;
  source_url: string;
  source_version: string;
}

/** Find SKILL.md or SKILLS.md inside a skill directory. */
function findSkillFile(slugDir: string): string | null {
  for (const name of ["SKILL.md", "SKILLS.md"]) {
    const p = path.join(slugDir, name);
    if (fsSync.existsSync(p)) return p;
  }
  return null;
}

/** Parse a SKILL.md file — extract YAML frontmatter and markdown body. */
function parseSkill(skillFile: string): ParsedSkill {
  const raw = fsSync.readFileSync(skillFile, "utf-8").trim();
  const slug = path.basename(path.dirname(skillFile));
  let name = slug;
  let description = "";
  let source = "";
  let sourceUrl = "";
  let sourceVersion = "";
  let body = raw;

  if (raw.startsWith("---")) {
    const end = raw.indexOf("---", 3);
    if (end !== -1) {
      const fm = raw.slice(3, end).trim();
      body = raw.slice(end + 3).trim();
      for (const line of fm.split("\n")) {
        if (line.startsWith("name:")) {
          name = line.slice(5).trim();
        } else if (line.startsWith("description:")) {
          description = line.slice(12).trim();
        } else if (line.startsWith("source:")) {
          source = line.slice(7).trim();
        } else if (line.startsWith("source_url:")) {
          sourceUrl = line.slice(11).trim();
        } else if (line.startsWith("source_version:")) {
          sourceVersion = line.slice(15).trim();
        }
      }
    }
  }

  // Fallback description: first non-heading, non-empty line of body
  if (!description) {
    const lines = body
      .split("\n")
      .filter((l) => l.trim() && !l.startsWith("#"));
    description = lines.length > 0 ? lines[0].trim() : "";
  }

  return {
    name,
    description,
    body,
    source,
    source_url: sourceUrl,
    source_version: sourceVersion,
  };
}

/** Serialize a skill back to YAML frontmatter + body. */
function serializeSkill(
  name: string,
  description: string,
  body: string,
): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}`;
}

// ── Router ──────────────────────────────────────────────────────────────────

export function createSkillRoutes(projectRoot: string): Router {
  const router = Router();
  const skillsDir = path.join(projectRoot, "skills");

  // ── GET /skills ───────────────────────────────────────────────────────────
  router.get("/skills", async (_req, res) => {
    try {
      let entries: string[];
      try {
        entries = await fs.readdir(skillsDir);
      } catch {
        res.json([]);
        return;
      }

      entries.sort();
      const result: Array<Record<string, unknown>> = [];

      for (const entry of entries) {
        const slugDir = path.join(skillsDir, entry);
        const stat = await fs.stat(slugDir).catch(() => null);
        if (!stat?.isDirectory()) continue;

        const sf = findSkillFile(slugDir);
        if (sf) {
          const s = parseSkill(sf);
          const displayName = s.source
            ? `${s.source}:${s.name}`
            : s.name;
          result.push({
            slug: entry,
            name: displayName,
            description: s.description,
            missing: false,
            source: s.source,
            source_url: s.source_url,
            source_version: s.source_version,
          });
        } else {
          result.push({
            slug: entry,
            name: entry,
            description: "",
            missing: true,
            source: "",
            source_url: "",
            source_version: "",
          });
        }
      }

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Internal error" });
    }
  });

  // ── GET /skills/:slug ────────────────────────────────────────────────────
  router.get("/skills/:slug", (req, res) => {
    try {
      const slug = req.params.slug;
      const sf = findSkillFile(path.join(skillsDir, slug));
      if (!sf) {
        res.status(404).json({ error: "Skill not found" });
        return;
      }
      const s = parseSkill(sf);
      res.json({
        slug,
        name: s.name,
        description: s.description,
        body: s.body,
        source: s.source,
        source_url: s.source_url,
        source_version: s.source_version,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Internal error" });
    }
  });

  // ── PUT /skills/:slug ────────────────────────────────────────────────────
  router.put("/skills/:slug", async (req, res) => {
    try {
      const slug = req.params.slug;
      const sf = findSkillFile(path.join(skillsDir, slug));
      if (!sf) {
        res.status(404).json({ error: "Skill not found" });
        return;
      }
      const body = req.body as Record<string, unknown>;
      const name = (body.name as string) ?? slug;
      const description = (body.description as string) ?? "";
      const content = (body.body as string) ?? "";
      await fs.writeFile(sf, serializeSkill(name, description, content), "utf-8");
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Internal error" });
    }
  });

  // ── POST /skills ─────────────────────────────────────────────────────────
  router.post("/skills", async (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      const slug = ((body.slug as string) ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-");
      if (!slug) {
        res.status(400).json({ error: "slug required" });
        return;
      }

      const slugDir = path.join(skillsDir, slug);
      try {
        await fs.access(slugDir);
        res.status(409).json({ error: "Skill already exists" });
        return;
      } catch {
        // Expected — does not exist yet
      }

      await fs.mkdir(slugDir, { recursive: true });
      const name = (body.name as string) ?? slug;
      const description = (body.description as string) ?? "";
      const content = (body.body as string) ?? "";
      await fs.writeFile(
        path.join(slugDir, "SKILL.md"),
        serializeSkill(name, description, content),
        "utf-8",
      );
      res.json({ ok: true, slug });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Internal error" });
    }
  });

  return router;
}
