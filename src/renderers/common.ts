import fs from "node:fs/promises";
import { parse, stringify } from "comment-json";
import { MswError } from "../errors.js";
import { atomicWrite, pathExists } from "../fs-utils.js";

export async function readJsonObject(filePath: string) {
  if (!(await pathExists(filePath))) {
    return {};
  }

  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new MswError(`${filePath} must contain a JSON object`);
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof MswError) throw error;
    throw new MswError(
      `failed to parse JSON config ${filePath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function writeJsonObject(filePath: string, value: Record<string, unknown>) {
  await atomicWrite(filePath, `${stringify(value, null, 2)}\n`);
}

export function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}
