import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { switchAgent } from "../src/commands.js";
import { createPaths } from "../src/paths.js";
import { saveConfig } from "../src/store.js";

describe("switch origin", () => {
  it("restores origin config and clears active agent", async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "msw-origin-"));
    const paths = createPaths(home);
    await fs.mkdir(path.dirname(paths.codexConfig), { recursive: true });
    await fs.writeFile(paths.codexConfig, `model = "default"\n`);
    await saveConfig(paths.mswConfig, {
      version: 1,
      providers: {
        hot: {
          name: "Hot",
          baseURL: "https://example.com/v1",
          apiKey: "secret",
          defaultModel: "gpt",
          models: {
            gpt: {
              name: "gpt"
            }
          }
        }
      },
      active: {}
    });

    await switchAgent(paths, "codex", "hot", {});
    expect(await fs.readFile(paths.codexConfig, "utf8")).toContain("model_provider");

    await switchAgent(paths, "codex", "origin", {});
    expect(await fs.readFile(paths.codexConfig, "utf8")).toBe(`model = "default"\n`);
    expect(await fs.readFile(path.join(path.dirname(paths.codexConfig), "config.msw-bak.toml"), "utf8")).toBe(
      `model = "default"\n`
    );

    const saved = await fs.readFile(paths.mswConfig, "utf8");
    expect(saved).not.toContain('"codex"');
  });
});
