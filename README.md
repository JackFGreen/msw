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
```

## Shell 配置

推荐在 `~/.zshrc` 中添加以下内容，新 shell 自动加载环境变量，且 `msw switch` 后无需执行 eval 环境变量：

```sh
# --- msw runtime env ---
msw() {
  command msw "$@"
  local ret=$?
  if [[ $ret -eq 0 && "$1" == "switch" ]]; then
    eval "$(command msw env "$2")"
  fi
  return $ret
}
# --- msw runtime env ---
```

修改后重启 shell：

```sh
exec zsh
```

## 环境变量

| 环境变量                              | agent    |
| ------------------------------------- | -------- |
| `ANTHROPIC_BASE_URL`                  | claude   |
| `ANTHROPIC_AUTH_TOKEN`                | claude   |
| `ANTHROPIC_MODEL`                     | claude   |
| `ANTHROPIC_DEFAULT_SONNET_MODEL`      | claude   |
| `ANTHROPIC_DEFAULT_OPUS_MODEL`        | claude   |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL`       | claude   |
| `MSW_CODEX_API_KEY`                   | codex    |
| `MSW_OPENCODE_<PROVIDER_ID>_API_KEY`  | opencode |

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

## 命令

```sh
msw list                         # 查看 providers 和 active 状态
msw status                       # 查看配置文件路径和 active 状态
msw add <id> --base-url ... --api-key ... --model ...  # 添加 provider
msw delete <id> [--force]        # 删除 provider
msw switch <agent> <provider>    # 切换 agent 的 provider
msw switch <agent> <provider> --model <model>  # 临时指定模型
msw sync opencode                # 同步所有 provider 到 OpenCode
msw env <agent>                  # 打印 shell exports（无 active provider 时静默退出）
```

OpenCode 需要先 sync 再 switch：

```sh
msw sync opencode
msw switch opencode openrouter
```

## Agent 行为

Claude Code：

- `msw switch claude <provider>` 更新 `~/.msw/config.jsonc` 的 `active.claude`。
- 同时清理 `~/.claude/settings.json.env` 中的 `ANTHROPIC_*` 字段，避免 settings 覆盖 shell env。
- Claude Code 不支持在 `settings.json.env` 中展开 `$VAR`，所以运行时变量由 `msw env claude` 直接导出。

Codex：

- `msw switch codex <provider>` 更新 `~/.codex/config.toml`。
- 写入 `model_provider`、`model` 和 `[model_providers.<id>]`。
- 写入 `env_key = "MSW_CODEX_API_KEY"`，不写 API key 明文。

OpenCode：

- `msw sync opencode` 把 `~/.msw/config.jsonc` 中所有 provider 同步到 `~/.config/opencode/opencode.json`。
- `msw switch opencode <provider>` 只更新 OpenCode 当前 active model，例如 `"model": "openrouter/openai/gpt-4o"`。
- provider key 使用 `{env:MSW_OPENCODE_<PROVIDER_ID>_API_KEY}`。

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
