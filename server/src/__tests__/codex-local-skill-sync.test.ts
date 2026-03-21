import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  listCodexSkills,
  syncCodexSkills,
} from "@meowtieheightgent/adapter-codex-local/server";

async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("codex local skill sync", () => {
  const mthKey = "meowtieheightgent/mth/mth";
  const cleanupDirs = new Set<string>();

  afterEach(async () => {
    await Promise.all(Array.from(cleanupDirs).map((dir) => fs.rm(dir, { recursive: true, force: true })));
    cleanupDirs.clear();
  });

  it("reports configured Mth skills for workspace injection on the next run", async () => {
    const codexHome = await makeTempDir("mth-codex-skill-sync-");
    cleanupDirs.add(codexHome);

    const ctx = {
      agentId: "agent-1",
      companyId: "company-1",
      adapterType: "codex_local",
      config: {
        env: {
          CODEX_HOME: codexHome,
        },
        mthSkillSync: {
          desiredSkills: [mthKey],
        },
      },
    } as const;

    const before = await listCodexSkills(ctx);
    expect(before.mode).toBe("ephemeral");
    expect(before.desiredSkills).toContain(mthKey);
    expect(before.entries.find((entry) => entry.key === mthKey)?.required).toBe(true);
    expect(before.entries.find((entry) => entry.key === mthKey)?.state).toBe("configured");
    expect(before.entries.find((entry) => entry.key === mthKey)?.detail).toContain(".agents/skills");
  });

  it("does not persist Mth skills into CODEX_HOME during sync", async () => {
    const codexHome = await makeTempDir("mth-codex-skill-prune-");
    cleanupDirs.add(codexHome);

    const configuredCtx = {
      agentId: "agent-2",
      companyId: "company-1",
      adapterType: "codex_local",
      config: {
        env: {
          CODEX_HOME: codexHome,
        },
        mthSkillSync: {
          desiredSkills: [mthKey],
        },
      },
    } as const;

    const after = await syncCodexSkills(configuredCtx, [mthKey]);
    expect(after.mode).toBe("ephemeral");
    expect(after.entries.find((entry) => entry.key === mthKey)?.state).toBe("configured");
    await expect(fs.lstat(path.join(codexHome, "skills", "mth"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("keeps required bundled Mth skills configured even when the desired set is emptied", async () => {
    const codexHome = await makeTempDir("mth-codex-skill-required-");
    cleanupDirs.add(codexHome);

    const configuredCtx = {
      agentId: "agent-2",
      companyId: "company-1",
      adapterType: "codex_local",
      config: {
        env: {
          CODEX_HOME: codexHome,
        },
        mthSkillSync: {
          desiredSkills: [],
        },
      },
    } as const;

    const after = await syncCodexSkills(configuredCtx, []);
    expect(after.desiredSkills).toContain(mthKey);
    expect(after.entries.find((entry) => entry.key === mthKey)?.state).toBe("configured");
  });

  it("normalizes legacy flat Mth skill refs before reporting configured state", async () => {
    const codexHome = await makeTempDir("mth-codex-legacy-skill-sync-");
    cleanupDirs.add(codexHome);

    const snapshot = await listCodexSkills({
      agentId: "agent-3",
      companyId: "company-1",
      adapterType: "codex_local",
      config: {
        env: {
          CODEX_HOME: codexHome,
        },
        mthSkillSync: {
          desiredSkills: ["mth"],
        },
      },
    });

    expect(snapshot.warnings).toEqual([]);
    expect(snapshot.desiredSkills).toContain(mthKey);
    expect(snapshot.desiredSkills).not.toContain("mth");
    expect(snapshot.entries.find((entry) => entry.key === mthKey)?.state).toBe("configured");
    expect(snapshot.entries.find((entry) => entry.key === "mth")).toBeUndefined();
  });
});
