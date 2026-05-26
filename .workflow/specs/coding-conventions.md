---
title: "Coding Conventions"
readMode: required
priority: high
category: coding
keywords:
  - style
  - naming
  - import
  - pattern
  - convention
  - formatting
---

# Coding Conventions

Category: `coding`

## Detected Stack

- Frontend uses `TypeScript` + `React 19` with function components and hooks.
- Desktop/backend uses Rust workspace crates plus `Tauri`.
- UI code lives under `ui/src`; Rust domain/server code lives under `crates/*`, `apps/daemon`, and `src-tauri`.

## Naming

- React components use `PascalCase` and usually match file names, for example `MessagesScreen.tsx` and `ProviderWorkspaceScreen.tsx`.
- Hooks use `use*` naming, for example `useProviderRuntime` and `useActivationFlow`.
- Utility modules use lower-case filenames with descriptive names, for example `formatters.ts` and `runtimeApi.ts`.
- Rust types use `PascalCase`; functions and modules use `snake_case`.

## Imports And Module Style

- Frontend prefers grouped ES imports with type-only imports where useful.
- Local imports are relative and typically grouped by layer: app types, hooks, services, then utilities.
- Rust modules are split by responsibility such as `service`, `provider`, `models`, and `options`.

## State And React Patterns

- Complex UI state is extracted into focused hooks rather than kept inline in `App.tsx`.
- Derived data is computed with `useMemo`.
- Async UI actions are encapsulated in hooks and update shared state through setter injection.
- `startTransition` is used when runtime refreshes update large state payloads.

## Formatting And Style

- TypeScript files use semicolons and single quotes.
- Multi-line imports and object literals are formatted compactly with trailing commas.
- Existing code uses concise English identifiers and short user-facing English labels in UI.
- Comments are sparse; only add them when behavior is not self-evident.

## Data And Error Handling

- Frontend runtime APIs throw `Error` on non-OK responses and surface messages to UI status text.
- Rust code uses explicit `Result<_, SmsError>` flow and converts upstream/network failures into typed errors.
- Prefer non-clever, explicit branching for provider-specific behavior.
