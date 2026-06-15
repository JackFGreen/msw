import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse } from "comment-json";
import { describe, expect, it } from "vitest";
import { createPaths } from "../src/paths.js";
import { switchClaude } from "../src/renderers/claude.js";

describe("claude renderer", () => {
  it("removes managed anthropic settings so shell env is used", async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "msw-claude-"));
    const paths = createPaths(home);
    await fs.mkdir(path.dirname(paths.claudeSettings), { recursive: true });
    await fs.writeFile(
      paths.claudeSettings,
      JSON.stringify({
        env: {
          FOO: "bar",
          ANTHROPIC_BASE_URL: "https://stale.example/anthropic",
          ANTHROPIC_AUTH_TOKEN: "stale-token",
          ANTHROPIC_MODEL: "stale-model",
          ANTHROPIC_DEFAULT_SONNET_MODEL: "stale-sonnet",
          ANTHROPIC_DEFAULT_OPUS_MODEL: "stale-opus",
          ANTHROPIC_DEFAULT_HAIKU_MODEL: "stale-haiku",
        },
      })
    );

    await switchClaude(paths);

    const settings = parse(await fs.readFile(paths.claudeSettings, "utf8")) as unknown as {
      env: Record<string, string | undefined>;
    };
    expect(settings.env.FOO).toBe("bar");
    expect(settings.env.ANTHROPIC_BASE_URL).toBeUndefined();
    expect(settings.env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect(settings.env.ANTHROPIC_MODEL).toBeUndefined();
    expect(settings.env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBeUndefined();
    expect(settings.env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBeUndefined();
    expect(settings.env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBeUndefined();
  });
});
