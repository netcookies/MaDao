import { spawn } from 'node:child_process';
import process from 'node:process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  actualPath,
  ensureDirs,
  parseArgs,
  resolveTargets,
  TARGETS,
} from './core.mjs';

async function importPlaywright() {
  try {
    return await import('playwright');
  } catch {
    throw new Error('Missing dependency `playwright`. Run `npm install` first.');
  }
}

function startPreview(port) {
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const child = spawn(command, ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return child;
}

async function waitForPreview(port) {
  const startedAt = Date.now();
  const url = `http://127.0.0.1:${port}`;

  while (Date.now() - startedAt < 15000) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // ignore until server is ready
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Preview server did not start on ${url}`);
}

async function captureTarget(page, target, port, lang) {
  const spec = TARGETS[target];
  await page.goto(`http://127.0.0.1:${port}/?target=${encodeURIComponent(target)}&lang=${encodeURIComponent(lang)}`, {
    waitUntil: 'load',
  });

  await page.evaluate(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    const rootEl = document.getElementById('root');
    if (rootEl) {
      rootEl.style.background = 'transparent';
    }
  });

  const root = page.locator(`[data-screenshot-root="${target}"]`);
  await root.waitFor({ state: 'visible' });

  if (spec.kind === 'component') {
    const box = await root.boundingBox();
    if (!box) {
      throw new Error(`Unable to resolve screenshot bounds for ${target}`);
    }

    await page.screenshot({
      path: actualPath(target),
      clip: {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      },
      omitBackground: true,
    });
  } else {
    const box = await root.boundingBox();
    if (!box) {
      throw new Error(`Unable to resolve screenshot bounds for ${target}`);
    }

    await page.screenshot({
      path: actualPath(target),
      clip: {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      },
      omitBackground: true,
    });
  }

  return spec;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const targets = resolveTargets(args);

  if (!existsSync(path.join(process.cwd(), 'dist', 'index.html'))) {
    throw new Error('Missing `dist/index.html`. Run `npm run build` before capture.');
  }

  await ensureDirs();

  const { chromium } = await importPlaywright();
  const preview = startPreview(args.port);

  try {
    await waitForPreview(args.port);
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 1280, height: 1000 },
      deviceScaleFactor: 1,
    });

    for (const target of targets) {
      await captureTarget(page, target, args.port, args.lang);
      process.stdout.write(`captured ${target}\n`);
    }

    await browser.close();
  } finally {
    preview.kill('SIGTERM');
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
