import fs from "node:fs/promises";
import { parse, stringify } from "comment-json";
import { MswError } from "./errors.js";
import { atomicWrite, pathExists } from "./fs-utils.js";
import { addProviderSchema, configSchema } from "./schema.js";
import type { Agent, MswConfig } from "./types.js";

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
  model?: string
): MswConfig {
  const selected = config.providers[provider];
  if (!selected) {
    throw new MswError(`unknown provider: ${provider}`);
  }

  return {
    ...config,
    active: {
      ...config.active,
      [agent]: {
        provider,
        model: model ?? selected.defaultModel,
      },
    },
  };
}

export function requireActive(
  config: MswConfig,
  agent: Agent,
  providerOverride?: string,
  modelOverride?: string
) {
  const selection = providerOverride
    ? {
        provider: providerOverride,
        model: modelOverride ?? config.providers[providerOverride]?.defaultModel,
      }
    : config.active[agent];

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
  };
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
