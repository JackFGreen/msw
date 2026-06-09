import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { addProvider, deleteProvider, loadConfig, saveConfig, setActive } from "../src/store.js";

describe("store", () => {
  it("loads jsonc config with comments and writes with 0600 permissions", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "msw-store-"));
    const configPath = path.join(dir, "config.jsonc");
    await fs.writeFile(
      configPath,
      `{
        // provider comment
        "version": 1,
        "providers": {
          "hot": {
            "name": "Hot",
            "baseURL": "https://example.com/v1",
            "apiKey": "secret",
            "defaultModel": "gpt",
            "models": {
              "gpt": {
                "name": "gpt"
              }
            }
          }
        },
        "active": {}
      }`
    );

    const config = await loadConfig(configPath);
    expect(config.providers.hot.apiKey).toBe("secret");
    expect(config.providers.hot.models.gpt.name).toBe("gpt");

    await saveConfig(configPath, setActive(config, "codex", "hot"));
    const stat = await fs.stat(configPath);
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it("blocks deleting active providers unless forced", () => {
    const config = setActive(
      addProvider(
        {
          version: 1,
          providers: {},
          active: {}
        },
        {
          id: "hot",
          baseURL: "https://example.com/v1",
          apiKey: "secret",
          model: "gpt"
        }
      ),
      "codex",
      "hot"
    );

    expect(() => deleteProvider(config, "hot", false)).toThrow(/active/);
    expect(deleteProvider(config, "hot", true).providers.hot).toBeUndefined();
  });
});
