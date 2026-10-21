import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { switchAgent } from "../src/commands.js";
import { createPaths } from "../src/paths.js";
import { saveConfig } from "../src/store.js";
import type { MswConfig } from "../src/types.js";

const baseConfig: MswConfig = {
  version: 1,
  providers: {
    hot: {
      name: "Hot",
      baseURL: "https://example.com/v1",
      apiKey: "secret",
      defaultModel: "gpt",
      models: {
        gpt: {
          name: "gpt",
        },
      },
    },
  },
  active: {},
};

async function setup(codexConfig: string) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "msw-origin-"));
  const paths = createPaths(home);
  await fs.mkdir(path.dirname(paths.codexConfig), { recursive: true });
  await fs.writeFile(paths.codexConfig, codexConfig);
  await saveConfig(paths.mswConfig, structuredClone(baseConfig));
  return paths;
}

describe("switch origin", () => {
  it("undoes the msw codex injection without rolling the whole file back", async () => {
    const paths = await setup(`model = "default"\n`);

    await switchAgent(paths, "codex", "hot", {});
    expect(await fs.readFile(paths.codexConfig, "utf8")).toContain("model_provider");

    await switchAgent(paths, "codex", "origin", {});
    const after = await fs.readFile(paths.codexConfig, "utf8");

    // msw's own fields are gone: no model_provider, no model, no msw provider table.
    expect(after).not.toContain("model_provider");
    expect(after).not.toMatch(/^model = /m);
    expect(after).not.toContain("MSW_CODEX_API_KEY");

    // The fixed origin backup written before the first switch is untouched.
    expect(
      await fs.readFile(path.join(path.dirname(paths.codexConfig), "config.msw-bak.toml"), "utf8")
    ).toBe(`model = "default"\n`);

    const saved = await fs.readFile(paths.mswConfig, "utf8");
    expect(saved).not.toContain('"codex"');
  });

  it("keeps app-owned fields that the origin snapshot predates", async () => {
    const paths = await setup(`model = "default"\n`);
    await switchAgent(paths, "codex", "hot", {});

    // Simulate the Codex app writing new settings after msw's snapshot was taken.
    const codex = paths.codexConfig;
    const raw = await fs.readFile(codex, "utf8");
    await fs.writeFile(
      codex,
      `${raw}\n[desktop]\nfollowUpQueueMode = "queue"\n\n[plugins."browser@openai-bundled"]\nenabled = true\n`
    );

    await switchAgent(paths, "codex", "origin", {});
    const after = await fs.readFile(codex, "utf8");

    // These only exist in the live config, not in the origin backup, so a whole-file
    // restore would have dropped them.
    expect(after).toContain("followUpQueueMode");
    expect(after).toContain("browser@openai-bundled");
    expect(after).not.toContain("MSW_CODEX_API_KEY");
  });

  it("clears leftover msw provider tables even when active.codex is already gone", async () => {
    const paths = await setup(
      [
        `model = "gpt-5.6-luna"`,
        ``,
        `[model_providers.deepseek]`,
        `name = "deepseek"`,
        `base_url = "https://api.deepseek.com/"`,
        `env_key = "MSW_CODEX_API_KEY"`,
        ``,
        `[model_providers.mimo-cn]`,
        `name = "MiMo CN"`,
        `base_url = "https://api.xiaomimimo.com/v1"`,
        `env_key = "MSW_CODEX_API_KEY"`,
        ``,
        `[model_providers.mine]`,
        `name = "Mine"`,
        `base_url = "https://mine.example.com/v1"`,
        `env_key = "MY_OWN_KEY"`,
        ``,
      ].join("\n")
    );

    await switchAgent(paths, "codex", "origin", {});
    const after = await fs.readFile(paths.codexConfig, "utf8");

    // The model was never written by msw here (active.codex is unset), so it survives.
    expect(after).toContain('model = "gpt-5.6-luna"');

    // Every msw-marked table goes, the hand-written one stays.
    expect(after).not.toContain("MSW_CODEX_API_KEY");
    expect(after).not.toContain("deepseek");
    expect(after).not.toContain("mimo-cn");
    expect(after).toContain("[model_providers.mine]");
    expect(after).toContain("MY_OWN_KEY");
  });

  it("keeps a model chosen later inside the Codex app", async () => {
    const paths = await setup(`model = "gpt-5.6-luna"\n`);
    await switchAgent(paths, "codex", "hot", { effort: "high" });

    // After switching, the user picks a different model directly in the Codex app.
    const codex = paths.codexConfig;
    const raw = await fs.readFile(codex, "utf8");
    await fs.writeFile(codex, raw.replace(/^model = "gpt"$/m, `model = "gpt-5.6-luna"`));

    await switchAgent(paths, "codex", "origin", {});
    const after = await fs.readFile(codex, "utf8");

    // No longer equal to what msw recorded, so it must not be removed.
    expect(after).toContain('model = "gpt-5.6-luna"');
    expect(after).not.toContain("MSW_CODEX_API_KEY");
    // The effort still matches what msw wrote, so that one goes.
    expect(after).not.toContain("model_reasoning_effort");
  });

  it("succeeds without writing when there is nothing to undo", async () => {
    const original = `model = "gpt-5.6-luna"\n\n[notice]\nhide_full_access_warning = true\n`;
    const paths = await setup(original);

    await switchAgent(paths, "codex", "origin", {});

    expect(await fs.readFile(paths.codexConfig, "utf8")).toBe(original);
    // active.codex is cleared either way.
    expect(await fs.readFile(paths.mswConfig, "utf8")).not.toContain('"codex"');
  });
});
