import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { createPaths } from "../src/paths.js";
import { envOutput } from "../src/commands.js";
import { editProvider, loadConfig, saveConfig } from "../src/store.js";
import type { MswConfig } from "../src/types.js";

const execFileAsync = promisify(execFile);
const homes: string[] = [];

function fixture(): MswConfig {
  const provider = {
    name: "Hot",
    baseURL: "https://example.com/v1",
    baseURLs: { claude: "https://example.com/anthropic" },
    apiKey: "old-secret",
    defaultModel: "gpt",
    models: { gpt: { name: "GPT", limit: { context: 100000 } } },
  };
  return {
    version: 1,
    providers: { hot: provider, cold: { ...provider, name: "Cold" } },
    active: { claude: { provider: "hot", model: "gpt", modelOverrides: { haiku: "mini" } } },
  };
}

function fixtureWithExtraModels(): MswConfig {
  const config = fixture();
  config.providers.hot.models.old = { name: "Old", limit: { context: 1000 } };
  config.providers.hot.models.mini = { name: "Mini" };
  return config;
}

async function setup() {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "msw-edit-"));
  homes.push(home);
  const paths = createPaths(home);
  await saveConfig(paths.mswConfig, fixture());
  return { home, paths };
}

function runCli(home: string, args: string[], command = "edit") {
  return execFileAsync(process.execPath, ["--import", "tsx", "src/cli.ts", command, ...args], {
    env: { ...process.env, HOME: home },
  });
}

afterEach(async () => {
  await Promise.all(homes.splice(0).map((home) => fs.rm(home, { recursive: true, force: true })));
});

describe("editProvider", () => {
  it("updates only supplied fields without mutating the input", () => {
    const config = fixture();
    const original = structuredClone(config);
    const edited = editProvider(config, "hot", { name: "New name", apiKey: undefined });
    expect(edited.providers.hot).toEqual({ ...config.providers.hot, name: "New name" });
    expect(edited.providers.cold).toEqual(config.providers.cold);
    expect(edited.active).toEqual(config.active);
    expect(config).toEqual(original);
  });

  it("updates multiple fields and adds a missing default model", () => {
    const config = fixture();
    const edited = editProvider(config, "hot", {
      name: "New name",
      apiKey: "new-secret",
      baseURL: "https://new.example.com/v1",
      model: "new-model",
    });
    expect(edited.providers.hot).toEqual({
      ...config.providers.hot,
      name: "New name",
      apiKey: "new-secret",
      baseURL: "https://new.example.com/v1",
      defaultModel: "new-model",
      models: { ...config.providers.hot.models, "new-model": { name: "new-model" } },
    });
    expect(edited.active).toEqual(config.active);
    expect(config).toEqual(fixture());
  });

  it("preserves metadata when selecting an existing model", () => {
    const config = fixture();
    expect(editProvider(config, "hot", { model: "gpt" }).providers.hot.models).toEqual(
      config.providers.hot.models
    );
  });

  it("removes a non-default model without mutating the input", () => {
    const config = fixtureWithExtraModels();
    const original = structuredClone(config);
    const edited = editProvider(config, "hot", { removeModels: ["old"] });

    expect(edited.providers.hot.models.old).toBeUndefined();
    expect(edited.providers.hot.models.gpt).toEqual(config.providers.hot.models.gpt);
    expect(edited.providers.hot.models.mini).toEqual(config.providers.hot.models.mini);
    expect(edited.providers.hot.defaultModel).toBe("gpt");
    expect(edited.active).toEqual(config.active);
    expect(config).toEqual(original);
  });

  it("removes the default model when a replacement default is supplied", () => {
    const config = { ...fixture(), active: {} };
    const edited = editProvider(config, "hot", {
      model: "new-model",
      removeModels: ["gpt"],
    });

    expect(edited.providers.hot.defaultModel).toBe("new-model");
    expect(edited.providers.hot.models.gpt).toBeUndefined();
    expect(edited.providers.hot.models["new-model"]).toEqual({ name: "new-model" });
  });

  it("rejects removing the default model without a replacement", () => {
    const config = { ...fixture(), active: {} };
    expect(() => editProvider(config, "hot", { removeModels: ["gpt"] })).toThrow(
      'cannot remove default model "gpt"'
    );
  });

  it("rejects removing unknown models", () => {
    expect(() => editProvider(fixture(), "hot", { removeModels: ["missing"] })).toThrow(
      'unknown model "missing"'
    );
  });

  it("rejects removing a model referenced by an active selection", () => {
    const config = fixtureWithExtraModels();
    config.providers.hot.defaultModel = "new-default";
    config.providers.hot.models["new-default"] = { name: "New default" };

    expect(() => editProvider(config, "hot", { removeModels: ["gpt"] })).toThrow(
      "active for claude"
    );
  });

  it("rejects removing a model referenced by an active model override", () => {
    expect(() => editProvider(fixtureWithExtraModels(), "hot", { removeModels: ["mini"] })).toThrow(
      "active for claude"
    );
  });

  it("rejects setting and removing the same model", () => {
    expect(() => editProvider(fixture(), "hot", { model: "gpt", removeModels: ["gpt"] })).toThrow(
      "cannot set and remove the same model"
    );
  });

  it("rejects unknown providers", () => {
    expect(() => editProvider(fixture(), "missing", { name: "New" })).toThrow(
      "unknown provider: missing"
    );
  });

  it.each([
    {},
    { name: undefined },
    { name: "" },
    { apiKey: "" },
    { baseURL: "" },
    { baseURL: "invalid" },
    { model: "" },
    { removeModels: [] },
  ])("rejects invalid changes: %j", (changes) => {
    expect(() => editProvider(fixture(), "hot", changes)).toThrow();
  });
});

