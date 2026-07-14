import type { Agent, MswConfig, ModelOverrides, Provider } from "./types.js";
import { requireActive } from "./store.js";

export type EnvSelection = {
  id: string;
  provider: Provider;
  model: string;
  modelOverrides?: ModelOverrides;
};

export function buildEnv(
  config: MswConfig,
  agent: Agent,
  providerOverride?: string,
  modelOverride?: string
) {
  if (agent === "opencode" && !providerOverride) {
    return buildOpenCodeAllProviderEnv(config);
  }

  const selection = requireActive(config, agent, providerOverride, modelOverride);
  return buildEnvForSelection(agent, selection);
}

function claudeModelName(selection: EnvSelection): string {
  const modelConfig = selection.provider.models[selection.model];
  const context = modelConfig?.limit?.context;
  if (typeof context === "number" && context >= 1_000_000) {
    return `${selection.model}[1m]`;
  }
  return selection.model;
}

export function buildEnvForSelection(
  agent: Agent,
  selection: EnvSelection
): Record<string, string> {
  switch (agent) {
    case "claude": {
      const model = claudeModelName(selection);
      const overrides = selection.modelOverrides;
      const haikuModel = overrides?.haiku
        ? claudeModelName({ ...selection, model: overrides.haiku })
        : model;
      const sonnetModel = overrides?.sonnet
        ? claudeModelName({ ...selection, model: overrides.sonnet })
        : model;
      const opusModel = overrides?.opus
        ? claudeModelName({ ...selection, model: overrides.opus })
        : model;

      return {
        ANTHROPIC_BASE_URL: baseURLForAgent(selection, "claude"),
        ANTHROPIC_AUTH_TOKEN: selection.provider.apiKey,
        ANTHROPIC_MODEL: model,
        ANTHROPIC_DEFAULT_SONNET_MODEL: sonnetModel,
        ANTHROPIC_DEFAULT_OPUS_MODEL: opusModel,
        ANTHROPIC_DEFAULT_HAIKU_MODEL: haikuModel,
      };
    }
    case "codex":
      return {
        MSW_CODEX_API_KEY: selection.provider.apiKey,
      };
    case "opencode":
      return {
        [opencodeApiKeyEnvName(selection.id)]: selection.provider.apiKey,
      };
  }
}

export function baseURLForAgent(selection: EnvSelection, agent: Agent) {
  return selection.provider.baseURLs?.[agent] ?? selection.provider.baseURL;
}

export function buildOpenCodeAllProviderEnv(config: MswConfig) {
  return Object.fromEntries(
    Object.entries(config.providers).map(([id, provider]) => [
      opencodeApiKeyEnvName(id),
      provider.apiKey,
    ])
  );
}

export function shellExports(env: Record<string, string>) {
  return Object.entries(env)
    .map(([key, value]) => `export ${key}=${shellQuote(value)}`)
    .join("\n");
}

export function opencodeApiKeyEnvName(providerId: string) {
  return `MSW_OPENCODE_${providerId.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`;
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
