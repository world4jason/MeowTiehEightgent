/**
 * build-prompt.ts — Assemble the full prompt sent to each CLI agent
 *
 * Ported from Python backend (app.py build_prompt()).
 * Reads agent markdown files, workspace guides, skills, and memory
 * from disk to construct the complete system + conversation prompt.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

// ── Types ────────────────────────────────────────────────────────────────────

export interface BuildPromptOptions {
  agent: {
    name: string;
    workspace: string; // absolute path to agent folder
    skills?: string[];
    pending_continuation?: boolean;
  };
  historyText: string;
  workspaceId?: string | null;
  allAgents?: { name: string }[];
  mode?: "chat" | "think";
  scenarioSystemPrompt?: string | null;
  blankMode?: boolean;
  projectRoot: string; // absolute path to project root
  sessionId?: string;
}

// ── Skill helpers ────────────────────────────────────────────────────────────

/**
 * Find SKILL.md or SKILLS.md inside a skill directory.
 * Returns the full path or null if not found.
 */
async function findSkillFile(slugDir: string): Promise<string | null> {
  for (const name of ["SKILL.md", "SKILLS.md"]) {
    const filePath = path.join(slugDir, name);
    try {
      await fs.access(filePath);
      return filePath;
    } catch {
      // file not found, try next
    }
  }
  return null;
}

/**
 * Parse a SKILL.md file: extract YAML frontmatter for name, return body.
 * Simplified version — parses name from frontmatter manually.
 */
async function parseSkill(
  skillFile: string,
): Promise<{ name: string; body: string }> {
  const raw = (await fs.readFile(skillFile, "utf-8")).trim();
  const dirName = path.basename(path.dirname(skillFile));

  let name = dirName;
  let body = raw;

  if (raw.startsWith("---")) {
    const endIdx = raw.indexOf("---", 3);
    if (endIdx !== -1) {
      const fm = raw.slice(3, endIdx).trim();
      body = raw.slice(endIdx + 3).trim();
      for (const line of fm.split("\n")) {
        if (line.startsWith("name:")) {
          name = line.slice(5).trim();
        }
      }
    }
  }

  return { name, body };
}

// ── File helpers ─────────────────────────────────────────────────────────────

/** Read a file and return its trimmed contents, or null if it doesn't exist. */
async function readFileOrNull(filePath: string): Promise<string | null> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return content.trim();
  } catch {
    return null;
  }
}

