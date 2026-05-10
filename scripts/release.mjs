#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const RELEASE_FILES = ['Cargo.toml', 'Cargo.lock', 'package.json', 'package-lock.json'];
const WORKSPACE_LOCK_PACKAGES = [
  'plugin-sdk',
  'sms-core',
  'sms-server',
  'madao-sms-daemon',
  'madao-tauri',
];

const SEMVER_PATTERN = /^(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)(?<prerelease>-[0-9A-Za-z.-]+)?$/;

function printHelp() {
  process.stdout.write(
    [
      'Usage:',
      '  node scripts/release.mjs <patch|minor|major|version> [options]',
      '',
      'Examples:',
      '  node scripts/release.mjs patch',
      '  node scripts/release.mjs minor --dry-run',
      '  node scripts/release.mjs 0.2.0-beta.1',
      '',
      'Options:',
      '  --dry-run              Show the next version and release actions without modifying files',
      '  --skip-checks          Skip npm/cargo verification before commit',
      '  --no-push              Create commit and tag locally without pushing',
      '  --notes-file <path>    Override local release-notes preview path',
      '',
    ].join('\n'),
  );
}

function parseArgs(argv) {
  const args = {
    target: '',
    dryRun: false,
    skipChecks: false,
    noPush: false,
    notesFile: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!args.target && !token.startsWith('--')) {
      args.target = token;
    } else if (token === '--dry-run') {
      args.dryRun = true;
    } else if (token === '--skip-checks') {
      args.skipChecks = true;
    } else if (token === '--no-push') {
      args.noPush = true;
    } else if (token === '--notes-file') {
      args.notesFile = argv[index + 1] ?? '';
      index += 1;
    } else if (token === '--help' || token === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (!args.target.trim()) {
    throw new Error('Missing required release target: patch | minor | major | x.y.z[-prerelease].');
  }

  return args;
}

function capture(command, args, { allowFailure = false } = {}) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    if (allowFailure) {
      return '';
    }
    const stderr = error.stderr?.toString().trim();
    const stdout = error.stdout?.toString().trim();
    throw new Error(
      [
        `${command} ${args.join(' ')} failed.`,
        stderr,
        stdout,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }
}

function run(command, args) {
  process.stdout.write(`> ${command} ${args.join(' ')}\n`);
  execFileSync(command, args, { stdio: 'inherit' });
}

function git(args, options) {
  return capture('git', args, options);
}

function changeToRepoRoot() {
  const root = git(['rev-parse', '--show-toplevel']);
  process.chdir(root);
  return root;
}

function parseSemver(version) {
  const match = version.match(SEMVER_PATTERN);
  if (!match?.groups) {
    throw new Error(`Invalid semver version: ${version}`);
  }

  return {
    major: Number(match.groups.major),
    minor: Number(match.groups.minor),
    patch: Number(match.groups.patch),
    prerelease: match.groups.prerelease ?? '',
  };
}

function formatSemver(parts) {
  return `${parts.major}.${parts.minor}.${parts.patch}${parts.prerelease ?? ''}`;
}

function computeNextVersion(currentVersion, target) {
  if (['patch', 'minor', 'major'].includes(target)) {
    const parsed = parseSemver(currentVersion);
    if (target === 'patch') {
      return formatSemver({ major: parsed.major, minor: parsed.minor, patch: parsed.patch + 1, prerelease: '' });
    }
    if (target === 'minor') {
      return formatSemver({ major: parsed.major, minor: parsed.minor + 1, patch: 0, prerelease: '' });
    }
    return formatSemver({ major: parsed.major + 1, minor: 0, patch: 0, prerelease: '' });
  }

  parseSemver(target);
  return target;
}

function readWorkspaceVersion() {
  const cargoToml = readFileSync('Cargo.toml', 'utf8');
  const workspaceVersion = cargoToml.match(/\[workspace\.package\][\s\S]*?version\s*=\s*"([^"]+)"/)?.[1];
  if (!workspaceVersion) {
    throw new Error('Unable to read [workspace.package].version from Cargo.toml.');
  }
  return workspaceVersion;
}

function replaceWorkspaceVersion(cargoToml, nextVersion) {
  const nextText = cargoToml.replace(
    /(\[workspace\.package\][\s\S]*?version\s*=\s*")([^"]+)(")/,
    `$1${nextVersion}$3`,
  );
  if (nextText === cargoToml) {
    throw new Error('Failed to update workspace version in Cargo.toml.');
  }
  return nextText;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceCargoLockVersion(cargoLock, nextVersion) {
  let nextText = cargoLock;

  for (const packageName of WORKSPACE_LOCK_PACKAGES) {
    const pattern = new RegExp(
      String.raw`(\[\[package\]\]\nname = "${escapeRegExp(packageName)}"\nversion = ")([^"]+)(")`,
    );
    if (!pattern.test(nextText)) {
      throw new Error(`Failed to locate ${packageName} in Cargo.lock.`);
    }
    nextText = nextText.replace(pattern, `$1${nextVersion}$3`);
  }

  return nextText;
}

function assertVersionConsistency(currentVersion) {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
  const packageLock = JSON.parse(readFileSync('package-lock.json', 'utf8'));

  if (packageJson.version !== currentVersion) {
    throw new Error(`package.json version ${packageJson.version} does not match Cargo.toml version ${currentVersion}.`);
  }
  if (packageLock.version !== currentVersion) {
    throw new Error(`package-lock.json version ${packageLock.version} does not match Cargo.toml version ${currentVersion}.`);
  }
  if (packageLock.packages?.['']?.version !== currentVersion) {
    throw new Error(`package-lock.json root package version ${packageLock.packages?.['']?.version} does not match Cargo.toml version ${currentVersion}.`);
  }
}

function ensureCleanWorktree() {
  const status = git(['status', '--short']);
  if (status) {
    throw new Error(`Worktree is not clean.\n${status}`);
  }
}

function ensureBranch() {
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch === 'HEAD') {
    throw new Error('Detached HEAD is not supported for release.');
  }
  return branch;
}

