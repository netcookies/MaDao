---
name: release
description: Run the MaDao release flow when the user wants to bump version, generate release notes, create or push a release tag, or trigger the CI desktop build through the project release scripts.
---

# Release

## Overview

Use this skill for MaDao release work. It standardizes version bumping, local verification, tag creation, push, and release-notes generation through the project scripts instead of manual file edits.

## Commands

- Full release:

```bash
npm run release -- patch
npm run release -- minor
npm run release -- 0.2.0
```

- Dry run:

```bash
npm run release -- patch --dry-run
```

- Release notes only:

```bash
npm run release:notes -- --current-tag v0.2.0 --to-ref HEAD
```

When the user names `$release`, invoke one of the commands above instead of reimplementing the release flow manually.

## Workflow

1. Run `git status --short` first. Stop if the worktree is not clean.
2. Resolve the target version from the user request:
   - `patch` / `minor` / `major`
   - exact semver like `0.2.0` or `0.2.1-beta.1`
3. Prefer `npm run release -- <target>` from the repository root.
4. Use `--dry-run` when the user only wants a preview.
5. Use `npm run release:notes -- ...` when the user only wants release notes, not a full release.

## Guarantees

- `scripts/release.mjs` updates the project version files, runs release checks, creates `chore: 发布 vX.Y.Z`, creates tag `vX.Y.Z`, pushes branch and tag, and writes a local notes preview to `.git/release-notes-vX.Y.Z.md`.
- `scripts/generate-release-notes.mjs` is the single source for release-note generation used by both local preview and CI.
- CI release builds are triggered by the pushed tag through `.github/workflows/release.yml`.

## Constraints

- Never release with unrelated uncommitted changes.
- Never hand-edit version files unless the release script fails and needs repair.
- If the user does not specify the bump target and it cannot be inferred safely, ask for the target instead of guessing.
- If the target tag already exists locally or on `origin`, stop and report it.