/** Check if a path exists and is a file. */
async function isFile(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

/** Check if a path exists and is a directory. */
async function isDirectory(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

// ── Main function ────────────────────────────────────────────────────────────

export async function buildPrompt(options: BuildPromptOptions): Promise<string> {
  const {
    agent,
    historyText,
    workspaceId = null,
    allAgents,
    mode = "chat",
    scenarioSystemPrompt = null,
    blankMode = false,
    projectRoot,
    sessionId,
  } = options;

  const ws = agent.workspace; // path to agent folder
  const parts: string[] = [];
  const modePrefix =
    mode === "chat"
      ? "Keep your response concise — 2-3 sentences max.\n\n"
      : "";

  // ── Context injection: scenario > workspace > blank ──────────────────────

  if (scenarioSystemPrompt) {
    parts.push(`## Session Context\n\n${scenarioSystemPrompt}`);
  } else if (!blankMode && workspaceId) {
    // Workspace guide: load config.json system_prompt + files (up to 50KB)
    const wsDir = path.join(projectRoot, "workspaces", workspaceId);
    const wsCfgPath = path.join(wsDir, "config.json");

    const cfgContent = await readFileOrNull(wsCfgPath);
    if (cfgContent !== null) {
      let wsCfg: Record<string, unknown>;
      try {
        wsCfg = JSON.parse(cfgContent);
      } catch {
        wsCfg = {};
      }

      const guideParts: string[] = [];

      if (typeof wsCfg.system_prompt === "string" && wsCfg.system_prompt) {
        guideParts.push(wsCfg.system_prompt);
      }

      const filesDir = path.join(wsDir, "files");
      if (await isDirectory(filesDir)) {
        const entries = await fs.readdir(filesDir);
        const sorted = [...entries].sort();
        let total = 0;

        for (const entry of sorted) {
          const fp = path.join(filesDir, entry);
          if (!(await isFile(fp))) continue;

          const stat = await fs.stat(fp);
          if (total + stat.size < 50_000) {
            const content = await fs.readFile(fp, "utf-8");
            guideParts.push(`### ${entry}\n\n${content}`);
            total += stat.size;
          } else {
            guideParts.push(`### ${entry} (too large — use @${entry} to load)`);
          }
        }
      }

      if (guideParts.length > 0) {
        parts.push("## Workspace Guide\n\n" + guideParts.join("\n\n"));
      }
    }
  }

  // ── Agent markdown files ─────────────────────────────────────────────────

  for (const fname of ["AGENT.md", "IDENTITY.md", "SOUL.md"]) {
    const content = await readFileOrNull(path.join(ws, fname));
    if (content) {
      parts.push(content);
    }
  }

  // ── USER.md from project root ────────────────────────────────────────────

  const userMdContent = await readFileOrNull(path.join(projectRoot, "USER.md"));
  if (userMdContent) {
    parts.push(userMdContent);
  }

  // ── Today's memory ───────────────────────────────────────────────────────

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const memFile = path.join(ws, "memory", `${today}.md`);
  const memContent = await readFileOrNull(memFile);
  if (memContent) {
    parts.push(`## Your memory (${today})\n\n${memContent}`);
  }

  // ── Agent skills ─────────────────────────────────────────────────────────

  const agentSkills = agent.skills ?? [];
  const skillsDir = path.join(projectRoot, "skills");

  if (agentSkills.length > 0 && (await isDirectory(skillsDir))) {
    const entries = await fs.readdir(skillsDir);
    const sorted = [...entries].sort();

    for (const entry of sorted) {
      if (!agentSkills.includes(entry)) continue;

      const slugDir = path.join(skillsDir, entry);
      if (!(await isDirectory(slugDir))) continue;

      const sf = await findSkillFile(slugDir);
      if (sf) {
        const s = await parseSkill(sf);
        parts.push(`## Skill: ${s.name}\n\n${s.body}`);
      }
    }
  }

  // Room Goal injection
  if (sessionId) {
    const { loadSessionConfig } = await import("./routes/sessions.js");
    const sessionConfig = await loadSessionConfig(path.join(projectRoot, "history"), sessionId);
    if (sessionConfig.goal) {
      parts.push(`\n[當前目標] ${sessionConfig.goal}\n請圍繞這個目標回應。`);
    }
  }

  // SUGGEST_ISSUE instruction — enables agent-initiated issue creation
  parts.push(`\n[工具提示] 當對話中出現明確的待辦事項、bug 或需要追蹤的任務時，建議用戶建立 issue，格式為 [SUGGEST_ISSUE: 標題]。用戶會看到一個確認卡片來建立。`);

  // ── Assemble ─────────────────────────────────────────────────────────────

  const context = parts.join("\n\n---\n\n");

  // Dynamic participants header
  let participantsHeader = "";
  if (allAgents && allAgents.length > 0) {
    const names = allAgents
      .filter((a) => a.name !== agent.name)
      .map((a) => a.name);
    const others = names.length > 0 ? names.join(", ") : "none";
    participantsHeader =
      `Participants in this room: ${agent.name} (you), ${others}, Human\n` +
      `Your previous responses above are marked [${agent.name}]:\n`;
  }

  // Continuation hint
  let continuationHint = "";
  if (agent.pending_continuation) {
    continuationHint =
      "\n\n[系統提示] 你在上一輪說到一半被打斷了" +
      "（歷史中可看到 [TRUNCATED] 標記）。" +
      "這輪你可以選擇繼續完整你的想法，或先回應其他人的發言再補充。";
    agent.pending_continuation = false;
  }

  return (
    `${modePrefix}${context}\n\n===== DISCUSSION =====\n\n` +
    `${participantsHeader}\n${historyText}` +
    `${continuationHint}\n\n` +
    "Your turn. Respond as your persona dictates."
  );
}
