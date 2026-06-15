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
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.tmp`
  );
  await fs.writeFile(tempPath, content, { mode });
  try {
    await fs.rename(tempPath, filePath);
  } catch (err) {
    await fs.unlink(tempPath).catch(() => {});
    throw err;
  }
}

export function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
