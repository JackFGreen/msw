import { MswError } from "./errors.js";
import { restoreOriginBackup } from "./backup.js";
import type { Paths } from "./paths.js";
import { switchClaude } from "./renderers/claude.js";
import { switchCodex } from "./renderers/codex.js";
import { syncOpenCode, switchOpenCode } from "./renderers/opencode.js";
import { addProvider, deleteProvider, loadConfig, saveConfig, setActive } from "./store.js";
import type { Agent, MswConfig } from "./types.js";
import { buildEnv, shellExports } from "./env.js";

export async function listProviders(paths: Paths) {
  const config = await loadConfig(paths.mswConfig);
  const rows = Object.entries(config.providers).map(([id, provider]) => ({
    id,
    name: provider.name,
    baseURL: provider.baseURL ?? "",
    defaultModel: provider.defaultModel,
    models: Object.keys(provider.models).join(", "),
    active: activeAgents(config, id).join(", "),
  }));

  if (rows.length === 0) {
    return "No providers configured.";
  }

  return table(rows, ["id", "name", "baseURL", "defaultModel", "models", "active"]);
}

export async function status(paths: Paths) {
  const config = await loadConfig(paths.mswConfig);
  const lines = [
    `msw config: ${paths.mswConfig}`,
    `claude config: ${paths.claudeSettings}`,
    `codex config: ${paths.codexConfig}`,
    `opencode config: ${paths.opencodeConfig}`,
    "",
    "active:",
  ];

  for (const agent of ["claude", "codex", "opencode"] as const) {
    const selection = config.active[agent];
    lines.push(
      selection ? `  ${agent}: ${selection.provider}/${selection.model}` : `  ${agent}: <none>`
    );
  }

  return lines.join("\n");
}

export async function add(
  paths: Paths,
  id: string,
  options: { name?: string; baseUrl: string; apiKey: string; model: string }
) {
  const config = await loadConfig(paths.mswConfig);
  await saveConfig(
    paths.mswConfig,
    addProvider(config, {
      id,
      name: options.name,
      baseURL: options.baseUrl,
      apiKey: options.apiKey,
      model: options.model,
    })
  );
}

export async function remove(paths: Paths, id: string, options: { force?: boolean }) {
  const config = await loadConfig(paths.mswConfig);
  await saveConfig(paths.mswConfig, deleteProvider(config, id, Boolean(options.force)));
}

export async function switchAgent(
  paths: Paths,
  agent: Agent,
  provider: string,
  options: { model?: string }
) {
  if (provider === "origin") {
    await restoreAgentOrigin(paths, agent);
    const config = await loadConfig(paths.mswConfig);
    const active = { ...config.active };
    delete active[agent];
    await saveConfig(paths.mswConfig, { ...config, active });
    return;
  }

  const config = setActive(await loadConfig(paths.mswConfig), agent, provider, options.model);
  await saveConfig(paths.mswConfig, config);

  switch (agent) {
    case "claude":
      await switchClaude(paths);
      return;
    case "codex":
      await switchCodex(paths, config);
      return;
    case "opencode":
      await switchOpenCode(paths, config);
      return;
  }
}

async function restoreAgentOrigin(paths: Paths, agent: Agent) {
  const restored = await restoreOriginBackup(agentConfigPath(paths, agent), paths.backupDir, agent);
  if (!restored) {
    throw new MswError(`no origin backup found for ${agent}`);
  }
}

function agentConfigPath(paths: Paths, agent: Agent) {
  switch (agent) {
    case "claude":
      return paths.claudeSettings;
    case "codex":
      return paths.codexConfig;
    case "opencode":
      return paths.opencodeConfig;
  }
}

export async function syncAgent(paths: Paths, agent: Agent) {
  const config = await loadConfig(paths.mswConfig);
  if (agent !== "opencode") {
    throw new MswError(`sync is only supported for opencode`);
  }

  await syncOpenCode(paths, config);
}

export async function envOutput(
  paths: Paths,
  agent: Agent,
  providerOverride?: string,
  options: { model?: string } = {}
) {
  const config = await loadConfig(paths.mswConfig);
  if (!providerOverride && !config.active[agent]) {
    return "";
  }
  return shellExports(buildEnv(config, agent, providerOverride, options.model));
}

function activeAgents(config: MswConfig, providerId: string) {
  return Object.entries(config.active)
    .filter(([, selection]) => selection?.provider === providerId)
    .map(([agent]) => agent);
}

function table(rows: Array<Record<string, string>>, columns: string[]) {
  const widths = Object.fromEntries(
    columns.map((column) => [
      column,
      Math.max(column.length, ...rows.map((row) => String(row[column] ?? "").length)),
    ])
  );

  const formatRow = (row: Record<string, string>) =>
    columns.map((column) => String(row[column] ?? "").padEnd(widths[column])).join("  ");

  return [
    formatRow(Object.fromEntries(columns.map((column) => [column, column]))),
    ...rows.map(formatRow),
  ].join("\n");
}
