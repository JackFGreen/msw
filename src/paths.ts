import os from "node:os";
import path from "node:path";

export type Paths = {
  home: string;
  mswDir: string;
  mswConfig: string;
  backupDir: string;
  claudeSettings: string;
  codexConfig: string;
  opencodeConfig: string;
};

export function createPaths(home = os.homedir()): Paths {
  const mswDir = path.join(home, ".msw");

  return {
    home,
    mswDir,
    mswConfig: path.join(mswDir, "config.jsonc"),
    backupDir: path.join(mswDir, "backups"),
    claudeSettings: path.join(home, ".claude", "settings.json"),
    codexConfig: path.join(home, ".codex", "config.toml"),
    opencodeConfig: path.join(home, ".config", "opencode", "opencode.json")
  };
}
