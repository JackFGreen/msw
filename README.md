# msw

`msw` 用来统一管理 Claude Code、Codex、OpenCode 的 provider 配置。

Provider 保存在 `~/.msw/config.jsonc`。API key 只保存在这个文件里；写入各 agent 配置时只写环境变量引用。

## 安装

开发使用：

```sh
pnpm install
pnpm dev -- --help
```

本机全局使用：

```sh
pnpm install
pnpm build
pnpm link --global
```

确认命令可用：

```sh
msw --help
```

## 第一步：添加 Provider

示例添加 OpenRouter：

```sh
msw add openrouter \
  --base-url https://openrouter.ai/api/v1 \
  --api-key sk-... \
  --model openai/gpt-4o \
  --name OpenRouter
```

配置会写入：

```text
~/.msw/config.jsonc
```

该文件支持注释，也会保存明文 API key。

配置结构示例：

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
  "active": {},
}
```

查看 provider：

```sh
msw list
```

## 第二步：让 Shell 加载 API Key

`msw switch` 只切换 agent 配置，不会把 API key 明文写进 agent 配置。agent 真正运行时，需要 shell 里有对应 `MSW_*` 环境变量。

推荐把需要的 env 写入 `~/.zshrc`：

```sh
eval "$(msw env claude)"
eval "$(msw env codex)"
eval "$(msw env opencode)"
```

修改后打开新 shell，或在当前 shell 执行：

```sh
source ~/.zshrc
```

检查某个 agent 会导出什么：

```sh
msw env opencode
```

## 第三步：切换 Agent

切换 Codex：

```sh
msw switch codex openrouter
```

这会更新：

```text
~/.msw/config.jsonc
~/.codex/config.toml
```

切换 Claude Code：

```sh
msw switch claude openrouter
```

Claude Code 的 `settings.json.env` 不支持展开 `$VAR`。因此 Claude 不在 settings 中引用 `MSW_*`，而是由 `msw env claude` 直接导出：

```text
ANTHROPIC_BASE_URL
ANTHROPIC_AUTH_TOKEN
ANTHROPIC_MODEL
ANTHROPIC_DEFAULT_SONNET_MODEL
ANTHROPIC_DEFAULT_OPUS_MODEL
ANTHROPIC_DEFAULT_HAIKU_MODEL
```

切换 OpenCode 前，先同步 provider 列表：

```sh
msw sync opencode
msw switch opencode openrouter
```

`sync opencode` 会把 `~/.msw/config.jsonc` 里的所有 provider 同步到：

```text
~/.config/opencode/opencode.json
```

`switch opencode` 只更新 OpenCode 当前 active model，例如：

```json
"model": "openrouter/openai/gpt-4o"
```

## 常用命令

```sh
msw list
msw status
msw delete openrouter
msw delete openrouter --force
```

临时指定模型：

```sh
msw switch codex openrouter --model openai/gpt-4o
```

## 恢复 Agent 原始配置

恢复某个 agent 到第一次被 `msw` 修改前的配置：

```sh
msw switch codex origin
msw switch claude origin
msw switch opencode origin
```

恢复后，`msw` 会清理 `~/.msw/config.jsonc` 中对应的 `active.<agent>`。

第一次修改某个 agent 配置前，`msw` 会把原始配置保存两份：

```text
~/.codex/config.msw-bak.toml
~/.msw/backups/codex/config.msw-bak.toml
```

Claude 和 OpenCode 对应为：

```text
~/.claude/settings.msw-bak.json
~/.msw/backups/claude/settings.msw-bak.json
~/.config/opencode/opencode.msw-bak.json
~/.msw/backups/opencode/opencode.msw-bak.json
```

如果你想完全禁用 shell 中的 `msw env`，需要删除或注释 `~/.zshrc` 中的 msw env 段：

```sh
# --- msw runtime env ---
if command -v msw >/dev/null 2>&1; then
  eval "$(msw env opencode)"
  eval "$(msw env claude)"
  eval "$(msw env codex)"
fi
# --- msw runtime env ---
```

然后重启当前 shell：

```sh
exec zsh
```

## 直接启动 Agent

只要 shell 已经加载过 `msw env`，就直接运行 agent：

```sh
codex
claude
opencode
```
