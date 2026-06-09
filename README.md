# msw

`msw` 用来统一管理 Claude Code、Codex、OpenCode 的 provider 配置。

Provider 保存在 `~/.msw/config.jsonc`。API key 只保存在这个文件里；写入各 agent 配置时只写环境变量名或引用，不写明文 key。

## 安装

开发运行：

```sh
pnpm install
pnpm dev -- --help
```

本机全局使用：

```sh
pnpm install
pnpm build
pnpm link --global
msw --help
```

## 快速开始

添加 OpenRouter：

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

让当前 shell 加载运行时变量：

```sh
eval "$(msw env codex)"
eval "$(msw env claude)"
eval "$(msw env opencode)"
```

之后直接启动 agent：

```sh
codex
claude
opencode
```

## Shell 自动加载

如果希望新 shell 自动可用，把下面内容加入 `~/.zshrc`：

```sh
# --- msw runtime env ---
if command -v msw >/dev/null 2>&1; then
  eval "$(msw env opencode)"
  eval "$(msw env claude)"
  eval "$(msw env codex)"
fi
# --- msw runtime env ---
```

修改后重启当前 shell：

```sh
exec zsh
```

说明：

- `msw env claude` 导出 `ANTHROPIC_*`。
- `msw env codex` 导出 `MSW_CODEX_API_KEY` 和 `CODEX_MODEL`。
- `msw env opencode` 导出 `MSW_OPENCODE_<PROVIDER_ID>_API_KEY`。
- `switch` 到新 provider 后，当前 shell 需要重新加载对应 agent 的 env，最轻量方式是 `eval "$(msw env <agent>)"`。
- 如果 `.zshrc` 中已经配置了上面的自动加载，也可以 `source ~/.zshrc` 重新执行全部 `msw env`。
- `exec zsh` 主要用于修改了 `.zshrc` 文件本身，或恢复 origin 后想重启 shell 状态。

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
          "name": "openai/gpt-4o"
        }
      }
    }
  },
  "active": {
    "codex": {
      "provider": "openrouter",
      "model": "openai/gpt-4o"
    }
  }
}
```

Provider 可为不同 agent 设置不同 baseURL，例如 Claude 使用 Anthropic-compatible 端点，Codex/OpenCode 使用 OpenAI-compatible 端点：

```jsonc
{
  "baseURL": "https://token-plan-sgp.xiaomimimo.com/v1",
  "baseURLs": {
    "claude": "https://token-plan-sgp.xiaomimimo.com/anthropic"
  }
}
```

## 命令

查看状态：

```sh
msw list
msw status
```

删除 provider：

```sh
msw delete openrouter
msw delete openrouter --force
```

临时指定模型：

```sh
msw switch codex openrouter --model openai/gpt-4o
```

切换后刷新当前 shell：

```sh
msw switch claude openrouter
eval "$(msw env claude)"
```

如果 `.zshrc` 中已经配置了自动加载，也可以重新 source：

```sh
msw switch claude openrouter
source ~/.zshrc
```

OpenCode 的 provider 列表同步和 active 切换是两个动作：

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

恢复 origin 后，当前 shell 中旧的环境变量不会自动消失。`source ~/.zshrc` 只会重新执行配置，不会 unset 已存在的变量。

如果要完全禁用 shell 中的 `msw env`，删除或注释 `~/.zshrc` 中的 msw env 段，然后执行：

```sh
exec zsh
```

也可以只手动 unset 对应 agent 的变量。例如 Claude：

```sh
unset ANTHROPIC_BASE_URL
unset ANTHROPIC_AUTH_TOKEN
unset ANTHROPIC_MODEL
unset ANTHROPIC_DEFAULT_SONNET_MODEL
unset ANTHROPIC_DEFAULT_OPUS_MODEL
unset ANTHROPIC_DEFAULT_HAIKU_MODEL
```

## 开发检查

```sh
pnpm check
pnpm test
pnpm build
```
