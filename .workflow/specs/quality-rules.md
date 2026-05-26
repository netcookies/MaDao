---
title: "Quality Rules"
readMode: required
priority: medium
category: review
keywords:
  - quality
  - lint
  - rule
  - enforcement
---

# Quality Rules

Category: `quality`

## Detected Signals

- `package.json` defines a production `build` workflow for the frontend via `vite build`.
- Rust workspace structure implies `cargo check` / `cargo test` quality gates for backend crates.
- `tsconfig.json` has `strict: true`, which means TypeScript correctness is a project-level expectation.

## Expected Validation

- Frontend changes should at minimum pass `npm run build`.
- Rust/runtime changes should run the most relevant `cargo test` or `cargo check` target when touched.
- API contract changes should be validated across UI types and Rust response models.

## Review Priorities

- Catch UI state drift between local draft state and runtime truth.
- Catch provider-specific regressions around enable/disable flows, release rules, and routing.
- Prefer small, atomic changes with clear user-visible verification paths.

## Uncertain Areas

- No dedicated ESLint or Prettier config was detected in the repo root. Mark formatting/lint rules as convention-driven rather than tool-enforced.
- No CI workflow directory was detected locally. Treat local build/test commands as the primary validation source for now.
