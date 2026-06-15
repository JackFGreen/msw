import fs from "node:fs/promises";
import { parse, stringify } from "smol-toml";
import { backupFile } from "../backup.js";
import { baseURLForAgent } from "../env.js";
import { MswError } from "../errors.js";
import { atomicWrite, pathExists } from "../fs-utils.js";
import type { Paths } from "../paths.js";
import { requireActive } from "../store.js";
import type { MswConfig } from "../types.js";
import { asObject } from "./common.js";

type TomlObject = Record<string, unknown>;

export async function switchCodex(paths: Paths, config: MswConfig) {
  const selection = requireActive(config, "codex");
  await backupFile(paths.codexConfig, paths.backupDir, "codex");

  const codex = await readTomlObject(paths.codexConfig);
  codex.model_provider = selection.id;
  codex.model = selection.model;

  const modelProviders = asObject(codex.model_providers);
  modelProviders[selection.id] = {
    ...asObject(modelProviders[selection.id]),
    name: selection.provider.name,
    base_url: baseURLForAgent(selection, "codex"),
    env_key: "MSW_CODEX_API_KEY",
  };
  codex.model_providers = modelProviders;

  await atomicWrite(paths.codexConfig, stringify(codex));
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
    return parsed as TomlObject;
  } catch (error) {
    if (error instanceof MswError) throw error;
    throw new MswError(
      `failed to parse TOML config ${filePath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
