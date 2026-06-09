import fs from "node:fs/promises";
import path from "node:path";

export async function pathExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function atomicWrite(filePath: string, content: string, mode?: number) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  await fs.writeFile(tempPath, content, { mode });
  await fs.rename(tempPath, filePath);
  if (mode !== undefined) {
    await fs.chmod(filePath, mode);
  }
}

export function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
