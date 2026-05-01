import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import {
  DIFF_DIR,
  OUTPUT_DIR,
  TARGETS,
  ensureDir,
  parseArgs,
  resolveTargets,
  resolveBaselinePath,
  resolveOutputPath,
  captureTarget,
} from './core.mjs';

function readPng(filePath) {
  return PNG.sync.read(fs.readFileSync(filePath));
}

function comparePngs(currentPath, baselinePath, diffPath) {
  const current = readPng(currentPath);
  const baseline = readPng(baselinePath);

  if (current.width !== baseline.width || current.height !== baseline.height) {
    return {
      diffPixels: -1,
      sizeMismatch: `尺寸不一致：${path.basename(currentPath)} 当前 ${current.width}x${current.height}，基线 ${baseline.width}x${baseline.height}`,
    };
  }

  const diff = new PNG({ width: current.width, height: current.height });
  const diffPixels = pixelmatch(
    current.data,
    baseline.data,
    diff.data,
    current.width,
    current.height,
    { threshold: 0.1 },
  );

  if (diffPixels > 0) {
    ensureDir(path.dirname(diffPath));
    fs.writeFileSync(diffPath, PNG.sync.write(diff));
  }

  return { diffPixels, sizeMismatch: null };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const targets = resolveTargets(args);
  const outputDir = args['output-dir'] || OUTPUT_DIR;
  const diffDir = args['diff-dir'] || DIFF_DIR;
  let hasDiff = false;

  for (const target of targets) {
    const currentPath = resolveOutputPath(target, outputDir);
    const baselinePath = resolveBaselinePath(target, args.baseline);
    const diffPath = path.resolve(process.cwd(), diffDir, TARGETS[target].replace('.png', '.diff.png'));

    await captureTarget(target, currentPath);
    const { diffPixels, sizeMismatch } = comparePngs(currentPath, baselinePath, diffPath);
    if (sizeMismatch) {
      hasDiff = true;
      console.log(`${target}: MISMATCH (${sizeMismatch})`);
    } else if (diffPixels > 0) {
      hasDiff = true;
      console.log(`${target}: DIFF (${diffPixels} px) -> ${diffPath}`);
    } else {
      console.log(`${target}: PASS`);
    }
  }

  if (hasDiff && args['fail-on-diff']) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
