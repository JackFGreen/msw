#!/usr/bin/env node
import { createRequire } from "node:module";
import { Command, CommanderError } from "commander";
import { MswError } from "./errors.js";
import { createPaths } from "./paths.js";
import { assertAgent } from "./schema.js";
import {
  add,
  envOutput,
  listProviders,
  remove,
  status,
  switchAgent,
  syncAgent,
} from "./commands.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

const program = new Command();
const paths = createPaths();

program
  .name("msw")
  .description("Provider switch CLI for Claude Code, Codex, and OpenCode.")
  .version(pkg.version)
  .enablePositionalOptions();

program
  .command("list")
  .description("List providers and active agent selections.")
  .action(async () => {
    console.log(await listProviders(paths));
  });

program
  .command("status")
  .description("Show msw and target agent config paths.")
  .action(async () => {
    console.log(await status(paths));
  });

program
  .command("add")
  .argument("<id>")
  .requiredOption("--base-url <url>", "Provider base URL")
  .requiredOption("--api-key <key>", "Provider API key stored in ~/.msw/config.jsonc")
  .requiredOption("--model <model>", "Default model")
  .option("--name <name>", "Display name")
  .description("Add a provider.")
  .action(
    async (
      id: string,
      options: { name?: string; baseUrl: string; apiKey: string; model: string }
    ) => {
      await add(paths, id, options);
      console.log(`Added provider ${id}.`);
    }
  );

program
  .command("delete")
  .argument("<id>")
  .option("--force", "Delete even if active")
  .description("Delete a provider.")
  .action(async (id: string, options: { force?: boolean }) => {
    await remove(paths, id, options);
    console.log(`Deleted provider ${id}.`);
  });

program
  .command("switch")
  .argument("<agent>", "claude, codex, or opencode")
  .argument("<provider>")
  .option("--model <model>", "Override model for this agent")
  .option("--haiku", "Set ANTHROPIC_DEFAULT_HAIKU_MODEL (claude only)")
  .option("--sonnet", "Set ANTHROPIC_DEFAULT_SONNET_MODEL (claude only)")
  .option("--opus", "Set ANTHROPIC_DEFAULT_OPUS_MODEL (claude only)")
  .description("Switch an agent to a provider.")
  .action(
    async (
      agentValue: string,
      provider: string,
      options: { model?: string; haiku?: boolean; sonnet?: boolean; opus?: boolean }
    ) => {
      await switchAgent(paths, assertAgent(agentValue), provider, options);
      console.log(`Switched ${agentValue} to ${provider}.`);
    }
  );

program
  .command("sync")
  .argument("<agent>", "currently only opencode")
  .description("Sync agent config from all msw providers.")
  .action(async (agentValue: string) => {
    const agent = assertAgent(agentValue);
    await syncAgent(paths, agent);
    console.log(`Synced ${agent}.`);
  });

program
  .command("env")
  .argument("<agent>", "claude, codex, or opencode")
  .argument("[provider]")
  .option("--model <model>", "Override model")
  .description("Print shell exports for an agent.")
  .action(async (agentValue: string, provider: string | undefined, options: { model?: string }) => {
    console.log(await envOutput(paths, assertAgent(agentValue), provider, options));
  });

program.exitOverride();

try {
  await program.parseAsync(process.argv);
} catch (error) {
  if (error instanceof CommanderError) {
    process.exitCode = error.exitCode;
  } else if (error instanceof MswError || error instanceof Error) {
    console.error(`msw: ${error.message}`);
    process.exitCode = 1;
  } else {
    console.error(`msw: ${String(error)}`);
    process.exitCode = 1;
  }
}
