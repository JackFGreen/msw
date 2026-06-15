import { backupFile } from "../backup.js";
import { baseURLForAgent, opencodeApiKeyEnvName } from "../env.js";
import { MswError } from "../errors.js";
import type { Paths } from "../paths.js";
import { requireActive } from "../store.js";
import type { MswConfig, Provider } from "../types.js";
import { asObject, readJsonObject, writeJsonObject } from "./common.js";

export async function syncOpenCode(paths: Paths, config: MswConfig) {
  await backupFile(paths.opencodeConfig, paths.backupDir, "opencode");
  const opencode = await readJsonObject(paths.opencodeConfig);
  const existingProviders = asObject(opencode.provider);

  opencode.provider = {
    ...existingProviders,
    ...Object.fromEntries(
      Object.entries(config.providers).map(([id, provider]) => [id, renderProvider(id, provider)])
    ),
  };

  const active = config.active.opencode;
  if (active && !config.providers[active.provider]) {
    delete opencode.model;
  }

  await writeJsonObject(paths.opencodeConfig, opencode);
}

export async function switchOpenCode(paths: Paths, config: MswConfig) {
  const selection = requireActive(config, "opencode");
  await backupFile(paths.opencodeConfig, paths.backupDir, "opencode");
  const opencode = await readJsonObject(paths.opencodeConfig);

  const providers = asObject(opencode.provider);
  if (!providers[selection.id]) {
    throw new MswError(`opencode provider ${selection.id} is not synced; run msw sync opencode`);
  }

  opencode.model = `${selection.id}/${selection.model}`;
  await writeJsonObject(paths.opencodeConfig, opencode);
}

function renderProvider(id: string, provider: Provider) {
  return {
    name: provider.name,
    npm: "@ai-sdk/openai-compatible",
    options: {
      baseURL: baseURLForAgent({ id, provider, model: provider.defaultModel }, "opencode"),
      apiKey: `{env:${opencodeApiKeyEnvName(id)}}`,
    },
    models: provider.models,
  };
}
