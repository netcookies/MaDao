#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';

const DEFAULT_BASE_URL = 'https://madao-stats.nznd.org';
const DEV_VARS_PATH = '.dev.vars';
const COMMANDS = new Set(['health', 'refresh', 'summary', 'realtime']);

function printHelp() {
  process.stdout.write([
    'Usage:',
    '  node scripts/ops.mjs <health|refresh|summary|realtime> [options]',
    '',
    'Options:',
    '  --base-url <url>       Worker base URL, defaults to https://madao-stats.nznd.org',
    '  --lookback <hours>     Summary lookback hours, defaults to 24',
    '  --provider <value>     Realtime provider filter',
    '  --service <value>      Realtime service filter',
    '  --country <value>      Realtime country filter',
    '  --operator <value>     Realtime operator filter',
    '  --raw                  Print raw response body',
    '',
    'Token lookup for refresh/realtime:',
    '  STATS_WORKER_API_TOKEN -> API_TOKEN -> .dev.vars API_TOKEN',
    '',
  ].join('\n'));
}

function parseArgs(argv) {
  const args = {
    command: '',
    baseUrl: DEFAULT_BASE_URL,
    lookback: '24',
    provider: '',
    service: '',
    country: '',
    operator: '',
    raw: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!args.command && !token.startsWith('--')) {
      args.command = token;
    } else if (token === '--base-url') {
      args.baseUrl = argv[index + 1] ?? '';
      index += 1;
    } else if (token === '--lookback') {
      args.lookback = argv[index + 1] ?? '';
      index += 1;
    } else if (token === '--provider') {
      args.provider = argv[index + 1] ?? '';
      index += 1;
    } else if (token === '--service') {
      args.service = argv[index + 1] ?? '';
      index += 1;
    } else if (token === '--country') {
      args.country = argv[index + 1] ?? '';
      index += 1;
    } else if (token === '--operator') {
      args.operator = argv[index + 1] ?? '';
      index += 1;
    } else if (token === '--raw') {
      args.raw = true;
    } else if (token === '--help' || token === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (!COMMANDS.has(args.command)) {
    throw new Error('Missing or invalid command. Use --help for usage.');
  }
  if (!args.baseUrl.trim()) {
    throw new Error('--base-url cannot be empty.');
  }
  if (!Number.isFinite(Number(args.lookback)) || Number(args.lookback) <= 0) {
    throw new Error('--lookback must be a positive number.');
  }

  return args;
}

function normalizeBaseUrl(value) {
  return value.trim().replace(/\/+$/, '');
}

function readDevVarsToken() {
  if (!existsSync(DEV_VARS_PATH)) return '';
  const content = readFileSync(DEV_VARS_PATH, 'utf8');
  const line = content
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith('API_TOKEN='));
  if (!line) return '';
  const rawValue = line.slice(line.indexOf('=') + 1).trim();
  return rawValue.replace(/^(['"])(.*)\1$/, '$2');
}

function readToken() {
  return (
    process.env.STATS_WORKER_API_TOKEN?.trim()
    || process.env.API_TOKEN?.trim()
    || readDevVarsToken().trim()
  );
}

function requireToken() {
  const token = readToken();
  if (!token) {
    throw new Error('Missing API token. Set STATS_WORKER_API_TOKEN, API_TOKEN, or .dev.vars API_TOKEN.');
  }
  return token;
}

function appendOptionalParam(params, key, value) {
  const trimmed = value.trim();
  if (trimmed) params.set(key, trimmed);
}

function buildRequest(args) {
  const baseUrl = normalizeBaseUrl(args.baseUrl);
  if (args.command === 'health') {
    return {
      url: `${baseUrl}/health`,
      options: { method: 'GET' },
    };
  }
  if (args.command === 'refresh') {
    return {
      url: `${baseUrl}/v1/admin/dashboard/refresh`,
      options: {
        method: 'POST',
        headers: { authorization: `Bearer ${requireToken()}` },
      },
    };
  }

  const path = args.command === 'realtime' ? '/v1/admin/summary' : '/v1/summary';
  const url = new URL(`${baseUrl}${path}`);
  url.searchParams.set('lookback_hours', String(Number(args.lookback)));
  if (args.command === 'realtime') {
    appendOptionalParam(url.searchParams, 'provider', args.provider);
    appendOptionalParam(url.searchParams, 'service', args.service);
    appendOptionalParam(url.searchParams, 'country', args.country);
    appendOptionalParam(url.searchParams, 'operator', args.operator);
  }

  return {
    url: url.toString(),
    options: {
      method: 'GET',
      headers: args.command === 'realtime'
        ? { authorization: `Bearer ${requireToken()}` }
        : {},
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const request = buildRequest(args);
  const response = await fetch(request.url, request.options);
  const body = await response.text();
  if (!response.ok) {
    process.stderr.write(`Request failed: ${response.status} ${response.statusText}\n`);
    process.stderr.write(`${body}\n`);
    process.exit(1);
  }

  if (args.raw) {
    process.stdout.write(`${body}\n`);
    return;
  }

  try {
    process.stdout.write(`${JSON.stringify(JSON.parse(body), null, 2)}\n`);
  } catch {
    process.stdout.write(`${body}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  if (error instanceof Error && error.cause) {
    process.stderr.write(`${error.cause instanceof Error ? error.cause.message : String(error.cause)}\n`);
  }
  process.exit(1);
});
