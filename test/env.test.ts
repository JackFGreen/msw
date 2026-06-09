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
        claude: "https://example.com/anthropic"
      },
      apiKey: "secret'key",
      defaultModel: "claude-x",
      models: {
        "claude-x": {
          name: "claude-x"
        }
      }
    }
  },
  active: {
    claude: {
      provider: "hot",
      model: "claude-x"
    }
  }
};

describe("env", () => {
  it("exports claude auth and four model variables", () => {
    expect(buildEnv(config, "claude")).toEqual({
      ANTHROPIC_BASE_URL: "https://example.com/anthropic",
      ANTHROPIC_AUTH_TOKEN: "secret'key",
      ANTHROPIC_MODEL: "claude-x",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "claude-x",
      ANTHROPIC_DEFAULT_OPUS_MODEL: "claude-x",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "claude-x"
    });
  });

  it("shell-quotes secrets", () => {
    expect(shellExports({ ANTHROPIC_AUTH_TOKEN: "secret'key" })).toBe(
      "export ANTHROPIC_AUTH_TOKEN='secret'\\''key'"
    );
  });
});
