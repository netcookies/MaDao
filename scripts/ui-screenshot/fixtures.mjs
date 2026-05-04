import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { baselinePath, exportedPath, TARGETS } from './core.mjs';

async function main() {
  await mkdir(path.join(process.cwd(), 'designs', 'screenshots'), { recursive: true });

  for (const target of Object.keys(TARGETS)) {
    await copyFile(exportedPath(target), baselinePath(target));
    process.stdout.write(`updated baseline ${target}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
