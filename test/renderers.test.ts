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
          name: "gpt-hot",
        },
      },
    },
    cold: {
      name: "Cold",
      baseURL: "https://cold.example/v1",
      apiKey: "cold-secret",
      defaultModel: "gpt-cold",
      models: {
        "gpt-cold": {
          name: "gpt-cold",
        },
        "gpt-cold-mini": {
          name: "gpt-cold-mini",
        },
      },
    },
    "moonshotai-cn": {
      name: "Kimi",
      baseURL: "https://api.moonshot.cn/v1",
      apiKey: "kimi-secret",
      defaultModel: "kimi-k2",
      models: {
        "kimi-k2": {
          name: "kimi-k2",
        },
      },
    },
  },
  active: {
    codex: {
      provider: "hot",
      model: "gpt-hot",
    },
    opencode: {
      provider: "cold",
      model: "gpt-cold",
    },
  },
};

describe("renderers", () => {
  it("writes codex provider without api key plaintext", async () => {
    const paths = await tempPaths();
    await fs.mkdir(path.dirname(paths.codexConfig), { recursive: true });
    await fs.writeFile(paths.codexConfig, `approval_policy = "never"\n`);

    await switchCodex(paths, config);

    const raw = await fs.readFile(paths.codexConfig, "utf8");
    const parsed = parseToml(raw) as {
      approval_policy: string;
      model_provider: string;
      model: string;
      model_providers: Record<string, { env_key: string }>;
    };
    expect(parsed.approval_policy).toBe("never");
    expect(parsed.model_provider).toBe("hot");
    expect(parsed.model).toBe("gpt-hot");
    expect(parsed.model_providers.hot.env_key).toBe("MSW_CODEX_API_KEY");
    expect(raw).not.toContain("hot-secret");
  });

  it("writes and clears codex reasoning effort", async () => {
    const paths = await tempPaths();
    await fs.mkdir(path.dirname(paths.codexConfig), { recursive: true });
    await fs.writeFile(paths.codexConfig, `model_reasoning_effort = "low"\n`);
    const configWithEffort: MswConfig = {
      ...config,
      active: {
        ...config.active,
        codex: { provider: "hot", model: "gpt-hot", effort: "high" },
      },
    };

    await switchCodex(paths, configWithEffort);
    expect(
      (
        parseToml(await fs.readFile(paths.codexConfig, "utf8")) as {
          model_reasoning_effort?: string;
        }
      ).model_reasoning_effort
    ).toBe("high");

    await switchCodex(paths, config);
    expect(
      (
        parseToml(await fs.readFile(paths.codexConfig, "utf8")) as {
          model_reasoning_effort?: string;
        }
      ).model_reasoning_effort
    ).toBeUndefined();
  });

  it("syncs all opencode providers without api key plaintext", async () => {
    const paths = await tempPaths();
    await fs.mkdir(path.dirname(paths.opencodeConfig), { recursive: true });
    await fs.writeFile(
      paths.opencodeConfig,
      JSON.stringify({
        instructions: ["README.md"],
        providers: {
          external: {
            settings: {
              apiKey: "external",
            },
          },
        },
        provider: {
          legacy: {
            models: {
              stale: { name: "stale" },
            },
          },
        },
      })
    );

    await syncOpenCode(paths, config);

    const raw = await fs.readFile(paths.opencodeConfig, "utf8");
    const parsed = parseJson(raw) as unknown as {
      provider?: unknown;
      providers: Record<
        string,
        { settings: { apiKey: string }; models: Record<string, { name: string }> }
      >;
    };
    expect(parsed.provider).toBeUndefined();
    expect(Object.keys(parsed.providers).sort()).toEqual([
      "cold",
      "external",
      "hot",
      "moonshotai-cn",
    ]);
    expect(parsed.providers.external.settings.apiKey).toBe("external");
    expect(parsed.providers.hot.settings.apiKey).toBe("{env:MSW_OPENCODE_HOT_API_KEY}");
    expect(parsed.providers.cold.models["gpt-cold"].name).toBe("gpt-cold");
    expect(raw).not.toContain("hot-secret");
    expect(raw).not.toContain("cold-secret");
  });

  it("syncs kimi as an openai-compatible provider", async () => {
    const paths = await tempPaths();
    await fs.mkdir(path.dirname(paths.opencodeConfig), { recursive: true });
    await fs.writeFile(paths.opencodeConfig, JSON.stringify({ providers: {} }));

    await syncOpenCode(paths, config);

    const raw = await fs.readFile(paths.opencodeConfig, "utf8");
    const parsed = parseJson(raw) as unknown as {
      providers: Record<string, { package: string; settings: { apiKey: string; baseURL: string } }>;
    };
    expect(parsed.providers["moonshotai-cn"].settings.apiKey).toBe(
      "{env:MSW_OPENCODE_MOONSHOTAI_CN_API_KEY}"
    );
    expect(parsed.providers["moonshotai-cn"].package).toBe(
      "@opencode/ai/providers/openai-compatible"
    );
    expect(parsed.providers["moonshotai-cn"].settings.baseURL).toBe("https://api.moonshot.cn/v1");
    expect(raw).not.toContain("kimi-secret");
  });

  it("renders opencode v2 model capabilities and variants", async () => {
    const paths = await tempPaths();
    await fs.mkdir(path.dirname(paths.opencodeConfig), { recursive: true });
    await fs.writeFile(paths.opencodeConfig, JSON.stringify({ providers: {} }));

    await syncOpenCode(paths, {
      version: 1,
      providers: {
        hot: {
          name: "Hot",
          baseURL: "https://hot.example/v1",
          apiKey: "hot-secret",
          defaultModel: "gpt-hot",
          models: {
            "gpt-hot": {
              name: "gpt-hot",
              limit: { context: 1048576, output: 131072 },
              modalities: { input: ["text"], output: ["text"] },
              variants: {
                low: { options: { reasoningEffort: "low" } },
                high: { options: { reasoningEffort: "high" } },
              },
            },
          },
        },
      },
      active: {},
    });

    const parsed = parseJson(await fs.readFile(paths.opencodeConfig, "utf8")) as unknown as {
      providers: Record<
        string,
        {
          models: Record<
            string,
            {
              limit: { context: number; output: number };
              capabilities: { input: string[]; output: string[] };
              variants: Array<{ id: string; settings: Record<string, unknown> }>;
              modalities?: unknown;
            }
          >;
        }
      >;
    };
    const model = parsed.providers.hot.models["gpt-hot"];
    expect(model.limit).toEqual({ context: 1048576, output: 131072 });
    expect(model.capabilities).toEqual({ input: ["text"], output: ["text"] });
    expect(model.variants).toEqual([
      { id: "low", settings: { reasoningEffort: "low" } },
      { id: "high", settings: { reasoningEffort: "high" } },
    ]);
    expect(model.modalities).toBeUndefined();
  });

  it("switches opencode active model separately from sync", async () => {
    const paths = await tempPaths();
    await fs.mkdir(path.dirname(paths.opencodeConfig), { recursive: true });
    await fs.writeFile(
      paths.opencodeConfig,
      JSON.stringify({
        providers: {
          cold: {
            settings: {},
          },
        },
      })
    );

    await switchOpenCode(paths, config);

    const parsed = parseJson(await fs.readFile(paths.opencodeConfig, "utf8")) as unknown as {
      model: string;
    };
    expect(parsed.model).toBe("cold/gpt-cold");
  });

  it("adds opencode effort variant to the active model", async () => {
    const paths = await tempPaths();
    await fs.mkdir(path.dirname(paths.opencodeConfig), { recursive: true });
    await fs.writeFile(
      paths.opencodeConfig,
      JSON.stringify({ providers: { cold: { settings: {} } } })
    );
    const configWithEffort: MswConfig = {
      ...config,
      active: {
        ...config.active,
        opencode: { provider: "cold", model: "gpt-cold", effort: "high" },
      },
    };

    await switchOpenCode(paths, configWithEffort);

    const parsed = parseJson(await fs.readFile(paths.opencodeConfig, "utf8")) as unknown as {
      model: string;
    };
    expect(parsed.model).toBe("cold/gpt-cold#high");
  });

  it("writes opencode effort directly without resolving variants", async () => {
    const paths = await tempPaths();
    await fs.mkdir(path.dirname(paths.opencodeConfig), { recursive: true });
    await fs.writeFile(
      paths.opencodeConfig,
      JSON.stringify({ providers: { cold: { settings: {} } } })
    );
    const configWithVariants: MswConfig = {
      ...config,
      providers: {
        ...config.providers,
        cold: {
          ...config.providers.cold,
          models: {
            ...config.providers.cold.models,
            "gpt-cold": {
              name: "gpt-cold",
              variants: {
                deep: { options: { reasoningEffort: "high" } },
              },
            },
          },
        },
      },
      active: {
        ...config.active,
        opencode: { provider: "cold", model: "gpt-cold", effort: "high" },
      },
    };

    await switchOpenCode(paths, configWithVariants);
    const parsed = parseJson(await fs.readFile(paths.opencodeConfig, "utf8")) as unknown as {
      model: string;
    };
    expect(parsed.model).toBe("cold/gpt-cold#high");
  });
});
