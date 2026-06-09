import { backupFile } from "../backup.js";
import type { Paths } from "../paths.js";
import type { MswConfig } from "../types.js";
import { readJsonObject, writeJsonObject } from "./common.js";

export async function switchClaude(paths: Paths, _config: MswConfig) {
  await backupFile(paths.claudeSettings, paths.backupDir, "claude");
  const settings = await readJsonObject(paths.claudeSettings);
  const env = asObject(settings.env);
  delete env.ANTHROPIC_BASE_URL;
  delete env.ANTHROPIC_AUTH_TOKEN;
  delete env.ANTHROPIC_MODEL;
  delete env.ANTHROPIC_DEFAULT_SONNET_MODEL;
  delete env.ANTHROPIC_DEFAULT_OPUS_MODEL;
  delete env.ANTHROPIC_DEFAULT_HAIKU_MODEL;
  settings.env = env;
  await writeJsonObject(paths.claudeSettings, settings);
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}
