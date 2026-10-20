# msw

[npm](https://www.npmjs.com/package/@jackgreen/msw) | [GitHub](https://github.com/JackFGreen/msw)

`msw` 用来统一管理 Claude Code、Codex、OpenCode 的 provider 配置。

Provider 保存在 `~/.msw/config.jsonc`。API key 只保存在这个文件里；写入各 agent 配置时只写环境变量名或引用，不写明文 key。

## 快速开始

安装：

```sh
pnpm install -g @jackgreen/msw
```

添加 provider：

```sh
msw add openrouter \
  --base-url https://openrouter.ai/api/v1 \
  --api-key sk-... \
  --model openai/gpt-4o \
  --name OpenRouter
```

切换 agent：

```sh
msw switch codex openrouter
msw switch claude openrouter

msw sync opencode
msw switch opencode openrouter
```

注入环境变量到当前 shell：

```sh
eval "$(msw env claude)"
eval "$(msw env codex)"

# 或一次性注入所有 active agent 的环境变量
eval "$(msw env --all)"
```

## Shell 配置

推荐在 `~/.zshrc` 中添加以下内容，新 shell 自动加载环境变量，且 `msw switch` 后无需执行 eval 环境变量：

```sh
# --- msw runtime env ---
msw() {
  command msw "$@"
  local ret=$?
  if [[ $ret -eq 0 && "$1" == "switch" ]]; then
    eval "$(command msw env --all)"
  fi
  return $ret
}
eval "$(command msw env --all)"
# --- msw runtime env ---
```

修改后重启 shell：

```sh
exec zsh
```

## 环境变量

| 环境变量                             | agent    |
| ------------------------------------ | -------- |
| `ANTHROPIC_BASE_URL`                 | claude   |
| `ANTHROPIC_AUTH_TOKEN`               | claude   |
| `ANTHROPIC_MODEL`                    | claude   |
| `ANTHROPIC_DEFAULT_SONNET_MODEL`     | claude   |
| `ANTHROPIC_DEFAULT_OPUS_MODEL`       | claude   |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL`      | claude   |
| `CLAUDE_CODE_EFFORT_LEVEL`           | claude   |
| `MSW_CODEX_API_KEY`                  | codex    |
| `MSW_OPENCODE_<PROVIDER_ID>_API_KEY` | opencode |

## 配置文件

主配置文件：

```text
~/.msw/config.jsonc
```

示例：

```jsonc
{
  "version": 1,
  "providers": {
    "openrouter": {
      "name": "OpenRouter",
      "baseURL": "https://openrouter.ai/api/v1",
      "apiKey": "sk-...",
      "defaultModel": "openai/gpt-4o",
      "models": {
        "openai/gpt-4o": {
          "name": "openai/gpt-4o",
        },
      },
    },
  },
  "active": {
    "codex": {
      "provider": "openrouter",
      "model": "openai/gpt-4o",
    },
  },
}
```

Provider 可为不同 agent 设置不同 baseURL，例如 Claude 使用 Anthropic-compatible 端点，Codex/OpenCode 使用 OpenAI-compatible 端点：

```jsonc
{
  "baseURL": "https://openrouter.ai/api/v1",
  "baseURLs": {
    "claude": "https://openrouter.ai/api/anthropic",
  },
}
```

Model 可配置 `limit.context` 指定上下文窗口大小。`msw env claude` 会导出带有 `[1M]` 标记的 model，Claude Code 据此判断是否启用长上下文：

```jsonc
{
  "defaultModel": "mimo-v2.5-pro",
  "models": {
    "mimo-v2.5-pro": {
      "name": "mimo-v2.5-pro",
      "limit": {
        "context": 1048576,
      },
    },
  },
}
```

Claude 支持为 sonnet/opus/haiku 分别指定不同模型：

```sh
msw switch claude mimo-cn --haiku mimo-v2.5
```

配置文件中对应：

```jsonc
{
  "active": {
    "claude": {
      "provider": "mimo-cn",
      "model": "mimo-v2.5-pro",
      "modelOverrides": {
        "haiku": "mimo-v2.5",
      },
    },
  },
}
```

## 命令

```sh
msw list                         # 查看 providers 和 active 状态
msw status                       # 查看配置文件路径和 active 状态
msw add <id> --base-url ... [--claude] --api-key ... --model ... [--name ...]  # 添加 provider
msw edit <provider> [--name ...] [--api-key ...] [--base-url ... [--claude]] [--model ...] [--remove-model ...]  # 修改 provider
msw delete <id> [--force]        # 删除 provider
msw switch <agent> <provider>    # 切换 agent 的 provider
msw switch <agent> <provider> --model <model>  # 临时指定模型
msw switch <agent> <provider> --effort <effort>  # 设置推理强度
msw switch claude <provider> --model <model> --haiku   # 覆盖 haiku 槽位
msw switch claude <provider> --model <model> --sonnet  # 覆盖 sonnet 槽位
msw switch claude <provider> --model <model> --opus    # 覆盖 opus 槽位
msw sync opencode                # 同步所有 provider 到 OpenCode
msw env <agent> [provider] [--model <model>]  # 打印 shell exports（无 active provider 时静默退出）
msw env --all                                 # 打印所有 active agent 的 shell exports
```

`--effort` 会检查所选模型的 `variants`：如果模型配置了 `variants` 但不包含指定 effort，switch 会报错并列出可用 variants；未配置 `variants` 时直接透传。

修改已有 provider 时，至少传入一个字段，仅更新传入的字段：

```sh
msw edit openrouter --name=OpenRouter --api-key=sk-new-key
msw edit openrouter --base-url https://openrouter.ai/api/v1 --model openai/gpt-4o
```

`--name` 修改显示名，provider ID 保持不变。`--model` 修改默认模型；若模型尚未存在于 `models`，会自动添加，已有模型及其详细配置会保留。

`--remove-model` 从 `models` 中删除模型，可重复使用。不能直接删除当前默认模型，需同时通过 `--model` 指定新的默认模型；如果模型正被 active agent 或 `modelOverrides` 使用，命令会拒绝删除并提示先切换：

```sh
msw edit openrouter --remove-model openai/gpt-4o-mini
msw edit openrouter --model openai/gpt-4o --remove-model openai/gpt-4o-mini
msw edit openrouter --remove-model model-a --remove-model model-b
```

`add` 和 `edit` 支持通过 `--claude` 将 `--base-url` 指定为 Claude 专用地址：

```sh
msw add demo --claude --base-url=https://example.com/anthropic --api-key=sk-xxx --model=claude-model
msw edit demo --claude --base-url=https://new.example.com/anthropic
```

`add --claude` 将地址同时保存到 `baseURL` 和 `baseURLs.claude`，作为新 provider 的通用地址和 Claude 专用地址。`edit --claude` 仅修改 `baseURLs.claude`，保留通用地址和其他 agent 的地址。`--claude` 必须配合 `--base-url` 使用；不带 `--claude` 时沿用通用地址的行为。

`edit` 仅保存 msw 配置，保留当前 active 选择，不自动同步 agent 配置或刷新 shell 环境变量。按需重新执行 `eval "$(msw env --all)"`、`msw switch` 或 `msw sync opencode` 应用修改；切换时未指定 `--model` 则使用新的默认模型。

OpenCode 需要先 sync 再 switch：

```sh
msw sync opencode
msw switch opencode openrouter
```

## Agent 行为

Claude Code：

- `msw switch claude <provider>` 更新 `~/.msw/config.jsonc` 的 `active.claude`。
- 同时清理 `~/.claude/settings.json` 中 `env` 字段的 `ANTHROPIC_*`，避免 settings 覆盖 shell env。
- Claude Code 不支持在 `settings.json` 的 `env` 中展开 `$VAR`，所以运行时变量由 `msw env claude` 直接导出。
- effort 通过 `CLAUDE_CODE_EFFORT_LEVEL` 导出，可用值为 `low`、`medium`、`high`、`xhigh`、`max`、`auto`（具体取决于模型）。

#### Claude 模型覆盖

Claude Code 有三个内置模型槽位 — **haiku**、**sonnet**、**opus** — 分别对应 `ANTHROPIC_DEFAULT_*_MODEL` 环境变量。msw 支持单独覆盖每个槽位：

```sh
# haiku 请求使用 gpt-mini（后台任务、低成本调用）
msw switch claude openai --model gpt-4o --haiku

# 单独覆盖 sonnet 和 opus
msw switch claude deepseek --model deepseek-chat --sonnet
msw switch claude deepseek --model deepseek-reasoner --opus
```

`--haiku`、`--sonnet`、`--opus` 标志需要配合 `--model` 使用，指定的模型**仅**应用于对应槽位。基础模型（不带标志）用于 `ANTHROPIC_MODEL`。未设置的槽位回退到基础模型。

| 标志       | 设置的环境变量                   |
| ---------- | -------------------------------- |
| `--haiku`  | `ANTHROPIC_DEFAULT_HAIKU_MODEL`  |
| `--sonnet` | `ANTHROPIC_DEFAULT_SONNET_MODEL` |
| `--opus`   | `ANTHROPIC_DEFAULT_OPUS_MODEL`   |

模型覆盖会持久保存在 `~/.msw/config.jsonc` 的 `active.claude.modelOverrides` 中，切换到同一 provider 时保留。切换到不同 provider 会替换覆盖配置。

**上下文窗口标记：** 如果模型的 `context` 限制 ≥ 1M tokens，msw 会自动在模型名后追加 `[1m]`（如 `claude-haiku-3-5[1m]`），Claude Code 据此启用长上下文路径。

Codex：

- `msw switch codex <provider>` 更新 `~/.codex/config.toml`。
- 写入 `model_provider`、`model` 和 `[model_providers.<id>]`。
- 指定 `--effort` 时写入 `model_reasoning_effort`；未指定时移除该字段。
- 写入 `env_key = "MSW_CODEX_API_KEY"`，不写 API key 明文。

OpenCode（v2）：

- `msw sync opencode` 把 `~/.msw/config.jsonc` 中所有 provider 同步到 `~/.config/opencode/opencode.json` 的 `providers`。
- provider 使用 `package: "@opencode/ai/providers/openai-compatible"`，地址和 key 写入 `settings.baseURL` / `settings.apiKey`。
- `msw switch opencode <provider>` 只更新 OpenCode 当前 active model，例如 `"model": "openrouter/openai/gpt-4o"`；指定 `--effort` 时直接把 effort 作为 variant id 追加，例如 `"model": "openrouter/openai/gpt-4o#high"`。
- provider key 使用 `{env:MSW_OPENCODE_<PROVIDER_ID>_API_KEY}`。
- 模型配置会转换为 OpenCode v2 结构：`modalities` → `capabilities`，`variants` → `[{ id, settings }]`。
- 当前只适配 OpenCode v2；`msw sync opencode` 会删除 v1 残留的顶层 `provider` 配置。

## 恢复原始配置

恢复某个 agent 到第一次被 `msw` 修改前的配置：

```sh
msw switch codex origin
msw switch claude origin
msw switch opencode origin
```

恢复后，`msw` 会清理 `~/.msw/config.jsonc` 中对应的 `active.<agent>`。

恢复查找顺序：

1. 优先使用 agent 配置同目录下的固定 bak 文件。
2. 如果同目录 bak 不存在，再使用 `~/.msw/backups/<agent>/` 下的固定 bak 文件。

固定 bak 路径：

```text
~/.codex/config.msw-bak.toml
~/.msw/backups/codex/config.msw-bak.toml

~/.claude/settings.msw-bak.json
~/.msw/backups/claude/settings.msw-bak.json

~/.config/opencode/opencode.msw-bak.json
~/.msw/backups/opencode/opencode.msw-bak.json
```

第一次修改某个 agent 配置前，`msw` 会按上面的路径保存原始配置。后续普通备份仍会写入带时间戳的文件，但不会覆盖固定 bak。

恢复 origin 后，当前 shell 中旧的环境变量不会自动消失。使用了上面的 `msw` 函数包装，`switch` 到 origin 时会自动 unset。如需手动清理，`exec zsh` 即可。

## 开发

```sh
pnpm install
pnpm dev -- --help
```

本地全局使用：

```sh
pnpm install
pnpm build
pnpm link --global
msw --help
```

开发检查：

```sh
pnpm check
pnpm test
pnpm build
```
