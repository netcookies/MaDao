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
- Anonymous usage statistics with Cloudflare Worker + D1 aggregation
- Manifest-level `ui`, `behavior`, and profile-driven extension points

## Project Structure

```text
.
├── apps/daemon/              # Local HTTP / Unix socket daemon entry
├── cloudflare/
│   └── stats-worker/         # Cloudflare Worker + D1 for stats aggregation
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
- Docker / Docker Compose (optional, for web deployment)

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

### One-command Docker deployment

```bash
cp .env.docker.example .env
docker compose up -d --build
```

Open `http://127.0.0.1:8080` after startup.

For operations, upgrades, logs, backup, and troubleshooting, see [Docker Deployment](./docs/docker.md).

If you prefer prebuilt Docker Hub images instead of local builds, use:

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

Published Docker images support both `linux/amd64` and `linux/arm64`.

### Cloudflare Worker (stats aggregation)

The `cloudflare/stats-worker/` directory contains a Cloudflare Worker + D1 service that receives anonymous usage statistics from the app and returns aggregated summaries.

```bash
cd cloudflare/stats-worker
npm install
```

First-time setup:

```bash
npx wrangler login
npx wrangler d1 create madao-stats
```

Copy the returned `database_id` into `wrangler.jsonc`, and set your `API_TOKEN`. The database schema is auto-created on first request.

Local development:

```bash
npm run dev
```

Deploy to Cloudflare:

```bash
npm run deploy
```

See [cloudflare/stats-worker/README.md](./cloudflare/stats-worker/README.md) for full details.

## Runtime Notes

By default, the daemon initializes and reads its runtime config from the user config directory instead of writing directly into the repository templates:

- macOS: `~/Library/Application Support/com.madao.sms`
- Linux: `$XDG_CONFIG_HOME/com.madao.sms` or `~/.config/com.madao.sms`

Repository-side `plugins/providers/*.toml` files are templates only. Do not store real provider secrets in them.

Default runtime endpoints:

- HTTP: `0.0.0.0:7822`
- Unix socket: `/tmp/madao-sms.sock`

Docker mode uses:

- Web UI: `http://127.0.0.1:8080`
- Backend HTTP inside compose: `daemon:7822`
- Runtime config dir inside container: `/var/lib/madao`

In desktop mode, the app UI uses platform-specific local transport:

- macOS / Linux: local Unix socket
- Windows: embedded local HTTP API

The embedded HTTP service still listens on all interfaces for direct external access.

Direct HTTP access is intended for authenticated browser / API usage:

- the web console requires HTTP secret login before loading the main app page
- protected HTTP API routes require the authenticated session
- the HTTP secret is persisted in `runtime-settings.json` and can be regenerated, but not manually edited in the UI

In Docker mode:

- `MADAO_HTTP_SECRET` can override the persisted HTTP secret
- if `MADAO_HTTP_SECRET` is unset, the persisted secret is used
- changing the persisted HTTP port takes effect after daemon restart

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
- [OpenAPI / Swagger UI](./docs/openapi/index.html)
- [Docker Deployment](./docs/docker.md)
- [Cloudflare Stats Worker](./cloudflare/stats-worker/README.md)
- [Release Guide](./docs/release.md)
- [Contributing](./CONTRIBUTING.md)

## License

Released under the [MIT License](./LICENSE).
