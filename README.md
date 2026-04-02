# GLM Coding Plan Status Bar for Claude Code CLI

[English](#english) | [中文](#中文)

---

<a id="中文"></a>

## 中文

在 Claude Code CLI 状态栏中显示 GLM Coding Plan 的完整用量信息。

### 效果预览

```
 GLM PRO [fetched 14:30]
 ctx ███░░░░░░░ 34% = 68,421/200k
 5h  ░░░░░░░░░░ 1% [reset 07:14] ｜ Tokens today: 71,397,677
 MCP ░░░░░░░░░░ 4% = (search33+web7+zread0)/1000 [reset 04-30 23:54]
```

### 布局说明

**第一行 — 套餐 + 刷新时间**

| 区域 | 内容 |
|------|------|
| **GLM PRO** | 蓝色徽章，标识套餐等级（MAX/PRO/LITE） |
| **[fetched 14:30]** | 数据获取时间（同天显示 HH:MM，跨天显示 MM-DD HH:MM，跨年显示 YYYY-MM-DD HH:MM） |

**第二行 — 上下文窗口用量**

| 区域 | 内容 |
|------|------|
| **ctx ███░░░░░░░ 34%** | 当前上下文窗口用量进度条 + 百分比 |
| **= 68,421/200k** | 已用/总量 |

**第三行 — 5h Token 额度 + 今日用量**

| 区域 | 内容 |
|------|------|
| **5h  ░░░░░░ 1%** | 5 小时 Token 用量进度条 + 百分比 |
| **[reset 07:14]** | 5h 额度重置时间 |
| **Tokens today: 71,397,677** | 今日 Token 消耗总量 |

**第四行 — MCP 额度 + 明细**

| 区域 | 内容 |
|------|------|
| **MCP ░░░░ 4%** | 月度 MCP 调用次数进度条 + 百分比 |
| **(search33+web7+zread0)/1000** | MCP 调用次数明细/月度总量 |
| **[reset 04-30 23:54]** | MCP 月度额度重置时间 |

进度条颜色：绿色 (<70%) → 黄色 (70-90%) → 红色 (>90%)

### 数据来源

并行调用 GLM 平台 2 个 API（使用 `ANTHROPIC_AUTH_TOKEN` 和 `ANTHROPIC_BASE_URL` 环境变量）：

| API | 路径 | 提供数据 |
|-----|------|----------|
| Quota Limit | `/api/monitor/usage/quota/limit` | 套餐等级、5h Token 配额、MCP 月度调用配额、重置时间、MCP 明细 |
| Model Usage | `/api/monitor/usage/model-usage` | 今日模型调用次数、Token 消耗量 |

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

### 刷新机制

脚本为**单次执行**，不包含定时器或自动刷新逻辑。Claude Code CLI 会周期性重新执行 statusLine 命令，每次执行时：

1. 检查本地缓存（系统临时目录），如果缓存未过期（3 分钟内），直接使用缓存数据渲染
2. 如果缓存已过期，并行调用 API 获取最新数据，写入缓存后渲染
3. 如果 API 请求失败，使用过期缓存作为降级输出，避免状态栏变为空白
4. `fetchedAt` 显示的是数据实际从 API 获取的时间（非当前时间），可通过该时间判断数据新鲜度

### 技术细节

- **缓存**: API 结果缓存 3 分钟到系统临时目录，避免频繁请求
- **超时**: 单次 API 请求超时 5 秒
- **并行请求**: 2 个 API 并行调用，减少延迟
- **降级处理**: API 不可用时使用过期缓存降级，仅在无任何缓存时显示 `GLM: quota unavailable`
- **无额外依赖**: 仅使用 Node.js 内置模块（http, https, fs, os, path）

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
 GLM PRO [fetched 14:30]
 ctx ███░░░░░░░ 34% = 68,421/200k
 5h  ░░░░░░░░░░ 1% [reset 07:14] ｜ Tokens today: 71,397,677
 MCP ░░░░░░░░░░ 4% = (search33+web7+zread0)/1000 [reset 04-30 23:54]
```

### Layout

**Line 1 — Plan level + refresh time**

| Section | Description |
|---------|-------------|
| **GLM PRO** | Blue badge showing plan level (MAX/PRO/LITE) |
| **[fetched 14:30]** | Data fetch time (same day: HH:MM, different day: MM-DD HH:MM, different year: YYYY-MM-DD HH:MM) |

**Line 2 — Context window usage**

| Section | Description |
|---------|-------------|
| **ctx ███░░░░░░░ 34%** | Current context window usage progress bar + percentage |
| **= 68,421/200k** | Used / total |

**Line 3 — 5h Token quota + today's usage**

| Section | Description |
|---------|-------------|
| **5h  ░░░░░░ 1%** | 5-hour Token usage progress bar + percentage |
| **[reset 07:14]** | 5h quota reset time |
| **Tokens today: 71,397,677** | Total tokens consumed today |

**Line 4 — MCP quota + breakdown**

| Section | Description |
|---------|-------------|
| **MCP ░░░░ 4%** | Monthly MCP calls progress bar + percentage |
| **(search33+web7+zread0)/1000** | MCP call breakdown / monthly limit |
| **[reset 04-30 23:54]** | MCP monthly quota reset time |

Progress bar colors: green (<70%) → yellow (70-90%) → red (>90%)

### Data Sources

Two GLM platform APIs are called in parallel (using `ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_BASE_URL` env vars):

| API | Endpoint | Data |
|-----|----------|------|
| Quota Limit | `/api/monitor/usage/quota/limit` | Plan level, 5h Token quota, monthly MCP call quota, reset times, MCP breakdown |
| Model Usage | `/api/monitor/usage/model-usage` | Today's model calls, Token consumption |

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

### Refresh Mechanism

The script is **one-shot execution** — it does not include a timer or auto-refresh. Claude Code CLI periodically re-executes the statusLine command. On each execution:

1. Check local cache (system temp directory). If cache is valid (within 3 minutes), render using cached data
2. If cache is expired, fetch latest data from APIs in parallel, write to cache, then render
3. If API requests fail, use expired cache as fallback to avoid a blank status bar
4. `fetchedAt` shows the actual time data was fetched from the API (not current time), indicating data freshness

### Technical Details

- **Cache**: API results cached for 3 minutes in system temp directory
- **Timeout**: 5 seconds per API request
- **Parallel requests**: 2 APIs called in parallel to reduce latency
- **Fallback**: Uses expired cache when API is unreachable; only shows `GLM: quota unavailable` when no cache exists
- **Zero dependencies**: Uses only Node.js built-in modules (http, https, fs, os, path)

### Customization

Adjust the constant at the top of the script:

```javascript
const CACHE_TTL_MS = 3 * 60 * 1000;  // Cache duration (milliseconds)
```
