#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const DEV_VARS_PATH = 'cloudflare/stats-worker/.dev.vars';

function commandName(name) {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

function loadStatsSyncToken(env) {
  if (env.STATS_SYNC_API_TOKEN) return;
  if (!existsSync(DEV_VARS_PATH)) return;

  const content = readFileSync(DEV_VARS_PATH, 'utf8');
  const line = content
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith('API_TOKEN='));
  if (!line) return;

  const rawValue = line.slice(line.indexOf('=') + 1).trim();
  const token = rawValue.replace(/^(['"])(.*)\1$/, '$2');
  if (token) {
    env.STATS_SYNC_API_TOKEN = token;
  }
}

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(commandName(command), args, {
      stdio: 'inherit',
      env,
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      const suffix = signal ? `signal ${signal}` : `exit code ${code}`;
      reject(new Error(`${command} ${args.join(' ')} failed with ${suffix}`));
    });
  });
}

const env = { ...process.env };
loadStatsSyncToken(env);

try {
  await run('npm', ['run', 'build'], env);
  await run('cargo', ['run', '-p', 'madao-tauri'], env);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
