# MaDao

<p align="center">
  <strong>A desktop console for internal SMS / OTP workflows, built with Rust, Tauri 2, and React.</strong>
</p>

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./docs/README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="./LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-0f172a.svg"></a>
  <img alt="Rust" src="https://img.shields.io/badge/Rust-stable-f97316.svg">
  <img alt="Tauri 2" src="https://img.shields.io/badge/Tauri-2-24c8db.svg">
  <img alt="React 19" src="https://img.shields.io/badge/React-19-149eca.svg">
</p>

## Overview

MaDao is an internal operations console for teams that need a unified desktop UI around SMS activation, OTP testing, provider manifests, routing plans, and runtime diagnostics.

It is not positioned as a public marketplace client. Instead, it provides a configurable control plane for self-hosted or internal provider integrations.

## Highlights

- Rust workspace split into `plugin-sdk`, `sms-core`, `sms-server`, `apps/daemon`, and `src-tauri`
- Tauri 2 desktop shell with React frontend
- Provider manifests stored in `TOML` and hot-reloaded at runtime
- Compatible provider flows for:
  - `handler_api`
  - `five_sim`
  - local `mock`
- Routing plans, provider balances, price lookup, logs, and activation views
- Manifest-level `ui`, `behavior`, and profile-driven extension points

## Project Structure

```text
.
├── apps/daemon/              # Local HTTP / Unix socket daemon entry
├── crates/
│   ├── plugin-sdk/           # Provider manifest and protocol config models
│   ├── sms-core/             # Domain models, provider trait, service layer
│   └── sms-server/           # Axum HTTP API layer
├── config/server.toml        # Base daemon configuration
├── plugins/providers/        # Default provider manifest templates
├── src-tauri/                # Tauri 2 desktop host
├── ui/                       # React + Vite frontend
└── docs/                     # Architecture, provider, release, and dev docs
```

## Getting Started

### Requirements

- Rust / Cargo
- Node.js
- npm

### Build the frontend

```bash
npm run build
```

### Check the Rust workspace

```bash
cargo check --workspace
```

### Start the daemon

```bash
cargo run -p madao-sms-daemon
```

### Run the Tauri app shell

```bash
cargo run -p madao-tauri
```

## Runtime Notes

By default, the daemon initializes and reads its runtime config from the user config directory instead of writing directly into the repository templates:

- macOS: `~/Library/Application Support/com.madao.sms`
- Linux: `$XDG_CONFIG_HOME/com.madao.sms` or `~/.config/com.madao.sms`

Repository-side `plugins/providers/*.toml` files are templates only. Do not store real provider secrets in them.

Default runtime endpoints:

- HTTP: `127.0.0.1:7822`
- Unix socket: `/tmp/madao-sms.sock`

## Verification

```bash
npm run build
cargo check --workspace
cargo test -p sms-core
```

Quick smoke checks:

```bash
curl http://127.0.0.1:7822/health
curl http://127.0.0.1:7822/api/provider-manifests
```

## Documentation

- [中文文档入口](./docs/README.zh-CN.md)
- [Architecture](./docs/architecture.md)
- [API Integration](./docs/api-integration.md)
- [Provider Compatibility](./docs/providers.md)
- [Routing Plans](./docs/routing-plans.md)
- [Development](./docs/development.md)
- [Release Guide](./docs/release.md)
- [Contributing](./CONTRIBUTING.md)

## License

Released under the [MIT License](./LICENSE).
