import fs from "node:fs/promises";
import { parse, stringify } from "comment-json";
import { MswError } from "./errors.js";
import { atomicWrite, pathExists } from "./fs-utils.js";
import { addProviderSchema, configSchema, editProviderSchema } from "./schema.js";
import type { Agent, MswConfig, Provider } from "./types.js";

const defaultConfig: MswConfig = {
  version: 1,
  providers: {},
  active: {},
};

export async function loadConfig(configPath: string): Promise<MswConfig> {
  if (!(await pathExists(configPath))) {
    return defaultConfig;
  }

  let raw: string;
  try {
    raw = await fs.readFile(configPath, "utf8");
  } catch (error) {
    throw new MswError(`failed to read msw config: ${formatError(error)}`);
  }

  try {
    const parsed = parse(raw);
    return configSchema.parse(parsed);
  } catch (error) {
    throw new MswError(`invalid msw config ${configPath}: ${formatError(error)}`);
  }
}

export async function saveConfig(configPath: string, config: MswConfig) {
  const parsed = configSchema.parse(config);
  const body = `${stringify(parsed, null, 2)}\n`;
  await atomicWrite(configPath, body, 0o600);
}

export function addProvider(config: MswConfig, input: unknown): MswConfig {
  const parsed = addProviderSchema.parse(input);
  if (config.providers[parsed.id]) {
    throw new MswError(`provider already exists: ${parsed.id}`);
  }

  return {
    ...config,
    providers: {
      ...config.providers,
      [parsed.id]: {
        name: parsed.name ?? parsed.id,
        baseURL: parsed.baseURL,
        ...(parsed.claude && { baseURLs: { claude: parsed.baseURL } }),
        apiKey: parsed.apiKey,
        defaultModel: parsed.model,
        models: {
          [parsed.model]: {
            name: parsed.model,
          },
        },
      },
    },
  };
}

export function editProvider(config: MswConfig, id: string, input: unknown): MswConfig {
  const provider = config.providers[id];
  if (!provider) {
    throw new MswError(`unknown provider: ${id}`);
  }

  const parsed = editProviderSchema.parse(input);
  const { model, claude, baseURL, removeModels, ...fields } = parsed;
  const changes = Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined)
  );

  const removedModels = new Set(removeModels ?? []);
  if (removedModels.size > 0) {
    for (const removed of removedModels) {
      if (!provider.models[removed]) {
        throw new MswError(`unknown model "${removed}" for provider "${id}"`);
      }
    }

    if (removedModels.has(provider.defaultModel) && model === undefined) {
      throw new MswError(
        `cannot remove default model "${provider.defaultModel}"; pass --model <new-default>`
      );
    }

    const activeReference = findActiveModelReference(config, id, removedModels);
    if (activeReference) {
      throw new MswError(
        `model "${activeReference.model}" is active for ${activeReference.agent}; run \`msw switch ${activeReference.agent} ${id} --model <model>\` first`
      );
    }
  }

  const modelsAfterRemoval = Object.fromEntries(
    Object.entries(provider.models).filter(([name]) => !removedModels.has(name))
  );
  if (model !== undefined) {
    modelsAfterRemoval[model] = provider.models[model] ?? { name: model };
  }

  return {
    ...config,
    providers: {
      ...config.providers,
      [id]: {
        ...provider,
        ...changes,
        ...(baseURL !== undefined &&
          (claude ? { baseURLs: { ...provider.baseURLs, claude: baseURL } } : { baseURL })),
        ...(model !== undefined && {
          defaultModel: model,
        }),
        ...((model !== undefined || removedModels.size > 0) && {
          models: modelsAfterRemoval,
        }),
      },
    },
  };
}

function findActiveModelReference(config: MswConfig, providerId: string, models: Set<string>) {
  for (const [agent, selection] of Object.entries(config.active)) {
    if (!selection || selection.provider !== providerId) continue;

    const model = [
      selection.model,
      selection.modelOverrides?.haiku,
      selection.modelOverrides?.sonnet,
      selection.modelOverrides?.opus,
    ].find((value): value is string => value !== undefined && models.has(value));

    if (model) {
      return { agent, model };
    }
  }

  return undefined;
}

export function deleteProvider(config: MswConfig, id: string, force: boolean): MswConfig {
  if (!config.providers[id]) {
    throw new MswError(`unknown provider: ${id}`);
  }

  const activeAgents = Object.entries(config.active)
    .filter(([, selection]) => selection?.provider === id)
    .map(([agent]) => agent);

  if (activeAgents.length > 0 && !force) {
    throw new MswError(`provider is active for ${activeAgents.join(", ")}; pass --force to delete`);
  }

  const providers = { ...config.providers };
  delete providers[id];

  const active = { ...config.active };
  for (const agent of activeAgents) {
    delete active[agent as Agent];
  }

  return { ...config, providers, active };
}

export function setActive(
  config: MswConfig,
  agent: Agent,
  provider: string,
  model?: string,
  modelOverrides?: { haiku?: string; sonnet?: string; opus?: string },
  effort?: string
): MswConfig {
  const selected = config.providers[provider];
  if (!selected) {
    throw new MswError(`unknown provider: ${provider}`);
  }

  const current = config.active[agent];
  const existingOverrides = current?.provider === provider ? current.modelOverrides : undefined;
  const existingEffort = current?.provider === provider ? current.effort : undefined;
  const selectedEffort = effort ?? existingEffort;
  const selectedModel = model ?? selected.defaultModel;
  if (effort !== undefined) {
    validateEffort(agent, provider, selected, selectedModel, effort);
  }

  return {
    ...config,
    active: {
      ...config.active,
      [agent]: {
        provider,
        model: selectedModel,
        ...(selectedEffort && { effort: selectedEffort }),
        modelOverrides: modelOverrides
          ? { ...existingOverrides, ...modelOverrides }
          : existingOverrides,
      },
    },
  };
}

function validateEffort(
  agent: Agent,
  id: string,
  provider: Provider,
  model: string,
  effort: string
) {
  const variants = provider.models[model]?.variants;
  if (!variants) return;

  if (!variants[effort]) {
    const available = Object.keys(variants).join(", ") || "<none>";
    throw new MswError(
      `unknown effort "${effort}" for ${agent} model "${id}/${model}"; configured variants: ${available}`
    );
  }
}

export function requireActive(
  config: MswConfig,
  agent: Agent,
  providerOverride?: string,
  modelOverride?: string
) {
  const active = config.active[agent];
  const selection = providerOverride
    ? {
        provider: providerOverride,
        model: modelOverride ?? config.providers[providerOverride]?.defaultModel,
        effort: active && active.provider === providerOverride ? active.effort : undefined,
      }
    : active;

  if (!selection?.provider || !selection.model) {
    throw new MswError(`no active provider for ${agent}`);
  }

  const provider = config.providers[selection.provider];
  if (!provider) {
    throw new MswError(`unknown provider: ${selection.provider}`);
  }

  return {
    id: selection.provider,
    provider,
    model: modelOverride ?? selection.model,
    effort: selection.effort,
    modelOverrides: active?.modelOverrides,
  };
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