function ensureOriginRemote() {
  const originUrl = git(['remote', 'get-url', 'origin'], { allowFailure: true });
  if (!originUrl) {
    throw new Error('Git remote `origin` is not configured.');
  }
}

function ensureLocalTagAbsent(tag) {
  if (git(['rev-parse', '-q', '--verify', `refs/tags/${tag}`], { allowFailure: true })) {
    throw new Error(`Local tag already exists: ${tag}`);
  }
}

function ensureRemoteTagAbsent(tag) {
  const remoteTag = git(['ls-remote', '--exit-code', '--tags', 'origin', `refs/tags/${tag}`], { allowFailure: true });
  if (remoteTag) {
    throw new Error(`Remote tag already exists on origin: ${tag}`);
  }
}

function updateVersionFiles(nextVersion) {
  const cargoToml = readFileSync('Cargo.toml', 'utf8');
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
  const packageLock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  const cargoLock = readFileSync('Cargo.lock', 'utf8');

  const nextCargoToml = replaceWorkspaceVersion(cargoToml, nextVersion);
  const nextCargoLock = replaceCargoLockVersion(cargoLock, nextVersion);
  const nextPackageJson = { ...packageJson, version: nextVersion };
  const nextPackageLock = {
    ...packageLock,
    version: nextVersion,
    packages: {
      ...packageLock.packages,
      '': {
        ...(packageLock.packages?.[''] ?? {}),
        version: nextVersion,
      },
    },
  };

  writeFileSync('Cargo.toml', nextCargoToml);
  writeFileSync('Cargo.lock', nextCargoLock);
  writeFileSync('package.json', `${JSON.stringify(nextPackageJson, null, 2)}\n`);
  writeFileSync('package-lock.json', `${JSON.stringify(nextPackageLock, null, 2)}\n`);
}

function ensureOnlyReleaseFilesChanged() {
  const status = git(['status', '--porcelain']);
  if (!status) {
    throw new Error('No release file changes detected after version bump.');
  }

  const allowed = new Set(RELEASE_FILES);
  const changedPaths = status
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const normalized = line.replace(/^\s+/, '');
      if (normalized.startsWith('?? ')) {
        return normalized.slice(3).trim();
      }
      return normalized.slice(2).trim();
    });

  const unexpected = changedPaths.filter((filePath) => !allowed.has(filePath));
  if (unexpected.length > 0) {
    throw new Error(`Unexpected modified files during release:\n${unexpected.join('\n')}`);
  }
}

function generateNotesPreview(tag, notesFile) {
  const defaultPath = resolve('.git', `release-notes-${tag}.md`);
  const outputPath = resolve(notesFile || defaultPath);
  mkdirSync(dirname(outputPath), { recursive: true });

  run(process.execPath, [
    fileURLToPath(new URL('./generate-release-notes.mjs', import.meta.url)),
    '--current-tag',
    tag,
    '--to-ref',
    'HEAD',
    '--notes-file',
    outputPath,
  ]);

  return outputPath;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  changeToRepoRoot();

  const currentVersion = readWorkspaceVersion();
  assertVersionConsistency(currentVersion);

  const nextVersion = computeNextVersion(currentVersion, args.target.trim());
  if (nextVersion === currentVersion) {
    throw new Error(`Next version matches current version: ${currentVersion}`);
  }

  const tag = `v${nextVersion}`;
  const branch = ensureBranch();
  ensureLocalTagAbsent(tag);
  if (!args.noPush) {
    ensureOriginRemote();
    ensureRemoteTagAbsent(tag);
  }
  ensureCleanWorktree();

  if (args.dryRun) {
    process.stdout.write(
      [
        `Current version: ${currentVersion}`,
        `Next version: ${nextVersion}`,
        `Branch: ${branch}`,
        `Tag: ${tag}`,
        `Checks: ${args.skipChecks ? 'skipped' : 'npm run build, cargo check --workspace, cargo test -p sms-core'}`,
        `Push: ${args.noPush ? 'disabled' : 'origin branch + tag'}`,
        '',
      ].join('\n'),
    );
    return;
  }

  updateVersionFiles(nextVersion);

  if (!args.skipChecks) {
    run('npm', ['run', 'build']);
    run('cargo', ['check', '--workspace']);
    run('cargo', ['test', '-p', 'sms-core']);
  }

  ensureOnlyReleaseFilesChanged();

  run('git', ['add', ...RELEASE_FILES]);
  run('git', ['commit', '-m', `chore: 发布 ${tag}`]);
  run('git', ['tag', '-a', tag, '-m', `发布 ${tag}`]);

  const notesPath = generateNotesPreview(tag, args.notesFile);

  if (!args.noPush) {
    run('git', ['push', 'origin', branch]);
    run('git', ['push', 'origin', tag]);
  }

  process.stdout.write(
    [
      `Release complete: ${tag}`,
      `Branch: ${branch}`,
      `Notes preview: ${notesPath}`,
      args.noPush ? 'Push skipped by --no-push.' : 'Branch and tag have been pushed to origin.',
      '',
    ].join('\n'),
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`${String(error.message || error)}\n`);
  process.exit(1);
}
