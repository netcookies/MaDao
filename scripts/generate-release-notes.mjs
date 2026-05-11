#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

const CONVENTIONAL_TITLES = new Map([
  ['feat', '新功能'],
  ['fix', '问题修复'],
  ['perf', '优化改进'],
  ['refactor', '优化改进'],
  ['docs', '文档更新'],
  ['test', '测试与质量'],
  ['build', '工程与构建'],
  ['ci', '工程与构建'],
  ['chore', '工程与维护'],
  ['revert', '回滚变更'],
]);

const GROUP_ORDER = [
  '新功能',
  '优化改进',
  '问题修复',
  '文档更新',
  '测试与质量',
  '工程与构建',
  '工程与维护',
  '回滚变更',
  '其他变更',
];

const RELEASE_COMMIT_PATTERNS = [
  /^chore(?:\([^)]+\))?:\s*发布\s+v?\d/i,
  /^chore(?:\([^)]+\))?:\s*release\s+v?\d/i,
  /^ci(?:\([^)]+\))?:\s*bump version\b/i,
  /^bump version\b/i,
];

function parseArgs(argv) {
  const args = {
    currentTag: '',
    previousTag: '',
    toRef: '',
    notesFile: '',
    githubOutput: '',
    model: process.env.RELEASE_NOTES_MODEL || 'openai/gpt-4o',
    noAi: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--current-tag') {
      args.currentTag = argv[index + 1] ?? '';
      index += 1;
    } else if (token === '--previous-tag') {
      args.previousTag = argv[index + 1] ?? '';
      index += 1;
    } else if (token === '--to-ref') {
      args.toRef = argv[index + 1] ?? '';
      index += 1;
    } else if (token === '--notes-file') {
      args.notesFile = argv[index + 1] ?? '';
      index += 1;
    } else if (token === '--github-output') {
      args.githubOutput = argv[index + 1] ?? '';
      index += 1;
    } else if (token === '--model') {
      args.model = argv[index + 1] ?? args.model;
      index += 1;
    } else if (token === '--no-ai') {
      args.noAi = true;
    } else if (token === '--help' || token === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  return args;
}

function printHelp() {
  process.stdout.write(
    [
      'Usage:',
      '  node scripts/generate-release-notes.mjs [options]',
      '',
      'Options:',
      '  --current-tag <tag>      Release tag, e.g. v0.2.0',
      '  --previous-tag <tag>     Override previous tag detection',
      '  --to-ref <ref>           Upper git ref for commit range, defaults to current tag or HEAD',
      '  --notes-file <path>      Write rendered markdown to a file',
      '  --github-output <path>   Write GitHub Actions step outputs',
      '  --model <id>             GitHub Models model id, default openai/gpt-4o',
      '  --no-ai                  Disable AI polishing and use deterministic notes only',
      '',
    ].join('\n'),
  );
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

function git(args, options) {
  return capture('git', args, options);
}

function changeToRepoRoot() {
  const root = git(['rev-parse', '--show-toplevel']);
  process.chdir(root);
  return root;
}

function readWorkspaceVersion() {
  const cargoToml = readFileSync('Cargo.toml', 'utf8');
  const workspaceVersion = cargoToml.match(/\[workspace\.package\][\s\S]*?version\s*=\s*"([^"]+)"/)?.[1];
  if (!workspaceVersion) {
    throw new Error('Unable to read [workspace.package].version from Cargo.toml.');
  }
  return workspaceVersion;
}

function readProductName() {
  const configPath = resolve('src-tauri', 'tauri.conf.json');
  if (!existsSync(configPath)) {
    return 'MaDao';
  }
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    return typeof config.productName === 'string' && config.productName.trim()
      ? config.productName.trim()
      : 'MaDao';
  } catch {
    return 'MaDao';
  }
}

function readProductSlug() {
  return 'madao';
}

function resolveCurrentTag(args) {
  if (args.currentTag.trim()) {
    return args.currentTag.trim();
  }

  const envTag = (process.env.GITHUB_REF_NAME || '').trim();
  if (envTag.startsWith('v')) {
    return envTag;
  }

  const exactTag = git(['describe', '--tags', '--exact-match'], { allowFailure: true });
  if (exactTag.startsWith('v')) {
    return exactTag;
  }

  return `v${readWorkspaceVersion()}`;
}

function refExists(ref) {
  return git(['rev-parse', '-q', '--verify', ref], { allowFailure: true }) !== '';
}

function resolveUpperRef(args, currentTag) {
  if (args.toRef.trim()) {
    return args.toRef.trim();
  }

  if (refExists(currentTag) || refExists(`refs/tags/${currentTag}`)) {
    return currentTag;
  }

  return 'HEAD';
}

function isPrereleaseTag(tag) {
  return tag.includes('-');
}

