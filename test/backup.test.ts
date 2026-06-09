import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { backupFile, originBackupPath, restoreOriginBackup } from "../src/backup.js";

describe("backup", () => {
  it("creates fixed origin backups on first backup and restores them", async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "msw-backup-"));
    const target = path.join(home, ".claude", "settings.json");
    const backupRoot = path.join(home, ".msw", "backups");
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, "origin");

    await backupFile(target, backupRoot, "claude");

    const agentOrigin = originBackupPath(target);
    const backupOrigin = path.join(backupRoot, "claude", "settings.msw-bak.json");
    expect(await fs.readFile(agentOrigin, "utf8")).toBe("origin");
    expect(await fs.readFile(backupOrigin, "utf8")).toBe("origin");

    await fs.writeFile(target, "changed");
    await backupFile(target, backupRoot, "claude");
    expect(await fs.readFile(agentOrigin, "utf8")).toBe("origin");

    await restoreOriginBackup(target, backupRoot, "claude");
    expect(await fs.readFile(target, "utf8")).toBe("origin");
  });
});
