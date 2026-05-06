import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { baselinePath, exportedPath, hasExportedBaseline, TARGETS } from './core.mjs';

async function main() {
  await mkdir(path.join(process.cwd(), 'designs', 'screenshots'), { recursive: true });

  for (const target of Object.keys(TARGETS)) {
    if (!hasExportedBaseline(target)) {
      process.stdout.write(`skipped baseline ${target} (no exported design)\n`);
      continue;
    }
    await copyFile(exportedPath(target), baselinePath(target));
    process.stdout.write(`updated baseline ${target}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