describe("edit CLI", () => {
  it("edits only the Claude URL and preserves other agent URLs", async () => {
    const { home, paths } = await setup();
    const original = fixture();
    original.providers.hot.baseURLs = {
      ...original.providers.hot.baseURLs,
      codex: "https://codex.example.com/v1",
      opencode: "https://opencode.example.com/v1",
    };
    await saveConfig(paths.mswConfig, original);
    await runCli(home, ["hot", "--claude", "--base-url=https://new.example.com/anthropic"]);
    const edited = await loadConfig(paths.mswConfig);
    expect(edited).toEqual({
      ...original,
      providers: {
        ...original.providers,
        hot: {
          ...original.providers.hot,
          baseURLs: {
            ...original.providers.hot.baseURLs,
            claude: "https://new.example.com/anthropic",
          },
        },
      },
    });
    expect(await envOutput(paths, "claude")).toContain("https://new.example.com/anthropic");
  });

  it("creates a Claude override when no agent URLs exist", async () => {
    const { home, paths } = await setup();
    const original = fixture();
    delete original.providers.hot.baseURLs;
    await saveConfig(paths.mswConfig, original);
    await runCli(home, ["hot", "--base-url", "https://new.example.com/anthropic", "--claude"]);
    const edited = await loadConfig(paths.mswConfig);
    expect(edited.providers.hot.baseURL).toBe(original.providers.hot.baseURL);
    expect(edited.providers.hot.baseURLs).toEqual({ claude: "https://new.example.com/anthropic" });
  });

  it("accepts equals and space syntax and saves with private permissions", async () => {
    const { home, paths } = await setup();
    const { stdout, stderr } = await runCli(home, [
      "hot",
      "--name=New name",
      "--api-key=new-secret",
      "--base-url",
      "https://new.example.com/v1",
      "--model",
      "new-model",
    ]);
    expect(stdout).toBe("Updated provider hot.\n");
    expect(stderr).toBe("");
    const config = await loadConfig(paths.mswConfig);
    expect(config.providers.hot.name).toBe("New name");
    expect(config.providers.hot.apiKey).toBe("new-secret");
    expect(config.providers.hot.baseURL).toBe("https://new.example.com/v1");
    expect(config.providers.hot.baseURLs).toEqual(fixture().providers.hot.baseURLs);
    expect(config.providers.hot.defaultModel).toBe("new-model");
    expect(config.providers.hot.models["new-model"]).toEqual({ name: "new-model" });
    expect(config.active).toEqual(fixture().active);
    expect((await fs.stat(paths.mswConfig)).mode & 0o777).toBe(0o600);
    expect(await fs.readdir(home)).toEqual([".msw"]);
  });

  it("removes a model with --remove-model", async () => {
    const { home, paths } = await setup();
    const original = fixtureWithExtraModels();
    await saveConfig(paths.mswConfig, original);

    const { stdout, stderr } = await runCli(home, ["hot", "--remove-model", "old"]);

    expect(stdout).toBe("Updated provider hot.\n");
    expect(stderr).toBe("");
    const edited = await loadConfig(paths.mswConfig);
    expect(edited.providers.hot.models.old).toBeUndefined();
    expect(edited.providers.hot.models.gpt).toEqual(original.providers.hot.models.gpt);
    expect(edited.providers.hot.models.mini).toEqual(original.providers.hot.models.mini);
    expect(edited.providers.hot.defaultModel).toBe("gpt");
    expect(edited.active).toEqual(original.active);
  });

  it("accepts repeated --remove-model options", async () => {
    const { home, paths } = await setup();
    const original = fixture();
    original.providers.hot.models.a = { name: "A" };
    original.providers.hot.models.b = { name: "B" };
    await saveConfig(paths.mswConfig, original);

    await runCli(home, ["hot", "--remove-model=a", "--remove-model", "b"]);

    const edited = await loadConfig(paths.mswConfig);
    expect(edited.providers.hot.models.a).toBeUndefined();
    expect(edited.providers.hot.models.b).toBeUndefined();
    expect(edited.providers.hot.models.gpt).toEqual(original.providers.hot.models.gpt);
  });

  it("removes the default model when --model supplies a replacement", async () => {
    const { home, paths } = await setup();
    const original = { ...fixture(), active: {} };
    await saveConfig(paths.mswConfig, original);

    await runCli(home, ["hot", "--model", "new-model", "--remove-model", "gpt"]);

    const edited = await loadConfig(paths.mswConfig);
    expect(edited.providers.hot.defaultModel).toBe("new-model");
    expect(edited.providers.hot.models.gpt).toBeUndefined();
    expect(edited.providers.hot.models["new-model"]).toEqual({ name: "new-model" });
  });

  it("rejects removing an active model without rewriting config", async () => {
    const { home, paths } = await setup();
    const original = fixtureWithExtraModels();
    await saveConfig(paths.mswConfig, original);
    const before = await fs.readFile(paths.mswConfig, "utf8");

    await expect(runCli(home, ["hot", "--remove-model=mini"])).rejects.toMatchObject({ code: 1 });
    expect(await fs.readFile(paths.mswConfig, "utf8")).toBe(before);
  });

  it.each([
    ["hot"],
    ["missing", "--name=New"],
    ["hot", "--key=new-secret"],
    ["hot", "--name="],
    ["hot", "--api-key="],
    ["hot", "--base-url=invalid"],
    ["hot", "--model="],
    ["hot", "--remove-model="],
    ["hot", "--remove-model=missing"],
    ["hot", "--remove-model=gpt"],
    ["hot", "--model=gpt", "--remove-model=gpt"],
    ["hot", "--claude"],
    ["hot", "--claude", "--name=New"],
    ["hot", "--claude", "--base-url=invalid"],
  ])("fails without rewriting config for %j", async (...args) => {
    const { home, paths } = await setup();
    const before = await fs.readFile(paths.mswConfig, "utf8");
    await expect(runCli(home, args)).rejects.toMatchObject({ code: 1 });
    expect(await fs.readFile(paths.mswConfig, "utf8")).toBe(before);
  });
});

