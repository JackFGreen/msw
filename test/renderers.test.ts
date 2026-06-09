import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse as parseJson } from "comment-json";
import { parse as parseToml } from "smol-toml";
import { describe, expect, it } from "vitest";
import { createPaths } from "../src/paths.js";
import { switchCodex } from "../src/renderers/codex.js";
import { syncOpenCode, switchOpenCode } from "../src/renderers/opencode.js";
import type { MswConfig } from "../src/types.js";

async function tempPaths() {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "msw-render-"));
  return createPaths(home);
}

const config: MswConfig = {
  version: 1,
  providers: {
    hot: {
      name: "Hot",
      baseURL: "https://hot.example/v1",
      apiKey: "hot-secret",
      defaultModel: "gpt-hot",
      models: {
        "gpt-hot": {
          name: "gpt-hot"
        }
      }
    },
    cold: {
      name: "Cold",
      baseURL: "https://cold.example/v1",
      apiKey: "cold-secret",
      defaultModel: "gpt-cold",
      models: {
        "gpt-cold": {
          name: "gpt-cold"
        },
        "gpt-cold-mini": {
          name: "gpt-cold-mini"
        }
      }
    },
    "moonshotai-cn": {
      name: "Kimi",
      baseURL: "https://api.moonshot.cn/v1",
      apiKey: "kimi-secret",
      defaultModel: "kimi-k2",
      models: {
        "kimi-k2": {
          name: "kimi-k2"
        }
      }
    }
  },
  active: {
    codex: {
      provider: "hot",
      model: "gpt-hot"
    },
    opencode: {
      provider: "cold",
      model: "gpt-cold"
    }
  }
};

describe("renderers", () => {
  it("writes codex provider without api key plaintext", async () => {
    const paths = await tempPaths();
    await fs.mkdir(path.dirname(paths.codexConfig), { recursive: true });
    await fs.writeFile(paths.codexConfig, `approval_policy = "never"\n`);

    await switchCodex(paths, config);

    const raw = await fs.readFile(paths.codexConfig, "utf8");
    const parsed = parseToml(raw) as any;
    expect(parsed.approval_policy).toBe("never");
    expect(parsed.model_provider).toBe("hot");
    expect(parsed.model).toBe("gpt-hot");
    expect(parsed.model_providers.hot.env_key).toBe("MSW_CODEX_API_KEY");
    expect(raw).not.toContain("hot-secret");
  });

  it("syncs all opencode providers without api key plaintext", async () => {
    const paths = await tempPaths();
    await fs.mkdir(path.dirname(paths.opencodeConfig), { recursive: true });
    await fs.writeFile(
      paths.opencodeConfig,
      JSON.stringify({
        instructions: ["README.md"],
        provider: {
          external: {
            options: {
              apiKey: "external"
            }
          }
        }
      })
    );

    await syncOpenCode(paths, config);

    const raw = await fs.readFile(paths.opencodeConfig, "utf8");
    const parsed = parseJson(raw) as any;
    expect(Object.keys(parsed.provider).sort()).toEqual(["cold", "external", "hot", "moonshotai-cn"]);
    expect(parsed.provider.external.options.apiKey).toBe("external");
    expect(parsed.provider.hot.options.apiKey).toBe("{env:MSW_OPENCODE_HOT_API_KEY}");
    expect(parsed.provider.cold.models["gpt-cold"].name).toBe("gpt-cold");
    expect(raw).not.toContain("hot-secret");
    expect(raw).not.toContain("cold-secret");
  });

  it("syncs kimi as an openai-compatible provider", async () => {
    const paths = await tempPaths();
    await fs.mkdir(path.dirname(paths.opencodeConfig), { recursive: true });
    await fs.writeFile(paths.opencodeConfig, JSON.stringify({ provider: {} }));

    await syncOpenCode(paths, config);

    const raw = await fs.readFile(paths.opencodeConfig, "utf8");
    const parsed = parseJson(raw) as any;
    expect(parsed.provider["moonshotai-cn"].options.apiKey).toBe("{env:MSW_OPENCODE_MOONSHOTAI_CN_API_KEY}");
    expect(parsed.provider["moonshotai-cn"].npm).toBe("@ai-sdk/openai-compatible");
    expect(parsed.provider["moonshotai-cn"].options.baseURL).toBe("https://api.moonshot.cn/v1");
    expect(raw).not.toContain("kimi-secret");
  });

  it("switches opencode active model separately from sync", async () => {
    const paths = await tempPaths();
    await fs.mkdir(path.dirname(paths.opencodeConfig), { recursive: true });
    await fs.writeFile(
      paths.opencodeConfig,
      JSON.stringify({
        provider: {
          cold: {
            options: {}
          }
        }
      })
    );

    await switchOpenCode(paths, config);

    const parsed = parseJson(await fs.readFile(paths.opencodeConfig, "utf8")) as any;
    expect(parsed.model).toBe("cold/gpt-cold");
  });
});
