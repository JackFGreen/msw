import { backupFile } from "../backup.js";
import { baseURLForAgent, opencodeApiKeyEnvName } from "../env.js";
import { MswError } from "../errors.js";
import type { Paths } from "../paths.js";
import { requireActive } from "../store.js";
import type { ModelConfig, MswConfig, Provider } from "../types.js";
import { asObject, readJsonObject, writeJsonObject } from "./common.js";

const openaiCompatiblePackage = "@opencode/ai/providers/openai-compatible";

export async function syncOpenCode(paths: Paths, config: MswConfig) {
  await backupFile(paths.opencodeConfig, paths.backupDir, "opencode");
  const opencode = await readJsonObject(paths.opencodeConfig);
  const existingProviders = asObject(opencode.providers);
  delete opencode.provider;

  opencode.providers = {
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

  const providers = asObject(opencode.providers);
  if (!providers[selection.id]) {
    throw new MswError(`opencode provider ${selection.id} is not synced; run msw sync opencode`);
  }

  opencode.model = `${selection.id}/${selection.model}`;
  await writeJsonObject(paths.opencodeConfig, opencode);
}

function renderProvider(id: string, provider: Provider) {
  return {
    name: provider.name,
    package: openaiCompatiblePackage,
    settings: {
      baseURL: baseURLForAgent({ id, provider, model: provider.defaultModel }, "opencode"),
      apiKey: `{env:${opencodeApiKeyEnvName(id)}}`,
    },
    models: Object.fromEntries(
      Object.entries(provider.models).map(([modelId, model]) => [modelId, renderModel(model)])
    ),
  };
}

function renderModel(model: ModelConfig) {
  return {
    name: model.name,
    ...(model.limit && { limit: model.limit }),
    ...(model.modalities && {
      capabilities: {
        ...(model.modalities.input && { input: model.modalities.input }),
        ...(model.modalities.output && { output: model.modalities.output }),
      },
    }),
    ...(model.variants && {
      variants: Object.entries(model.variants).map(([id, variant]) => ({
        id,
        ...(variant.options && { settings: variant.options }),
      })),
    }),
  };
}
