#!/usr/bin/env node

/**
 * GLM Coding Plan status bar for Claude Code CLI.
 * Caches API results for 3 minutes.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CACHE_TTL_MS = 3 * 60 * 1000;

function simpleHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

const cacheKey = JSON.stringify([process.env.ANTHROPIC_BASE_URL || '', process.env.ANTHROPIC_AUTH_TOKEN || '']);
const CACHE_FILE = path.join(os.tmpdir(), 'glm-status-cache-' + simpleHash(cacheKey) + '.json');

// ── ANSI ──────────────────────────────────────────────
const C = {
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m',
  cyan: '\x1b[36m', dim: '\x1b[2m', bold: '\x1b[1m', reset: '\x1b[0m',
  bg(r, g, b) { return `\x1b[48;2;${r};${g};${b}m`; },
  fg(r, g, b) { return `\x1b[38;2;${r};${g};${b}m`; },
};
const pctColor = (p) => (p >= 90 ? C.red : p >= 70 ? C.yellow : C.green);

function pad(n) { return String(n).padStart(2, '0'); }

function readStatusLineInput() {
  if (process.stdin.isTTY) return null;
  try {
    const raw = fs.readFileSync(0, 'utf8').trim();
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ── Cache ─────────────────────────────────────────────
function readCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch {}
  return null;
}

function writeCache(entry) {
  const tmp = CACHE_FILE + '.' + process.pid + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(entry));
    fs.renameSync(tmp, CACHE_FILE);
  } catch {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

// ── API ───────────────────────────────────────────────
function fetchJSON(apiPath) {
  const base = process.env.ANTHROPIC_BASE_URL || '';
  const token = process.env.ANTHROPIC_AUTH_TOKEN || '';
  if (!base || !token) return Promise.resolve(null);

  let parsed;
  let url;
  try {
    parsed = new URL(base);
    url = new URL(apiPath, base);
  } catch {
    return Promise.resolve(null);
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return Promise.resolve(null);
  }

  const isHttps = parsed.protocol === 'https:';
  const httpModule = isHttps ? https : http;
  const defaultPort = isHttps ? 443 : 80;

  return new Promise((resolve) => {
    const req = httpModule.request({
      hostname: url.hostname, port: url.port || defaultPort,
      path: url.pathname + url.search, method: 'GET',
      headers: { Authorization: token, 'Accept-Language': 'en-US,en' },
    }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(5000, () => { req.destroy(); resolve(null); });
    req.end();
  });
}

async function fetchAll() {
  const now = new Date();
  const sd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const ed = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), 59);
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const qp = `?startTime=${encodeURIComponent(fmt(sd))}&endTime=${encodeURIComponent(fmt(ed))}`;

  const fetchedAt = Date.now();
  const [quotaRes, modelRes] = await Promise.all([
    fetchJSON('/api/monitor/usage/quota/limit'),
    fetchJSON('/api/monitor/usage/model-usage' + qp),
  ]);

  return {
    fetchedAt,
    quota: quotaRes?.data || null,
    model: modelRes?.data || null,
  };
}

// ── Formatters ────────────────────────────────────────
function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function fmtDate(d) {
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function bar(pct, w = 10) {
  const f = Math.min(w, Math.round((pct / 100) * w));
  return '\u2588'.repeat(f) + '\u2591'.repeat(w - f);
}

function fmtResetTime(ms, skipDateIfToday) {
  if (!ms) return '';
  const d = new Date(ms);
  const now = new Date();
  if (skipDateIfToday && isSameDay(d, now)) {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  if (d.getFullYear() === now.getFullYear()) {
    return fmtDate(d);
  }
  return `${d.getFullYear()}-${fmtDate(d)}`;
}

function fmtBar(label, limit) {
  const p = Math.round(limit.percentage || 0);
  return `${label} ${pctColor(p)}${bar(p)} ${p}%${C.reset}`;
}

function fmtReset(limit, skipDateIfToday) {
  const rt = fmtResetTime(limit.nextResetTime, skipDateIfToday);
  return `${C.dim}[reset ${rt}]${C.reset}`;
}

function toNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function fmtContextLimit(size) {
  if (size >= 1000 && size % 1000 === 0) {
    return `${size / 1000}k`;
  }
  return size.toLocaleString();
}

function getContextUsage(status) {
  const contextWindow = status && status.context_window;
  const size = toNumber(contextWindow && contextWindow.context_window_size);
  if (!size) return { text: 'ctx: --' };

  // Compute exact token count from current_usage if it's a real object with numeric fields
  const rawUsage = contextWindow && contextWindow.current_usage;
  const usage = rawUsage && typeof rawUsage === 'object' ? rawUsage : null;
  let usedFromUsage = null;
  if (usage) {
    const hasSplit = 'cache_creation_input_tokens' in usage || 'cache_read_input_tokens' in usage;
    const inputTokens = toNumber(usage.input_tokens);
    const cacheTokens = hasSplit
      ? toNumber(usage.cache_creation_input_tokens) + toNumber(usage.cache_read_input_tokens)
      : toNumber(usage.cached_input_tokens);
    if (inputTokens > 0 || cacheTokens > 0) {
      usedFromUsage = inputTokens + cacheTokens;
    }
  }

  // used_percentage is the authoritative cumulative percentage for the bar
  const hasExplicitPct = contextWindow && typeof contextWindow.used_percentage === 'number';
  const usedPercentage = hasExplicitPct ? contextWindow.used_percentage : -1;
  const percent = usedPercentage >= 0 ? clampPercent(usedPercentage)
    : usedFromUsage !== null ? clampPercent((usedFromUsage / size) * 100)
    : -1;
  if (percent < 0) return { text: `ctx ${pctColor(0)}${bar(0)} 0%${C.reset}${C.dim} = ${C.reset}0/${fmtContextLimit(size)}` };

  // Only show exact numerator when backed by real token counts
  if (usedFromUsage !== null) {
    return {
      text: `ctx ${pctColor(percent)}${bar(percent)} ${percent}%${C.reset}${C.dim} = ${C.reset}${usedFromUsage.toLocaleString()}/${fmtContextLimit(size)}`,
    };
  }
  return {
    text: `ctx ${pctColor(percent)}${bar(percent)} ${percent}%${C.reset}`,
  };
}

// ── Render ────────────────────────────────────────────
function render(entry) {
  const { fetchedAt, quota, model, contextUsage } = entry;
  const todayTokens = model && model.totalUsage
    ? (model.totalUsage.totalTokensUsage || 0).toLocaleString() : null;

  const sep = ` ${C.dim}｜${C.reset} `;
  const lines = [];

  // Line 1: GLM PRO [fetched 14:30] or fallback
  if (quota) {
    const level = (quota.level || 'pro').toUpperCase();
    lines.push(`${C.bg(88, 166, 255)}${C.fg(0, 0, 0)}${C.bold} GLM ${level} ${C.reset} ${C.dim}[fetched ${fmtResetTime(fetchedAt, true)}]${C.reset}`);
  } else {
    lines.push(`${C.dim}GLM: quota unavailable${C.reset}`);
  }

  // Line 2: ctx (local data, always renders)
  lines.push((contextUsage && contextUsage.text) || `${C.dim}ctx: --${C.reset}`);

  // Line 3: 5h  ░░░░░░░░░░ 1% [reset 07:14] ｜ Tokens today: 71,397,677
  if (quota) {
    const limits = quota.limits || [];
    const tokensLimit = limits.find(function (l) { return l.type === 'TOKENS_LIMIT'; });
    const timeLimit = limits.find(function (l) { return l.type === 'TIME_LIMIT'; });

    if (tokensLimit) {
      const tBar = fmtBar('5h ', tokensLimit);
      const tReset = fmtReset(tokensLimit, true);
      if (todayTokens) {
        lines.push(`${tBar} ${tReset}${sep}Tokens today: ${C.cyan}${todayTokens}${C.reset}`);
      } else {
        lines.push(`${tBar} ${tReset}`);
      }
    } else if (todayTokens) {
      lines.push(`Tokens today: ${C.cyan}${todayTokens}${C.reset}`);
    }

    // Line 4: MCP ░░░░░░░░░░ 4% = (search33+web7+zread0)/1000 [reset 04-30 23:54]
    if (timeLimit) {
      const mcBar = fmtBar('MCP', timeLimit);
      const mcReset = fmtReset(timeLimit);
      if (timeLimit.usageDetails && timeLimit.usageDetails.length) {
        const labels = { 'search-prime': 'search', 'web-reader': 'web', 'zread': 'zread' };
        const details = timeLimit.usageDetails
          .map(function (d) { return `${labels[d.modelCode] || d.modelCode}${C.cyan}${d.usage}${C.reset}`; })
          .join(`${C.dim}+${C.reset}`);
        lines.push(`${mcBar} ${C.dim}=${C.reset} ${C.dim}(${C.reset}${details}${C.dim})/${timeLimit.usage || 0}${C.reset} ${mcReset}`);
      } else {
        lines.push(`${mcBar} ${mcReset}`);
      }
    }
  } else if (todayTokens) {
    lines.push(`Tokens today: ${C.cyan}${todayTokens}${C.reset}`);
  }

  process.stdout.write(lines.join('\n'));
}

// ── Main ──────────────────────────────────────────────
async function main() {
  const status = readStatusLineInput();
  const contextUsage = getContextUsage(status);
  const cached = readCache();
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    render({ ...cached, contextUsage });
    return;
  }

  const data = await fetchAll();

  if (data.quota && data.model) {
    const entry = { ts: Date.now(), fetchedAt: data.fetchedAt, quota: data.quota, model: data.model };
    writeCache(entry);
    render({ ...entry, contextUsage });
    return;
  }

  if (cached && cached.quota) {
    render({ ...cached, contextUsage });
    return;
  }

  if (data.quota) {
    render({ fetchedAt: data.fetchedAt, quota: data.quota, model: data.model, contextUsage });
    return;
  }

  render({ fetchedAt: null, quota: null, model: data.model || null, contextUsage });
}

main();
