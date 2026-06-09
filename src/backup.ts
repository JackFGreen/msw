import fs from "node:fs/promises";
import path from "node:path";
import type { Agent } from "./types.js";
import { atomicWrite, pathExists, timestamp } from "./fs-utils.js";

export async function backupFile(filePath: string, backupRoot: string, agent: Agent) {
  if (!(await pathExists(filePath))) {
    return undefined;
  }

  const targetDir = path.join(backupRoot, agent);
  await fs.mkdir(targetDir, { recursive: true });
  const originPath = originBackupPath(filePath);
  const backupOriginPath = path.join(targetDir, originBackupName(filePath));

  if (!(await pathExists(originPath))) {
    await fs.copyFile(filePath, originPath);
  }

  if (!(await pathExists(backupOriginPath))) {
    await fs.copyFile(originPath, backupOriginPath);
  }

  const backupPath = path.join(targetDir, `${timestamp()}-${path.basename(filePath)}`);
  await fs.copyFile(filePath, backupPath);
  return backupPath;
}

export async function restoreOriginBackup(filePath: string, backupRoot: string, agent: Agent) {
  const originPath = originBackupPath(filePath);
  const backupOriginPath = path.join(backupRoot, agent, originBackupName(filePath));

  if (await pathExists(originPath)) {
    await backupFile(filePath, backupRoot, agent);
    await restoreFile(originPath, filePath);
    return originPath;
  }

  if (await pathExists(backupOriginPath)) {
    await backupFile(filePath, backupRoot, agent);
    await restoreFile(backupOriginPath, filePath);
    return backupOriginPath;
  }

  return undefined;
}

export function originBackupPath(filePath: string) {
  const parsed = path.parse(filePath);
  return path.join(parsed.dir, `${parsed.name}.msw-bak${parsed.ext}`);
}

function originBackupName(filePath: string) {
  return path.basename(originBackupPath(filePath));
}

async function restoreFile(source: string, target: string) {
  const content = await fs.readFile(source);
  await atomicWrite(target, content.toString("utf8"));
}
