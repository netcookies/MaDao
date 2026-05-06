import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';
import {
  actualPath,
  baselinePath,
  copyExportedBaselines,
  diffPath,
  ensureDirs,
  hasExportedBaseline,
  listAvailableExports,
  parseArgs,
  resolveTargets,
} from './core.mjs';

async function importImageDeps() {
  try {
    const [{ PNG }, pixelmatchModule] = await Promise.all([
      import('pngjs'),
      import('pixelmatch'),
    ]);
    return {
      PNG,
      pixelmatch: pixelmatchModule.default,
    };
  } catch {
    throw new Error('Missing dependencies `pngjs` and/or `pixelmatch`. Run `npm install` first.');
  }
}

async function readPng(PNG, filePath) {
  return PNG.sync.read(await readFile(filePath));
}

async function compareOne(PNG, pixelmatch, target) {
  const baseline = await readPng(PNG, baselinePath(target));
  const actual = await readPng(PNG, actualPath(target));

  if (baseline.width !== actual.width || baseline.height !== actual.height) {
    throw new Error(
      `${target} dimension mismatch: baseline ${baseline.width}x${baseline.height}, actual ${actual.width}x${actual.height}`,
    );
  }

  const diff = new PNG({ width: baseline.width, height: baseline.height });
  const diffPixels = pixelmatch(
    baseline.data,
    actual.data,
    diff.data,
    baseline.width,
    baseline.height,
    {
      threshold: 0.08,
      includeAA: true,
    },
  );

  await writeFile(diffPath(target), PNG.sync.write(diff));
  return {
    target,
    diffPixels,
    totalPixels: baseline.width * baseline.height,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const targets = resolveTargets(args);
  const { PNG, pixelmatch } = await importImageDeps();

  await ensureDirs();

  if (args.updateBaselines) {
    const exports = await listAvailableExports();
    if (exports.length === 0) {
      throw new Error('No exported design baselines found in designs/screenshots/.pen-export-1x');
    }
    await copyExportedBaselines(targets);
  }

  const results = [];

  for (const target of targets) {
    if (!hasExportedBaseline(target)) {
      process.stdout.write(`${target}: skipped (no exported design baseline)\n`);
      continue;
    }
    const result = await compareOne(PNG, pixelmatch, target);
    results.push(result);
    const percent = (result.diffPixels / result.totalPixels) * 100;
    process.stdout.write(`${target}: ${result.diffPixels} px (${percent.toFixed(3)}%)\n`);
  }

  const hasDiff = results.some((item) => item.diffPixels > 0);
  if (hasDiff && args.failOnDiff) {
    process.exit(2);
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
