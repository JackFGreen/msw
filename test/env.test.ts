import { describe, expect, it } from "vitest";
import { buildEnv, shellExports } from "../src/env.js";
import type { MswConfig } from "../src/types.js";

const config: MswConfig = {
  version: 1,
  providers: {
    hot: {
      name: "Hot",
      baseURL: "https://example.com/v1",
      baseURLs: {
        claude: "https://example.com/anthropic",
      },
      apiKey: "secret'key",
      defaultModel: "claude-x",
      models: {
        "claude-x": {
          name: "claude-x",
        },
      },
    },
  },
  active: {
    claude: {
      provider: "hot",
      model: "claude-x",
    },
  },
};

describe("env", () => {
  it("exports claude auth and all model variables with same model by default", () => {
    expect(buildEnv(config, "claude")).toEqual({
      ANTHROPIC_BASE_URL: "https://example.com/anthropic",
      ANTHROPIC_AUTH_TOKEN: "secret'key",
      ANTHROPIC_MODEL: "claude-x",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "claude-x",
      ANTHROPIC_DEFAULT_OPUS_MODEL: "claude-x",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "claude-x",
    });
  });

  it("uses haiku override for ANTHROPIC_DEFAULT_HAIKU_MODEL", () => {
    const configWithOverride: MswConfig = {
      ...config,
      active: {
        claude: {
          provider: "hot",
          model: "claude-x",
          modelOverrides: {
            haiku: "claude-haiku",
          },
        },
      },
    };

    expect(buildEnv(configWithOverride, "claude")).toEqual({
      ANTHROPIC_BASE_URL: "https://example.com/anthropic",
      ANTHROPIC_AUTH_TOKEN: "secret'key",
      ANTHROPIC_MODEL: "claude-x",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "claude-x",
      ANTHROPIC_DEFAULT_OPUS_MODEL: "claude-x",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "claude-haiku",
    });
  });

  it("uses sonnet override for ANTHROPIC_DEFAULT_SONNET_MODEL", () => {
    const configWithOverride: MswConfig = {
      ...config,
      active: {
        claude: {
          provider: "hot",
          model: "claude-x",
          modelOverrides: {
            sonnet: "claude-sonnet",
          },
        },
      },
    };

    expect(buildEnv(configWithOverride, "claude")).toEqual({
      ANTHROPIC_BASE_URL: "https://example.com/anthropic",
      ANTHROPIC_AUTH_TOKEN: "secret'key",
      ANTHROPIC_MODEL: "claude-x",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "claude-sonnet",
      ANTHROPIC_DEFAULT_OPUS_MODEL: "claude-x",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "claude-x",
    });
  });

  it("uses opus override for ANTHROPIC_DEFAULT_OPUS_MODEL", () => {
    const configWithOverride: MswConfig = {
      ...config,
      active: {
        claude: {
          provider: "hot",
          model: "claude-x",
          modelOverrides: {
            opus: "claude-opus",
          },
        },
      },
    };

    expect(buildEnv(configWithOverride, "claude")).toEqual({
      ANTHROPIC_BASE_URL: "https://example.com/anthropic",
      ANTHROPIC_AUTH_TOKEN: "secret'key",
      ANTHROPIC_MODEL: "claude-x",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "claude-x",
      ANTHROPIC_DEFAULT_OPUS_MODEL: "claude-opus",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "claude-x",
    });
  });

  it("uses multiple overrides simultaneously", () => {
    const configWithOverrides: MswConfig = {
      ...config,
      active: {
        claude: {
          provider: "hot",
          model: "claude-x",
          modelOverrides: {
            haiku: "claude-haiku",
            sonnet: "claude-sonnet",
            opus: "claude-opus",
          },
        },
      },
    };

    expect(buildEnv(configWithOverrides, "claude")).toEqual({
      ANTHROPIC_BASE_URL: "https://example.com/anthropic",
      ANTHROPIC_AUTH_TOKEN: "secret'key",
      ANTHROPIC_MODEL: "claude-x",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "claude-sonnet",
      ANTHROPIC_DEFAULT_OPUS_MODEL: "claude-opus",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "claude-haiku",
    });
  });

  it("appends [1m] to claude model name when context >= 1M", () => {
    const config1m: MswConfig = {
      version: 1,
      providers: {
        mimo: {
          name: "MiMo",
          baseURL: "https://api.mimo.com/v1",
          baseURLs: {
            claude: "https://api.mimo.com/anthropic",
          },
          apiKey: "key",
          defaultModel: "mimo-v2.5-pro",
          models: {
            "mimo-v2.5-pro": {
              name: "mimo-v2.5-pro",
              limit: {
                context: 1048576,
                output: 131072,
              },
            },
            "mimo-v2.5-lite": {
              name: "mimo-v2.5-lite",
              limit: {
                context: 200000,
              },
            },
          },
        },
      },
      active: {
        claude: {
          provider: "mimo",
          model: "mimo-v2.5-pro",
          modelOverrides: {
            haiku: "mimo-v2.5-lite",
          },
        },
      },
    };

    const env = buildEnv(config1m, "claude");
    expect(env.ANTHROPIC_MODEL).toBe("mimo-v2.5-pro[1m]");
    expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe("mimo-v2.5-lite");
  });

  it("does not append [1m] when context < 1M", () => {
    const configSmall: MswConfig = {
      version: 1,
      providers: {
        small: {
          name: "Small",
          baseURL: "https://api.example.com/v1",
          apiKey: "key",
          defaultModel: "model-x",
          models: {
            "model-x": {
              name: "model-x",
              limit: {
                context: 200000,
              },
            },
          },
        },
      },
      active: {
        claude: {
          provider: "small",
          model: "model-x",
        },
      },
    };

    const env = buildEnv(configSmall, "claude");
    expect(env.ANTHROPIC_MODEL).toBe("model-x");
  });

  it("shell-quotes secrets", () => {
    expect(shellExports({ ANTHROPIC_AUTH_TOKEN: "secret'key" })).toBe(
      "export ANTHROPIC_AUTH_TOKEN='secret'\\''key'"
    );
  });
});
