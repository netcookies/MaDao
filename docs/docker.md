# Docker Deployment

## Overview

MaDao now supports a dedicated Docker mode for browser-based access.

The Docker stack includes:

- `daemon`: Rust backend service
- `web`: static React frontend served by `nginx`

The frontend calls the backend through the same origin, so users only need to expose one HTTP port.

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

## Environment Variables

Current `.env` support:

```dotenv
MADAO_WEB_PORT=8080
MADAO_HTTP_SECRET=
```

This controls the published browser port:

- left side: host port
- right side: container `nginx` port `80`

Example:

```dotenv
MADAO_WEB_PORT=18080
```

Then the UI will be available at:

```text
http://127.0.0.1:18080
```

If `MADAO_HTTP_SECRET` is set, it overrides the persisted secret in `runtime-settings.json`.
If it is empty or unset, the persisted secret is used.

## What Docker Mode Changes

- Backend HTTP bind becomes `0.0.0.0:7822`
- Runtime config directory becomes `/var/lib/madao`
- Frontend runs in `web` mode instead of Tauri desktop mode
- Tauri-only capabilities are downgraded gracefully in the browser
- The web console requires HTTP secret login before the main app page is available
- Protected HTTP routes rely on the authenticated session cookie
- Persisted HTTP port changes take effect after daemon restart

## Persistent Data

Docker mode persists runtime data in the named volume:

```text
madao-data
```

This volume stores:

- generated `config.toml`
- provider manifests under `providers/`
- runtime settings
- runtime state
- option cache
- routing plans

Inspect the volume:

```bash
docker volume inspect madao_madao-data
```

Open a shell in the daemon container:

```bash
docker compose exec daemon sh
```

Runtime files live under:

```text
/var/lib/madao
```

## Upgrades

Pull or edit the latest code, then rebuild:

```bash
docker compose up -d --build
```

This keeps the named volume, so runtime data is preserved.

## Reset

If you want a clean runtime state:

```bash
docker compose down -v
```

This removes the containers and deletes the persistent volume.

## Backup And Restore

Create a backup by copying the runtime directory out of the daemon container:

```bash
docker compose exec daemon sh -lc 'tar -czf /tmp/madao-backup.tar.gz -C /var/lib madao'
docker compose cp daemon:/tmp/madao-backup.tar.gz ./madao-backup.tar.gz
```

Restore by recreating the volume and extracting the archive back into `/var/lib`.

## Common Commands

Start:

```bash
docker compose up -d
```

Rebuild after code changes:

```bash
docker compose up -d --build
```

View logs:

```bash
docker compose logs -f
```

View daemon logs only:

```bash
docker compose logs -f daemon
```

View web logs only:

```bash
docker compose logs -f web
```

Stop:

```bash
docker compose down
```

Stop and remove volume:

```bash
docker compose down -v
```

Restart only the backend:

```bash
docker compose restart daemon
```

Restart only the web container:

```bash
docker compose restart web
```

## Troubleshooting

If `http://127.0.0.1:8080` does not open:

1. Check service status:

```bash
docker compose ps
```

2. Check backend health:

```bash
curl http://127.0.0.1:8080/health
```

3. Read daemon logs:

```bash
docker compose logs --tail=100 daemon
```

4. Read web logs:

```bash
docker compose logs --tail=100 web
```

If the port is occupied, change `.env`:

```dotenv
MADAO_WEB_PORT=18080
```

Then restart:

```bash
docker compose up -d
```

## Browser Mode Notes

The current UI is still the same main console used by the desktop app.

In browser mode:

- provider management, routing, logs, settings, prices, and activation flows remain available
- desktop-only operations such as opening the local config folder are disabled
- layout includes small-screen adjustments, but the primary target is still desktop-class browsers
- Tauri menu events, native window actions, and local shell integrations are not available

## Verification

After startup:

```bash
curl http://127.0.0.1:8080/health
curl http://127.0.0.1:8080/api/provider-manifests
```
