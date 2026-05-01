import {
  TARGETS,
  OUTPUT_DIR,
  parseArgs,
  resolveTargets,
  resolveOutputPath,
  captureTarget,
} from './core.mjs';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const targets = resolveTargets(args);
  const outputDir = args['output-dir'] || OUTPUT_DIR;

  for (const target of targets) {
    const outputPath = resolveOutputPath(target, outputDir);
    await captureTarget(target, outputPath);
    console.log(`${target}: ${outputPath}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
