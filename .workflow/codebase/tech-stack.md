# MaDao Tech Stack

## Languages & Versions

| Language | Version | Usage |
|----------|---------|-------|
| Rust | Edition 2024 | Backend (core, server, daemon, Tauri bridge) |
| TypeScript | 5.9.x | Frontend UI |
| JavaScript (ESM) | ES2022 target | Build scripts, config |

## Frameworks

| Framework | Version | Role |
|-----------|---------|------|
| Tauri | 2.10.3 (lib), 2.5.1 (build) | Desktop shell, IPC bridge |
| React | 19.2.x | UI rendering |
| Axum | 0.8.6 | HTTP API server |
| Tailwind CSS | 3.4.x | Utility-first styling |
| Vite | 7.1.x | Frontend bundler / dev server |

## Workspace Structure

Cargo workspace with resolver v2:
- `crates/plugin-sdk` — plugin interface definitions
- `crates/sms-core` — domain logic, persistence, HTTP clients
- `crates/sms-server` — Axum HTTP layer
- `apps/daemon` — standalone headless daemon binary
- `src-tauri` — Tauri desktop app binary

## Key Dependencies

### Workspace-level (Rust)

| Crate | Version | Purpose |
|-------|---------|---------|
| tokio | 1.48.0 (full) | Async runtime |
| axum | 0.8.6 | HTTP framework |
| serde / serde_json | 1.0.228 / 1.0.145 | Serialization |
| reqwest | 0.12.24 (rustls-tls) | HTTP client |
| rusqlite | 0.32.1 (bundled, chrono, serde_json) | SQLite persistence |
| chrono | 0.4.42 | Date/time |
| uuid | 1.18.1 (v7) | Identifiers |
| tower-http | 0.6.6 (cors, trace) | HTTP middleware |
| anyhow / thiserror | 1.0.100 / 2.0.17 | Error handling |
| tracing | 0.1.41 | Structured logging |
| parking_lot | 0.12.5 | Synchronization primitives |
| toml | 0.8.23 | Config parsing |
| fs2 | 0.4.3 | File locking |
| async-trait | 0.1.89 | Async trait support |
| url | 2.5.7 | URL parsing |

### sms-core (dev-dependencies)

| Crate | Version | Purpose |
|-------|---------|---------|
| tempfile | 3 | Test temp directories |

### sms-server (dev-dependencies)

| Crate | Version | Purpose |
|-------|---------|---------|
| tower | 0.5 (util) | Test utilities |

### Frontend (npm)

| Package | Version | Purpose |
|---------|---------|---------|
| @tauri-apps/api | ^2.10.1 | Tauri IPC from JS |
| react / react-dom | ^19.2.0 | UI framework |
| i18next / react-i18next | ^26.0.10 / ^17.0.7 | Internationalization |
| lucide-react | ^1.12.0 | Icon library |
| @dnd-kit/* | ^6.3–^10.0 | Drag-and-drop |
| country-flag-icons | ^1.6.17 | Country flag SVGs |
| simple-icons | ^16.18.1 | Brand icons |

### Frontend (devDependencies)

| Package | Version | Purpose |
|---------|---------|---------|
| typescript | ^5.9.3 | Type checking |
| vite | ^7.1.12 | Build tool |
| @vitejs/plugin-react | ^5.1.0 | React fast-refresh |
| tailwindcss | ^3.4.19 | CSS utility framework |
| autoprefixer | ^10.5.0 | PostCSS vendor prefixes |
| postcss | ^8.5.13 | CSS processing |
| playwright | ^1.56.1 | Browser automation / visual testing |
| pixelmatch / pngjs | ^7.1.0 / ^7.0.0 | Screenshot comparison |

## Build System

- **Rust**: Cargo workspace (resolver v2), no custom rust-toolchain file
- **Frontend**: Vite 7 with React plugin, PostCSS (Tailwind + Autoprefixer)
- **Desktop**: `tauri-build` 2.5.1 (build.rs), Tauri CLI via `cargo run -p madao-tauri`
- **Orchestration**: `npm run app` = `vite build` then `cargo run -p madao-tauri`
- **Release**: Custom Node scripts (`scripts/release.mjs`, `scripts/generate-release-notes.mjs`)

## Dev Tooling

| Tool | Config | Purpose |
|------|--------|---------|
| Vite dev server | port 1420, proxy for web mode | Frontend HMR |
| Playwright | scripts/ui-screenshot/ | Visual regression testing |
| PostCSS | postcss.config.cjs | CSS pipeline |
| Tailwind | tailwind.config.cjs + design-system tokens | Styling |
| TypeScript | tsconfig.json (strict, ES2022) | Type checking |
| Cargo test | built-in | Rust unit/integration tests |

No ESLint, Prettier, rustfmt, or Clippy config files detected at project root.

## Runtime Modes

Vite supports two runtime modes via `VITE_RUNTIME_MODE`:
- `desktop` (default) — runs inside Tauri webview
- `web` — standalone SPA with API proxy to backend
