import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { TARGETS, BASELINE_DIR, OUTPUT_DIR, DIFF_DIR } from './fixtures.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const appWindowTitle = 'MaDao SMS Platform';
const swiftWindowQuery = `
import Foundation
import CoreGraphics

let title = CommandLine.arguments[1]
let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]] ?? []
for item in list {
  let owner = item[kCGWindowOwnerName as String] as? String ?? ""
  let name = item[kCGWindowName as String] as? String ?? ""
  if owner == "madao-tauri" || name == title {
    let id = item[kCGWindowNumber as String] as? Int ?? 0
    let bounds = item[kCGWindowBounds as String] as? [String: Any] ?? [:]
    let x = Int((bounds["X"] as? Double) ?? (bounds["X"] as? Int).map(Double.init) ?? 0)
    let y = Int((bounds["Y"] as? Double) ?? (bounds["Y"] as? Int).map(Double.init) ?? 0)
    let width = Int((bounds["Width"] as? Double) ?? (bounds["Width"] as? Int).map(Double.init) ?? 0)
    let height = Int((bounds["Height"] as? Double) ?? (bounds["Height"] as? Int).map(Double.init) ?? 0)
    print("\\(id)|\\(x)|\\(y)|\\(width)|\\(height)")
    exit(0)
  }
}
exit(1)
`;

export function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

export function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    if (key === 'all' || key === 'fail-on-diff') {
      parsed[key] = true;
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      parsed[key] = next;
      i += 1;
    } else {
      parsed[key] = true;
    }
  }
  return parsed;
}

export function resolveTargets(args) {
  if (args.all) return Object.keys(TARGETS);
  if (args.target) {
    if (!TARGETS[args.target]) {
      throw new Error(`未知 target：${args.target}。可选值：${Object.keys(TARGETS).join(', ')}`);
    }
    return [args.target];
  }
  throw new Error('必须提供 --target <Name> 或 --all');
}

export function resolveBaselinePath(target, overridePath) {
  return overridePath
    ? path.resolve(repoRoot, overridePath)
    : path.resolve(repoRoot, BASELINE_DIR, TARGETS[target]);
}

export function resolveOutputPath(target, outputDir = OUTPUT_DIR) {
  return path.resolve(repoRoot, outputDir, TARGETS[target]);
}

function spawnCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr || stdout || `${command} exited with code ${code}`));
      }
    });
  });
}

export async function readPngSize(filePath) {
  const { stdout } = await spawnCommand('/usr/bin/sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', filePath], { cwd: repoRoot });
  const width = Number(stdout.match(/pixelWidth:\s+(\d+)/)?.[1]);
  const height = Number(stdout.match(/pixelHeight:\s+(\d+)/)?.[1]);
  if (!width || !height) throw new Error(`无法读取 PNG 尺寸：${filePath}`);
  return { width, height };
}

export async function launchApp(target) {
  await killExistingApp();
  const child = spawn('/opt/homebrew/bin/cargo', ['run', '-p', 'madao-tauri'], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      TAURI_DEV_WATCHER: 'false',
      MA_DAO_SCREENSHOT_TARGET: target,
    },
  });

  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  await waitForWindow(appWindowTitle);
  return { child, stderrRef: () => stderr };
}

export async function stopApp(child) {
  if (!child || child.killed) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    child.once('close', () => resolve());
    setTimeout(() => resolve(), 3000);
  });
}

async function killExistingApp() {
  try {
    await spawnCommand('/usr/bin/pkill', ['-f', 'target/debug/madao-tauri'], { cwd: repoRoot });
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 600));
}

export async function waitForWindow(title) {
  const started = Date.now();
  while (Date.now() - started < 30000) {
    try {
      const { stdout } = await spawnCommand('/usr/bin/swift', ['-e', swiftWindowQuery, title], { cwd: repoRoot });
      if (stdout.trim()) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`等待窗口超时：${title}`);
}

export async function waitForScreenshotReady() {
  const started = Date.now();
  while (Date.now() - started < 30000) {
    try {
      const { stdout } = await spawnCommand('/usr/bin/swift', ['-e', swiftWindowQuery, appWindowTitle], { cwd: repoRoot });
      if (stdout.trim()) return stdout.trim();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error('等待截图窗口稳定超时');
}

function parseWindowBounds(text) {
  const [_windowId, xText, yText, widthText, heightText] = text.split('|');
  const x = Number(xText);
  const y = Number(yText);
  const width = Number(widthText);
  const height = Number(heightText);
  if ([x, y, width, height].some((value) => Number.isNaN(value) || value <= 0)) {
    throw new Error(`无法解析窗口 bounds：${text}`);
  }
  return { x, y, width, height };
}

export async function captureTarget(target, outputPath) {
  ensureDir(path.dirname(outputPath));
  const app = await launchApp(target);
  const tempPath = path.resolve(repoRoot, '.artifacts', 'ui-screenshots', 'tmp', `${target}.png`);
  ensureDir(path.dirname(tempPath));

  try {
    const boundsText = await waitForScreenshotReady();
    const bounds = parseWindowBounds(boundsText);
    await spawnCommand('/usr/sbin/screencapture', ['-x', '-R', `${bounds.x},${bounds.y},${bounds.width},${bounds.height}`, tempPath], { cwd: repoRoot });
    await fs.promises.copyFile(tempPath, outputPath);
  } finally {
    await stopApp(app.child);
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
}

export { TARGETS, OUTPUT_DIR, DIFF_DIR };
