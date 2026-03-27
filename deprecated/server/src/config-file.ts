import fs from "node:fs";
import { mthConfigSchema, type MthConfig } from "@meowtieheightgent/shared";
import { resolveMthConfigPath } from "./paths.js";

export function readConfigFile(): MthConfig | null {
  const configPath = resolveMthConfigPath();

  if (!fs.existsSync(configPath)) return null;

  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    return mthConfigSchema.parse(raw);
  } catch {
    return null;
  }
}
