import { mkdir, rm, readdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

export const ROOT_DIR = process.cwd();
export const SCREENSHOT_DIR = path.join(ROOT_DIR, 'designs', 'screenshots');
export const PEN_EXPORT_DIR = path.join(SCREENSHOT_DIR, '.pen-export-1x');
export const ACTUAL_DIR = path.join(ROOT_DIR, '.artifacts', 'ui-screenshot', 'actual');
export const DIFF_DIR = path.join(ROOT_DIR, '.artifacts', 'ui-screenshot', 'diff');
export const TMP_DIR = path.join(ROOT_DIR, '.artifacts', 'ui-screenshot', 'tmp');
export const TARGETS = {
  Overview: { kind: 'page', baseline: 'MaDao_macOS_Overview.png', nodeId: 'xAOQW' },
  Providers: { kind: 'page', baseline: 'MaDao_macOS_Providers.png', nodeId: '56BG9' },
  ProviderWorkspace_Config: { kind: 'page', baseline: 'MaDao_macOS_ProviderWorkspace_Config.png', nodeId: 'N6Lgb' },
  ProviderWorkspace_Store: { kind: 'page', baseline: 'MaDao_macOS_ProviderWorkspace_Store.png', nodeId: 'xpxuM' },
  ProviderWorkspace_Wallet: { kind: 'page', baseline: 'MaDao_macOS_ProviderWorkspace_Wallet.png', nodeId: 'I9nOw' },
  Routing: { kind: 'page', baseline: 'MaDao_macOS_Routing.png', nodeId: 'routing-local' },
  Messages: { kind: 'page', baseline: 'MaDao_macOS_Messages.png', nodeId: 'cDuYZ' },
  Settings: { kind: 'page', baseline: 'MaDao_macOS_Settings.png', nodeId: '7PXST' },
  Logs: { kind: 'page', baseline: 'MaDao_macOS_Logs.png', nodeId: 'M2MDQ' },
  Notifications: { kind: 'component', baseline: 'MaDao_macOS_Notifications.png', nodeId: 'v71IQ' },
  NewActivation: { kind: 'component', baseline: 'MaDao_macOS_NewActivation.png', nodeId: 'UE0DB' },
};

export function parseArgs(argv) {
  const args = {
    target: null,
    all: false,
    failOnDiff: false,
    updateBaselines: false,
    port: 4173,
    lang: 'en',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--target') {
      args.target = argv[index + 1] ?? null;
      index += 1;
    } else if (token === '--all') {
      args.all = true;
    } else if (token === '--fail-on-diff') {
      args.failOnDiff = true;
    } else if (token === '--update-baselines') {
      args.updateBaselines = true;
    } else if (token === '--port') {
      args.port = Number(argv[index + 1] ?? '4173');
      index += 1;
    } else if (token === '--lang') {
      args.lang = argv[index + 1] ?? 'en';
      index += 1;
    }
  }

  return args;
}

export function resolveTargets(args) {
  if (args.all) {
    return Object.keys(TARGETS);
  }

  if (args.target && TARGETS[args.target]) {
    return [args.target];
  }

  throw new Error('Missing valid --target <Target> or --all');
}

export async function ensureDirs() {
  await mkdir(ACTUAL_DIR, { recursive: true });
  await mkdir(DIFF_DIR, { recursive: true });
  await mkdir(TMP_DIR, { recursive: true });
}

export async function cleanDir(dir) {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
}

export function baselinePath(target) {
  return path.join(SCREENSHOT_DIR, TARGETS[target].baseline);
}

export function actualPath(target) {
  return path.join(ACTUAL_DIR, `${target}.png`);
}

export function diffPath(target) {
  return path.join(DIFF_DIR, `${target}.png`);
}

export function exportedPath(target) {
  const spec = TARGETS[target];
  return path.join(PEN_EXPORT_DIR, `${spec.nodeId}.png`);
}

export function hasExportedBaseline(target) {
  return existsSync(exportedPath(target));
}

export async function copyExportedBaselines(targets) {
  for (const target of targets) {
    await copyFile(exportedPath(target), baselinePath(target));
  }
}

export async function listAvailableExports() {
  try {
    return await readdir(PEN_EXPORT_DIR);
  } catch {
    return [];
  }
}
