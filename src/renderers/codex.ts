import fs from "node:fs/promises";
import { parse, stringify } from "smol-toml";
import { backupFile } from "../backup.js";
import { baseURLForAgent } from "../env.js";
import { MswError } from "../errors.js";
import { atomicWrite, pathExists } from "../fs-utils.js";
import type { Paths } from "../paths.js";
import { requireActive } from "../store.js";
import type { ActiveSelection, MswConfig } from "../types.js";
import { asObject } from "./common.js";

type TomlObject = Record<string, unknown>;

const mswEnvKey = "MSW_CODEX_API_KEY";

export async function switchCodex(paths: Paths, config: MswConfig) {
  const selection = requireActive(config, "codex");
  await backupFile(paths.codexConfig, paths.backupDir, "codex");

  const codex = await readTomlObject(paths.codexConfig);
  codex.model_provider = selection.id;
  codex.model = selection.model;
  if (selection.effort) {
    codex.model_reasoning_effort = selection.effort;
  } else {
    delete codex.model_reasoning_effort;
  }

  const modelProviders = asObject(codex.model_providers);
  modelProviders[selection.id] = {
    ...asObject(modelProviders[selection.id]),
    name: selection.provider.name,
    base_url: baseURLForAgent(selection, "codex"),
    env_key: mswEnvKey,
  };
  codex.model_providers = modelProviders;

  await atomicWrite(paths.codexConfig, stringify(codex));
}

/**
 * Undo msw's codex injection in place instead of rolling the whole file back.
 *
 * msw only ever writes `model_provider`, `model`, `model_reasoning_effort`, and
 * `[model_providers.<id>]` tables. Everything else in config.toml is owned by the
 * Codex app itself (projects, plugins, tui, mcp_servers, ...), so a whole-file
 * restore would clobber fields that changed since the origin snapshot was taken.
 *
 * `model_provider` and the provider tables are recognised by the `MSW_CODEX_API_KEY`
 * marker so this still works when `active.codex` has already been cleared. `model`
 * and `model_reasoning_effort` are only removed when they match what msw recorded,
 * which keeps a model picked later inside the Codex app intact.
 */
export async function restoreCodexOrigin(paths: Paths, selection?: ActiveSelection) {
  if (!(await pathExists(paths.codexConfig))) {
    return [];
  }

  const codex = await readTomlObject(paths.codexConfig);
  const removed: string[] = [];

  const modelProviders = asObject(codex.model_providers);
  const providerId = typeof codex.model_provider === "string" ? codex.model_provider : undefined;
  if (providerId && isMswProvider(modelProviders[providerId])) {
    delete codex.model_provider;
    removed.push("model_provider");
  }

  if (selection?.model && codex.model === selection.model) {
    delete codex.model;
    removed.push("model");
  }

  if (selection?.effort && codex.model_reasoning_effort === selection.effort) {
    delete codex.model_reasoning_effort;
    removed.push("model_reasoning_effort");
  }

  const mswIds = Object.keys(modelProviders).filter((id) => isMswProvider(modelProviders[id]));
  for (const id of mswIds) {
    delete modelProviders[id];
    removed.push(`model_providers.${id}`);
  }
  if (mswIds.length > 0) {
    if (Object.keys(modelProviders).length > 0) {
      codex.model_providers = modelProviders;
    } else {
      delete codex.model_providers;
    }
  }

  if (removed.length > 0) {
    await atomicWrite(paths.codexConfig, stringify(codex));
  }
  return removed;
}

function isMswProvider(table: unknown) {
  return asObject(table).env_key === mswEnvKey;
}

async function readTomlObject(filePath: string): Promise<TomlObject> {
  if (!(await pathExists(filePath))) {
    return {};
  }

  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new MswError(`${filePath} must contain a TOML object`);
    }
    return parsed;
  } catch (error) {
    if (error instanceof MswError) throw error;
    throw new MswError(
      `failed to parse TOML config ${filePath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