describe("add CLI Claude URL", () => {
  it.each([false, true])("creates a valid provider with --claude=%s", async (claude) => {
    const { home, paths } = await setup();
    await runCli(
      home,
      [
        "new",
        "--base-url=https://new.example.com/anthropic",
        "--api-key=new-secret",
        "--model=claude-model",
        ...(claude ? ["--claude"] : []),
      ],
      "add"
    );
    const config = await loadConfig(paths.mswConfig);
    expect(config.providers.new.baseURL).toBe("https://new.example.com/anthropic");
    expect(config.providers.new.baseURLs).toEqual(
      claude ? { claude: "https://new.example.com/anthropic" } : undefined
    );
    expect(config.providers.hot).toEqual(fixture().providers.hot);
    expect(config.active).toEqual(fixture().active);
  });

  it("requires a base URL and rejects invalid Claude URLs without writing", async () => {
    const { home, paths } = await setup();
    const before = await fs.readFile(paths.mswConfig, "utf8");
    for (const urlArgs of [[], ["--base-url=invalid"]]) {
      await expect(
        runCli(
          home,
          ["new", "--claude", "--api-key=new-secret", "--model=claude-model", ...urlArgs],
          "add"
        )
      ).rejects.toMatchObject({ code: 1 });
      expect(await fs.readFile(paths.mswConfig, "utf8")).toBe(before);
    }
  });
});
