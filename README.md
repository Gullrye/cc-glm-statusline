# GLM Coding Plan Status Bar for Claude Code CLI

[English](#english) | [中文](#中文)

---

<a id="中文"></a>

## 中文

在 Claude Code CLI 状态栏中显示 GLM Coding Plan 的完整用量信息。

### 效果预览

```
 GLM PRO ｜ fetchedAt: 2min ago
 5h  usage ░░░░░░░░░░ 1% | Tokens used today: 71,397,677 ｜ reset: 07:14
 MCP calls ░░░░░░░░░░ 4% | (search 33 + web 7 + zread 0)/1000 ｜ reset: 04-30 23:54
```

### 布局说明

**第一行 — 套餐 + 刷新时间**

| 区域 | 内容 |
|------|------|
| **GLM PRO** | 蓝色徽章，标识套餐等级（PRO/LITE） |
| **fetchedAt: 2min ago** | 数据刷新时间 |

**第二行 — Token 额度 + 今日用量**

| 区域 | 内容 |
|------|------|
| **5h  usage ░░░░░░ 1%** | 5 小时 Token 用量进度条 + 百分比 |
| **Tokens used today: 71,397,677** | 今日 Token 消耗总量 |
| **reset: 07:14** | 5h 额度重置时间 |

**第三行 — MCP 额度 + 明细**

| 区域 | 内容 |
|------|------|
| **MCP calls ░░░░ 4%** | 月度 MCP 调用次数进度条 + 百分比 |
| **(search 33 + web 7 + zread 0)/1000** | MCP 调用次数明细/月度总量 |
| **reset: 04-30 23:54** | MCP 月度额度重置时间 |

进度条颜色：绿色 (<70%) → 黄色 (70-90%) → 红色 (>90%)

### 数据来源

并行调用 GLM 平台 3 个 API（使用 `ANTHROPIC_AUTH_TOKEN` 和 `ANTHROPIC_BASE_URL` 环境变量）：

| API | 路径 | 提供数据 |
|-----|------|----------|
| Quota Limit | `/api/monitor/usage/quota/limit` | 套餐等级、5h Token 配额、MCP 月度调用配额、重置时间、MCP 明细 |
| Model Usage | `/api/monitor/usage/model-usage` | 今日模型调用次数、Token 消耗量 |
| Tool Usage | `/api/monitor/usage/tool-usage` | 今日 MCP 工具调用次数 |

### 安装

1. 将 `glm-statusline.js` 复制到 `~/.claude/hooks/` 目录：

```bash
cp glm-statusline.js ~/.claude/hooks/glm-statusline.js
```

2. 在 `~/.claude/settings.json` 中配置 statusLine：

```json
{
  "statusLine": {
    "type": "command",
    "command": "node $HOME/.claude/hooks/glm-statusline.js"
  }
}
```

3. 确保环境变量已配置（GLM Coding Plan 用户通常已配置）：

```bash
export ANTHROPIC_AUTH_TOKEN="your-token"
export ANTHROPIC_BASE_URL="https://open.bigmodel.cn/api/anthropic"
```

4. 重启 Claude Code 会话生效。

### 技术细节

- **缓存**: API 结果缓存 3 分钟到系统临时目录，避免频繁请求
- **超时**: 单次 API 请求超时 5 秒
- **并行请求**: 3 个 API 并行调用，减少延迟
- **降级处理**: API 不可用时显示 `GLM: quota unavailable`
- **无额外依赖**: 仅使用 Node.js 内置模块（https, fs, os, path）

### 自定义

脚本开头的常量可以调整：

```javascript
const CACHE_TTL_MS = 3 * 60 * 1000;  // 缓存时间（毫秒）
```

---

<a id="english"></a>

## English

Display complete GLM Coding Plan usage info in the Claude Code CLI status bar.

### Preview

```
 GLM PRO ｜ fetchedAt: 2min ago
 5h  usage ░░░░░░░░░░ 1% | Tokens used today: 71,397,677 ｜ reset: 07:14
 MCP calls ░░░░░░░░░░ 4% | (search 33 + web 7 + zread 0)/1000 ｜ reset: 04-30 23:54
```

### Layout

**Line 1 — Plan level + refresh time**

| Section | Description |
|---------|-------------|
| **GLM PRO** | Blue badge showing plan level (PRO/LITE) |
| **fetchedAt: 2min ago** | Data refresh time |

**Line 2 — Token quota + today's usage**

| Section | Description |
|---------|-------------|
| **5h  usage ░░░░░░ 1%** | 5-hour Token usage progress bar + percentage |
| **Tokens used today: 71,397,677** | Total tokens consumed today |
| **reset: 07:14** | 5h quota reset time |

**Line 3 — MCP quota + breakdown**

| Section | Description |
|---------|-------------|
| **MCP calls ░░░░ 4%** | Monthly MCP calls progress bar + percentage |
| **(search 33 + web 7 + zread 0)/1000** | MCP call breakdown / monthly limit |
| **reset: 04-30 23:54** | MCP monthly quota reset time |

Progress bar colors: green (<70%) → yellow (70-90%) → red (>90%)

### Data Sources

Three GLM platform APIs are called in parallel (using `ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_BASE_URL` env vars):

| API | Endpoint | Data |
|-----|----------|------|
| Quota Limit | `/api/monitor/usage/quota/limit` | Plan level, 5h Token quota, monthly MCP call quota, reset times, MCP breakdown |
| Model Usage | `/api/monitor/usage/model-usage` | Today's model calls, Token consumption |
| Tool Usage | `/api/monitor/usage/tool-usage` | Today's MCP tool call counts |

### Installation

1. Copy `glm-statusline.js` to `~/.claude/hooks/`:

```bash
cp glm-statusline.js ~/.claude/hooks/glm-statusline.js
```

2. Configure statusLine in `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node $HOME/.claude/hooks/glm-statusline.js"
  }
}
```

3. Ensure environment variables are set (GLM Coding Plan users should already have these):

```bash
export ANTHROPIC_AUTH_TOKEN="your-token"
export ANTHROPIC_BASE_URL="https://open.bigmodel.cn/api/anthropic"
```

4. Restart Claude Code session to take effect.

### Technical Details

- **Cache**: API results cached for 3 minutes in system temp directory
- **Timeout**: 5 seconds per API request
- **Parallel requests**: All 3 APIs called in parallel to reduce latency
- **Fallback**: Shows `GLM: quota unavailable` when API is unreachable
- **Zero dependencies**: Uses only Node.js built-in modules (https, fs, os, path)

### Customization

Adjust the constant at the top of the script:

```javascript
const CACHE_TTL_MS = 3 * 60 * 1000;  // Cache duration (milliseconds)
```
