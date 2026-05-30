# Docker Deployment

## Overview

MaDao supports a dedicated Docker mode for browser-based access. The stack includes:

- `daemon` — Rust backend service
- `web` — static React frontend served by nginx

The frontend calls the backend through the same origin, so only one HTTP port needs to be exposed.

## Quick Start

```bash
cp .env.docker.example .env
docker compose up -d --build
```

Then open:

```text
http://127.0.0.1:8080
```

If you changed `MADAO_WEB_PORT`, use that port instead.

## Use Prebuilt Docker Hub Images

Pull published images instead of building locally:

```bash
cp .env.docker.example .env
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

Default images: `netcookies/madao-daemon:latest` and `netcookies/madao-web:latest` (multi-arch: `linux/amd64` + `linux/arm64`).

To pin a specific release:

```dotenv
MADAO_IMAGE_NAMESPACE=netcookies
MADAO_IMAGE_TAG=0.2.0
```

`MADAO_IMAGE_TAG` uses the Docker image tag without the leading `v`.

## Environment Variables

```dotenv
MADAO_WEB_PORT=8080              # Host port for web console
MADAO_DAEMON_HTTP_PORT=7822      # Host port for direct daemon HTTP access
MADAO_HTTP_SECRET=               # Overrides persisted secret (empty = use persisted)
MADAO_IMAGE_NAMESPACE=netcookies # Docker Hub namespace (prod compose only)
MADAO_IMAGE_TAG=latest           # Docker image tag (prod compose only)
```

Example — change the web port:

```dotenv
MADAO_WEB_PORT=18080
```

Then access at `http://127.0.0.1:18080`.

## What Docker Mode Changes

- Backend HTTP bind: `0.0.0.0:7822`
- Runtime config directory: `/var/lib/madao`
- Frontend runs in `web` mode (Tauri-only capabilities downgraded gracefully)
- Web console requires HTTP secret login
- Protected routes rely on authenticated session cookie
- HTTP port changes take effect after daemon restart

## Persistent Data

Runtime data is stored in the named volume `madao-data`:

- `config.toml`, `providers/`, runtime settings, runtime state, option cache, routing plans

```bash
docker volume inspect madao_madao-data   # Inspect volume
docker compose exec daemon sh            # Shell into container
```

Runtime files live under `/var/lib/madao`.

## Upgrades

```bash
docker compose up -d --build                          # Local build
docker compose -f docker-compose.prod.yml pull        # Prebuilt images
docker compose -f docker-compose.prod.yml up -d
```

Named volume is preserved — runtime data is not lost.

## Reset

```bash
docker compose down -v    # Remove containers and delete persistent volume
```

## Backup and Restore

```bash
docker compose exec daemon sh -lc 'tar -czf /tmp/madao-backup.tar.gz -C /var/lib madao'
docker compose cp daemon:/tmp/madao-backup.tar.gz ./madao-backup.tar.gz
```

Restore by recreating the volume and extracting the archive back into `/var/lib`.

## Common Commands

| Action | Command |
|--------|---------|
| Start | `docker compose up -d` |
| Rebuild | `docker compose up -d --build` |
| All logs | `docker compose logs -f` |
| Daemon logs | `docker compose logs -f daemon` |
| Web logs | `docker compose logs -f web` |
| Stop | `docker compose down` |
| Stop + delete data | `docker compose down -v` |
| Restart daemon | `docker compose restart daemon` |
| Restart web | `docker compose restart web` |

## Troubleshooting

If `http://127.0.0.1:8080` does not open:

```bash
docker compose ps                        # Check service status
curl http://127.0.0.1:8080/health        # Check backend health
docker compose logs --tail=100 daemon    # Read daemon logs
docker compose logs --tail=100 web       # Read web logs
```

If the port is occupied, change `MADAO_WEB_PORT` in `.env` and restart.

## Browser Mode Notes

The web UI is the same console used by the desktop app. In browser mode:

- Provider management, routing, logs, settings, prices, and activation flows remain available
- Desktop-only operations (e.g., opening local config folder) are disabled
- Layout includes small-screen adjustments, but primary target is desktop-class browsers
- Tauri menu events and native window actions are not available

## Verification

After startup:

```bash
curl http://127.0.0.1:8080/health
curl http://127.0.0.1:8080/api/provider-manifests
```