function resolvePreviousTag(args, currentTag, upperRef) {
  if (args.previousTag.trim()) {
    return args.previousTag.trim();
  }

  const tagsOutput = git(['tag', '--merged', upperRef, '--sort=-v:refname'], { allowFailure: true });
  const tags = tagsOutput
    .split('\n')
    .map((item) => item.trim())
    .filter((item) => item.startsWith('v') && item !== currentTag);

  if (isPrereleaseTag(currentTag)) {
    return tags[0] ?? '';
  }

  return tags.find((item) => !item.includes('-')) ?? '';
}

function isReleaseCommit(subject) {
  return RELEASE_COMMIT_PATTERNS.some((pattern) => pattern.test(subject));
}

function collectCommitSubjects(previousTag, upperRef) {
  const range = previousTag ? `${previousTag}..${upperRef}` : upperRef;
  const output = git(['log', range, '--no-merges', '--pretty=format:%s'], { allowFailure: true });
  if (!output) {
    return [];
  }

  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isReleaseCommit(line));
}

function parseConventionalCommit(subject) {
  const match = subject.match(
    /^(?<type>feat|fix|perf|refactor|docs|test|build|ci|chore|revert)(?:\((?<scope>[^)]+)\))?(?<breaking>!)?:\s*(?<description>.+)$/i,
  );
  if (!match?.groups) {
    return null;
  }

  const type = match.groups.type.toLowerCase();
  const title = CONVENTIONAL_TITLES.get(type) ?? '其他变更';
  const description = match.groups.description.trim();
  const scope = match.groups.scope?.trim();

  return {
    type,
    title,
    item: scope ? `${scope}: ${description}` : description,
  };
}

function groupCommitSubjects(subjects) {
  const groups = new Map();

  for (const subject of subjects) {
    const parsed = parseConventionalCommit(subject);
    const title = parsed?.title ?? '其他变更';
    const item = parsed?.item ?? subject;

    if (!groups.has(title)) {
      groups.set(title, []);
    }
    groups.get(title).push(item);
  }

  return groups;
}

function titleToEnglish(title) {
  const mapping = new Map([
    ['新功能', 'Features'],
    ['优化改进', 'Improvements'],
    ['问题修复', 'Fixes'],
    ['文档更新', 'Documentation'],
    ['测试与质量', 'Tests & Quality'],
    ['工程与构建', 'Build & CI'],
    ['工程与维护', 'Maintenance'],
    ['回滚变更', 'Reverts'],
    ['其他变更', 'Other Changes'],
  ]);
  return mapping.get(title) ?? title;
}

function buildDeterministicSummary(groups, previousTag) {
  const sections = [];

  if (!previousTag) {
    sections.push('## 首次发布', '- 建立首个版本发布基线，并提供自动化桌面构建产物。', '');
  }

  for (const title of GROUP_ORDER) {
    const items = groups.get(title);
    if (!items || items.length === 0) {
      continue;
    }
    sections.push(`## ${title}`);
    for (const item of items) {
      sections.push(`- ${item}`);
    }
    sections.push('');
  }

  const output = sections.join('\n').trim();
  if (output) {
    return output;
  }

  return [
    '## 版本更新',
    '- 同步版本号并发布新的桌面构建产物。',
  ].join('\n');
}

function translateCommitItemToEnglish(item) {
  return item
    .replace(/为激活记录增加等待计时/g, 'Add per-activation wait timers')
    .replace(/提升 provider 配置扩展能力/g, 'Improve provider configuration extensibility')
    .replace(/新功能/g, 'Features')
    .replace(/优化改进/g, 'Improvements')
    .replace(/问题修复/g, 'Fixes')
    .replace(/文档更新/g, 'Documentation')
    .replace(/测试与质量/g, 'Tests and quality')
    .replace(/工程与构建/g, 'Build and CI')
    .replace(/工程与维护/g, 'Maintenance')
    .replace(/回滚变更/g, 'Reverts')
    .replace(/其他变更/g, 'Other changes')
    .replace(/^routing:\s*/i, 'routing: ')
    .replace(/^ui:\s*/i, 'ui: ')
    .replace(/^runtime:\s*/i, 'runtime: ');
}

function buildDeterministicEnglishSummary(groups, previousTag) {
  const sections = [];

  if (!previousTag) {
    sections.push('## Initial Release', '- Establish the first release baseline and publish automated desktop build artifacts.', '');
  }

  for (const title of GROUP_ORDER) {
    const items = groups.get(title);
    if (!items || items.length === 0) {
      continue;
    }
    sections.push(`## ${titleToEnglish(title)}`);
    for (const item of items) {
      sections.push(`- ${translateCommitItemToEnglish(item)}`);
    }
    sections.push('');
  }

  const output = sections.join('\n').trim();
  if (output) {
    return output;
  }

  return [
    '## Release Update',
    '- Sync the version and publish updated desktop build artifacts.',
  ].join('\n');
}

