---
title: "Architecture Constraints"
readMode: required
priority: high
category: arch
keywords:
  - architecture
  - module
  - layer
  - boundary
  - dependency
  - structure
---

# Architecture Constraints

Category: `arch`

## High-Level Structure

- `ui/` contains the React renderer UI.
- `src-tauri/` owns desktop shell integration, menu/tray wiring, bundled defaults, and app lifecycle.
- `crates/sms-core/` contains provider abstractions, runtime state, routing, option cache, and ticket lifecycle.
  - `runtime_store.rs` — `RuntimeStore` abstraction (SQLite backend + InMemory fallback) for transactional runtime state persistence.
  - `runtime_config.rs` — `AppPersistencePaths` and runtime settings/routing plan disk I/O.
- `crates/sms-server/` exposes the HTTP API used by the UI.
- `apps/daemon/` provides daemon/runtime entrypoint logic.
- `plugins/providers/*.toml` define provider manifests and protocol configuration.

## Layer Boundaries

- UI should talk to runtime only through service modules under `ui/src/services`.
- Provider protocol behavior belongs in Rust provider implementations, not in React components.
- Manifest persistence, option cache refresh, and routing rules belong in `sms-core::service`.
- Tauri menu/tray events should emit commands into the UI rather than duplicating UI logic in Rust.

## State Ownership

- Runtime snapshot and provider manifests are shared application state in frontend hooks, not per-component local state.
- Ticket truth comes from backend runtime snapshot; UI-only safeguards may exist, but backend remains source of truth.
- Provider enablement must be persisted through runtime APIs, not only mutated in UI draft state.

## Plugin And Provider Rules

- Provider-specific protocol differences are handled via manifest config and provider implementations.
- `mock` providers are special-cased and should not leak into normal production routing or activation flows.
- Auto-routing only considers enabled non-mock providers and follows runtime settings.

## Persistence And Config

- App config and default provider manifests are seeded by Tauri into user config directories.
- Runtime state (tickets, logs, activity, reuse pool, provider balance cache, OpenAI regions cache) is persisted via `RuntimeStore` backed by SQLite (`runtime.db`). Falls back to in-memory store when no DB path is provided.
- Configuration data (runtime settings, routing plans, provider options cache) remains as JSON files on disk.
- `RuntimeStore` exposes batch operations (`RuntimeStoreBatch`) for transactional multi-entity writes and trait-based repositories (`RuntimeStateRepository`, `ReleaseCoordinationRepository`) for domain-specific access.
- `.workflow/` exists for process artifacts and specs; do not overwrite existing workflow state blindly.

## Change Constraints

- UI fixes should preserve existing design-system structure under `ui/src/components` and `ui/src/app`.
- Cross-layer changes should keep API contracts synchronized, especially `TicketRecord`, provider summaries, and runtime snapshot payloads.
- Prefer adding provider-specific UX guards in UI while keeping upstream/server-side validation intact.


<spec-entry category="arch" keywords="openai,sms,whatsapp,country-filter,runtime-settings" date="2026-05-24" source="ui/src/app/utils.ts:212">

### OpenAI 短信国家过滤语义

OpenAI 短信国家过滤必须按运行时缓存的区域集合计算：最终可见国家 = 当前平台支持国家 - (whatsapp_regions - sms_regions)。如果某国家同时存在于 sms_regions 与 whatsapp_regions，必须保留显示，因为 sms 区域优先于 WhatsApp 排除。该规则属于运行时设置与国家选择器的共享业务约束，后续 UI、API、缓存刷新与文档都必须保持一致。

</spec-entry>