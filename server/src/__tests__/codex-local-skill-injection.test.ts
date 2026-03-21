import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureCodexSkillsInjected } from "@meowtieheightgent/adapter-codex-local/server";

async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function createMthRepoSkill(root: string, skillName: string) {
  await fs.mkdir(path.join(root, "server"), { recursive: true });
  await fs.mkdir(path.join(root, "packages", "adapter-utils"), { recursive: true });
  await fs.mkdir(path.join(root, "skills", skillName), { recursive: true });
  await fs.writeFile(path.join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n", "utf8");
  await fs.writeFile(path.join(root, "package.json"), '{"name":"mth"}\n', "utf8");
  await fs.writeFile(
    path.join(root, "skills", skillName, "SKILL.md"),
    `---\nname: ${skillName}\n---\n`,
    "utf8",
  );
}

async function createCustomSkill(root: string, skillName: string) {
  await fs.mkdir(path.join(root, "custom", skillName), { recursive: true });
  await fs.writeFile(
    path.join(root, "custom", skillName, "SKILL.md"),
    `---\nname: ${skillName}\n---\n`,
    "utf8",
  );
}

describe("codex local adapter skill injection", () => {
  const mthKey = "meowtieheightgent/mth/mth";
  const cleanupDirs = new Set<string>();

  afterEach(async () => {
    await Promise.all(Array.from(cleanupDirs).map((dir) => fs.rm(dir, { recursive: true, force: true })));
    cleanupDirs.clear();
  });

  it("repairs a Codex Mth skill symlink that still points at another live checkout", async () => {
    const currentRepo = await makeTempDir("mth-codex-current-");
    const oldRepo = await makeTempDir("mth-codex-old-");
    const skillsHome = await makeTempDir("mth-codex-home-");
    cleanupDirs.add(currentRepo);
    cleanupDirs.add(oldRepo);
    cleanupDirs.add(skillsHome);

    await createMthRepoSkill(currentRepo, "mth");
    await createMthRepoSkill(oldRepo, "mth");
    await fs.symlink(path.join(oldRepo, "skills", "mth"), path.join(skillsHome, "mth"));

    const logs: Array<{ stream: "stdout" | "stderr"; chunk: string }> = [];
    await ensureCodexSkillsInjected(
      async (stream, chunk) => {
        logs.push({ stream, chunk });
      },
      {
        skillsHome,
        skillsEntries: [{
          key: mthKey,
          runtimeName: "mth",
          source: path.join(currentRepo, "skills", "mth"),
        }],
      },
    );

    expect(await fs.realpath(path.join(skillsHome, "mth"))).toBe(
      await fs.realpath(path.join(currentRepo, "skills", "mth")),
    );
    expect(logs).toContainEqual(
      expect.objectContaining({
        stream: "stdout",
        chunk: expect.stringContaining('Repaired Codex skill "mth"'),
      }),
    );
  });

  it("preserves a custom Codex skill symlink outside Mth repo checkouts", async () => {
    const currentRepo = await makeTempDir("mth-codex-current-");
    const customRoot = await makeTempDir("mth-codex-custom-");
    const skillsHome = await makeTempDir("mth-codex-home-");
    cleanupDirs.add(currentRepo);
    cleanupDirs.add(customRoot);
    cleanupDirs.add(skillsHome);

    await createMthRepoSkill(currentRepo, "mth");
    await createCustomSkill(customRoot, "mth");
    await fs.symlink(path.join(customRoot, "custom", "mth"), path.join(skillsHome, "mth"));

    await ensureCodexSkillsInjected(async () => {}, {
      skillsHome,
      skillsEntries: [{
        key: mthKey,
        runtimeName: "mth",
        source: path.join(currentRepo, "skills", "mth"),
      }],
    });

    expect(await fs.realpath(path.join(skillsHome, "mth"))).toBe(
      await fs.realpath(path.join(customRoot, "custom", "mth")),
    );
  });

  it("prunes broken symlinks for unavailable Mth repo skills before Codex starts", async () => {
    const currentRepo = await makeTempDir("mth-codex-current-");
    const oldRepo = await makeTempDir("mth-codex-old-");
    const skillsHome = await makeTempDir("mth-codex-home-");
    cleanupDirs.add(currentRepo);
    cleanupDirs.add(oldRepo);
    cleanupDirs.add(skillsHome);

    await createMthRepoSkill(currentRepo, "mth");
    await createMthRepoSkill(oldRepo, "agent-browser");
    const staleTarget = path.join(oldRepo, "skills", "agent-browser");
    await fs.symlink(staleTarget, path.join(skillsHome, "agent-browser"));
    await fs.rm(staleTarget, { recursive: true, force: true });

    const logs: Array<{ stream: "stdout" | "stderr"; chunk: string }> = [];
    await ensureCodexSkillsInjected(
      async (stream, chunk) => {
        logs.push({ stream, chunk });
      },
      {
        skillsHome,
        skillsEntries: [{
          key: mthKey,
          runtimeName: "mth",
          source: path.join(currentRepo, "skills", "mth"),
        }],
      },
    );

    await expect(fs.lstat(path.join(skillsHome, "agent-browser"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(logs).toContainEqual(
      expect.objectContaining({
        stream: "stdout",
        chunk: expect.stringContaining('Removed stale Codex skill "agent-browser"'),
      }),
    );
  });

  it("preserves other live Mth skill symlinks in the shared workspace skill directory", async () => {
    const currentRepo = await makeTempDir("mth-codex-current-");
    const skillsHome = await makeTempDir("mth-codex-home-");
    cleanupDirs.add(currentRepo);
    cleanupDirs.add(skillsHome);

    await createMthRepoSkill(currentRepo, "mth");
    await createMthRepoSkill(currentRepo, "agent-browser");
    await fs.symlink(
      path.join(currentRepo, "skills", "agent-browser"),
      path.join(skillsHome, "agent-browser"),
    );

    await ensureCodexSkillsInjected(async () => {}, {
      skillsHome,
      skillsEntries: [{
        key: mthKey,
        runtimeName: "mth",
        source: path.join(currentRepo, "skills", "mth"),
      }],
    });

    expect((await fs.lstat(path.join(skillsHome, "mth"))).isSymbolicLink()).toBe(true);
    expect((await fs.lstat(path.join(skillsHome, "agent-browser"))).isSymbolicLink()).toBe(true);
    expect(await fs.realpath(path.join(skillsHome, "agent-browser"))).toBe(
      await fs.realpath(path.join(currentRepo, "skills", "agent-browser")),
    );
  });
});
