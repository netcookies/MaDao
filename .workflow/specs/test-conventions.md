---
title: "Test Conventions"
readMode: required
priority: high
category: test
keywords:
  - test
  - coverage
  - mock
  - fixture
  - assertion
  - framework
---

# Test Conventions

Category: `test`

## Detected Test Patterns

- Rust unit tests live inline in source modules using `#[test]`.
- Frontend has screenshot/design fixture support under `ui/src/testing` and scripts in `package.json`.
- No dedicated Jest or Vitest suite was detected for `ui/src`.

## Practical Expectations

- For Rust behavior changes, prefer local module unit tests near the implementation.
- For UI behavior changes, validate with `npm run build` and use screenshot tooling when visual behavior matters.
- When changing shared contracts, verify both serialization shape and UI consumption paths.

## Naming And Placement

- Rust tests follow descriptive `snake_case` names and are colocated in the source file they validate.
- UI screenshot fixtures and design scenes live under `ui/src/testing`.

## Gaps

- Frontend interaction-level automated tests appear limited. Behavior-sensitive UI changes may need manual verification notes until a broader test harness exists.
