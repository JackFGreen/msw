import type { Agent, MswConfig, Provider } from "./types.js";
import { requireActive } from "./store.js";

export type EnvSelection = {
  id: string;
  provider: Provider;
  model: string;
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

export function buildEnvForSelection(
  agent: Agent,
  selection: EnvSelection
): Record<string, string> {
  switch (agent) {
    case "claude":
      return {
        ANTHROPIC_BASE_URL: baseURLForAgent(selection, "claude"),
        ANTHROPIC_AUTH_TOKEN: selection.provider.apiKey,
        ANTHROPIC_MODEL: selection.model,
        ANTHROPIC_DEFAULT_SONNET_MODEL: selection.model,
        ANTHROPIC_DEFAULT_OPUS_MODEL: selection.model,
        ANTHROPIC_DEFAULT_HAIKU_MODEL: selection.model,
      };
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