function buildDetailsSection(subjects) {
  if (subjects.length === 0) {
    return '';
  }

  return [
    '<details>',
    '<summary>提交明细</summary>',
    '',
    ...subjects.map((subject) => `- ${subject}`),
    '</details>',
  ].join('\n');
}

function buildEnglishSummaryDetails(englishSummary) {
  return [
    '<details>',
    '<summary>English Release Notes</summary>',
    '',
    englishSummary,
    '</details>',
  ].join('\n');
}

function sanitizeAiNotes(rawNotes) {
  if (!rawNotes) {
    return '';
  }

  return rawNotes
    .trim()
    .replace(/^```(?:markdown)?/i, '')
    .replace(/```$/i, '')
    .trim();
}

async function generateAiSummary({
  currentTag,
  previousTag,
  subjects,
  deterministicSummary,
  model,
}) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) {
    return '';
  }

  const prompt = [
    '你是一个专业的软件发版说明撰写助手。',
    '请根据以下 git commit 记录，为桌面应用“码到”生成简洁、专业的中文发版说明。',
    '',
    '要求：',
    '1. 仅输出 Markdown 正文，不要附加解释。',
    '2. 优先按「新功能」「优化改进」「问题修复」「工程与维护」分组，没有内容的分组可以省略。',
    '3. 每条不超过一行，避免照抄 commit 前缀。',
    '4. 不要编造 commit 中不存在的信息。',
    '5. 面向最终使用者表达，但允许保留必要的技术名词。',
    '',
    `当前版本：${currentTag}`,
    `上一版本：${previousTag || '首次发布'}`,
    '',
    '原始提交：',
    ...subjects.map((subject) => `- ${subject}`),
    '',
    '可参考的保底分组草稿：',
    deterministicSummary,
  ].join('\n');

  const response = await fetch('https://models.github.ai/inference/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      max_tokens: 900,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub Models request failed: ${response.status} ${response.statusText}: ${text.slice(0, 400)}`);
  }

  const payload = await response.json();
  return sanitizeAiNotes(payload?.choices?.[0]?.message?.content ?? '');
}

function writeGitHubOutput(outputPath, values) {
  const lines = [];
  for (const [key, value] of Object.entries(values)) {
    const delimiter = `EOF_${randomUUID()}`;
    lines.push(`${key}<<${delimiter}`);
    lines.push(String(value ?? ''));
    lines.push(delimiter);
  }
  writeFileSync(outputPath, `${lines.join('\n')}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  changeToRepoRoot();

  const currentTag = resolveCurrentTag(args);
  const upperRef = resolveUpperRef(args, currentTag);
  const previousTag = resolvePreviousTag(args, currentTag, upperRef);
  const releaseName = `${readProductName()} ${currentTag}${isPrereleaseTag(currentTag) ? ' 预发布' : ''}`;
  const releaseAssetPrefix = `${readProductSlug()}-${currentTag}`;
  const subjects = collectCommitSubjects(previousTag, upperRef);
  const groups = groupCommitSubjects(subjects);
  const deterministicSummary = buildDeterministicSummary(groups, previousTag);
  const deterministicEnglishSummary = buildDeterministicEnglishSummary(groups, previousTag);

  let renderedSummary = deterministicSummary;
  if (!args.noAi) {
    try {
      const aiSummary = await generateAiSummary({
        currentTag,
        previousTag,
        subjects,
        deterministicSummary,
        model: args.model,
      });
      if (aiSummary) {
        renderedSummary = aiSummary;
      }
    } catch (error) {
      process.stderr.write(`AI release notes fallback: ${String(error.message || error)}\n`);
    }
  }

  const englishDetailsSection = buildEnglishSummaryDetails(deterministicEnglishSummary);
  const detailsSection = buildDetailsSection(subjects);
  const releaseBody = [renderedSummary.trim(), englishDetailsSection.trim(), detailsSection.trim()].filter(Boolean).join('\n\n---\n\n').trim();

  if (args.notesFile.trim()) {
    const notesPath = resolve(args.notesFile);
    mkdirSync(dirname(notesPath), { recursive: true });
    writeFileSync(notesPath, `${releaseBody}\n`);
  }

  if (args.githubOutput.trim()) {
    writeGitHubOutput(resolve(args.githubOutput), {
      current_tag: currentTag,
      previous_tag: previousTag,
      prerelease: String(isPrereleaseTag(currentTag)),
      release_name: releaseName,
      release_asset_prefix: releaseAssetPrefix,
      release_body: releaseBody,
    });
  }

  process.stdout.write(
    [
      `Current tag: ${currentTag}`,
      `Previous tag: ${previousTag || '<none>'}`,
      '',
      releaseBody,
      '',
    ].join('\n'),
  );
}

main().catch((error) => {
  process.stderr.write(`${String(error.message || error)}\n`);
  process.exit(1);
});
