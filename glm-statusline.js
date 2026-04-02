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

const cacheKey = [process.env.ANTHROPIC_BASE_URL || '', process.env.ANTHROPIC_AUTH_TOKEN || ''].join('');
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

// ── Cache ─────────────────────────────────────────────
function readCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch {}
  return null;
}

function writeCache(entry) {
  try { fs.writeFileSync(CACHE_FILE, JSON.stringify(entry)); } catch {}
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

function fmtFetchTime(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const now = new Date();
  if (isSameDay(d, now)) {
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
  return `${C.dim}reset: ${rt}${C.reset}`;
}

function joinLine(segments, pipe, sep) {
  if (segments.length <= 1) return segments.join('');
  const last = segments.pop();
  return segments.join(pipe) + sep + last;
}

// ── Render ────────────────────────────────────────────
function render(entry) {
  const { fetchedAt, quota, model } = entry;
  if (!quota) { process.stdout.write('GLM: quota unavailable'); return; }

  const sep = ` ${C.dim}｜${C.reset} `;
  const pipe = ` ${C.dim}|${C.reset} `;
  const level = (quota.level || 'pro').toUpperCase();
  const limits = quota.limits || [];
  const tokensLimit = limits.find(function (l) { return l.type === 'TOKENS_LIMIT'; });
  const timeLimit = limits.find(function (l) { return l.type === 'TIME_LIMIT'; });

  const lines = [];

  // Line 1: GLM PRO ｜ fetchedAt: 14:30
  lines.push([
    `${C.bg(88, 166, 255)}${C.fg(0, 0, 0)}${C.bold} GLM ${level} ${C.reset}`,
    `${C.dim}fetchedAt: ${fmtFetchTime(fetchedAt)}${C.reset}`,
  ].join(sep));

  // Line 2: 5h  usage ░░░ 1% | Tokens used today: 71,397,677 ｜ reset: 07:14
  const l2 = [];
  if (tokensLimit) l2.push(fmtBar('5h  usage', tokensLimit));
  if (model && model.totalUsage) {
    const tokens = (model.totalUsage.totalTokensUsage || 0).toLocaleString();
    l2.push(`Tokens used today: ${C.cyan}${tokens}${C.reset}`);
  }
  if (tokensLimit) l2.push(fmtReset(tokensLimit, true));
  lines.push(joinLine(l2, pipe, sep));

  // Line 3: MCP calls ░░░░ 4% | (search 33 + web 7 + zread 0)/1000 | reset: 04-30 23:54
  const l3 = [];
  if (timeLimit) l3.push(fmtBar('MCP calls', timeLimit));
  if (timeLimit && timeLimit.usageDetails && timeLimit.usageDetails.length) {
    const labels = { 'search-prime': 'search', 'web-reader': 'web', 'zread': 'zread' };
    const details = timeLimit.usageDetails
      .map(function (d) { return `${labels[d.modelCode] || d.modelCode} ${C.cyan}${d.usage}${C.reset}`; })
      .join(` ${C.dim}+${C.reset} `);
    l3.push(`${C.dim}(${C.reset}${details}${C.dim})/${timeLimit.usage || 0}${C.reset}`);
  }
  if (timeLimit) l3.push(fmtReset(timeLimit));
  lines.push(joinLine(l3, pipe, sep));

  process.stdout.write(lines.join('\n'));
}

// ── Main ──────────────────────────────────────────────
async function main() {
  const cached = readCache();
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    render(cached);
    return;
  }

  const data = await fetchAll();

  if (data.quota && data.model) {
    const entry = { ts: Date.now(), fetchedAt: data.fetchedAt, quota: data.quota, model: data.model };
    writeCache(entry);
    render(entry);
    return;
  }

  if (cached && cached.quota) {
    render(cached);
    return;
  }

  if (data.quota) {
    render({ fetchedAt: data.fetchedAt, quota: data.quota, model: data.model });
    return;
  }

  render({ fetchedAt: null, quota: null, model: null });
}

main();
