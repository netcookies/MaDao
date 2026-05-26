# Cross-Cutting Concerns

## 1. Error Handling

### Core Error Type

`SmsError` (`crates/sms-core/src/error.rs`) — flat enum via `thiserror`:

| Variant | Semantics |
|---------|-----------|
| `ProviderNotFound(String)` | Unknown provider ID |
| `ProviderDisabled(String)` | Provider exists but disabled |
| `InvalidRequest(String)` | Client-side validation failure |
| `Upstream(String)` | Remote provider API failure |
| `Io(String)` | File/network I/O |
| `Config(String)` | Config parse/serialize |

### Propagation

- Core crate maps `std::io::Error` and `toml`/`serde_json` errors into `SmsError::Io` / `SmsError::Config` via `.map_err()`.
- Server crate (`sms-server`) wraps into `ApiError { message }` with HTTP status codes (401 for auth, 500 for internal).
- Tauri layer uses `Result<T, String>` for IPC commands.

### UI Error Display

`ui/src/app/providerErrors.ts` — pattern-matches upstream error message substrings (e.g. `NO_FREE_PHONES`, `INSUFFICIENT_BALANCE`, `429`) to i18n translation keys. Falls back to raw message string.

## 2. Logging & Observability

### In-Memory Log Buffer

`SmsService` holds `RwLock<VecDeque<LogEntry>>` with configurable capacity (`log_buffer`, default 500 from `config/server.toml`). Ring-buffer semantics — oldest entries evicted when full.

### LogEntry

```rust
pub struct LogEntry {
    pub timestamp: DateTime<Utc>,
    pub scope: String,
    pub level: String,
    pub message: String,
}
```

### ActivityEntry

Richer structured event with provider/service/country context:

```rust
pub struct ActivityEntry {
    pub id: String,
    pub timestamp: DateTime<Utc>,
    pub kind: ActivityKind,
    pub level: ActivityLevel,
    pub title: String,
    pub detail: Option<String>,
    pub provider: Option<String>,
    pub service: Option<String>,
    pub country: Option<String>,
    pub routing_plan_id: Option<String>,
    pub routing_plan_name: Option<String>,
}
```

### Persistence

Both log and activity entries are persisted via `RuntimeStoreBatch` into SQLite (`runtime.db`). The batch applies atomically with configurable limits (`RuntimeStoreApplyOptions.log_limit`, `activity_limit`).

### No External Logging Framework

The codebase does not use `log::` or `tracing::` crates in `sms-core`. All observability is through the custom `LogEntry`/`ActivityEntry` buffer system exposed via HTTP API.

## 3. Configuration

### Server Config (`config/server.toml`)

```toml
http_bind = "0.0.0.0:7822"
socket_path = "/tmp/madao-sms.sock"
provider_dir = "plugins/providers"
log_buffer = 500
```

Loaded by `ServerConfig::load_from_file()`. Relative paths resolved against config file parent directory.

### Runtime Settings (`runtime-settings.json`)

Persisted per-instance settings:

| Field | Default |
|-------|---------|
| `routing_strategy` | `"ordered_priority"` |
| `auto_fallback` | `true` |
| `option_cache_enabled` | `true` |
| `option_cache_poll_interval_minutes` | `30` |
| `only_show_openai_sms_countries` | `false` |
| `check_updates_on_launch` | `true` |
| `http_port` | `7822` |
| `http_secret` | UUID v7 (auto-generated) |

### Persistence Paths (`AppPersistencePaths`)

All derived from a single config directory:

- `runtime-settings.json` — user preferences + secret
- `runtime.db` — SQLite for tickets, logs, activity, reuse pool
- `provider-options-cache.json` — cached provider product listings
- `provider-options-raw.json` — raw audit of provider responses
- `routing-plans.json` — user-defined routing plans

### Runtime Config Repository

`RuntimeConfigRepository` trait with `FileRuntimeConfigRepository` implementation. Handles load/save of settings and routing plans with graceful fallback to defaults on missing files.

### Provider Manifests

TOML files in `provider_dir`. Each defines: `id`, `name`, `kind`, `enabled`, `priority`, `defaults`, and provider-specific config sections.

## 4. Testing

### Test Patterns

- **Unit tests**: `#[cfg(test)]` modules in `registry.rs`, `provider.rs`, `service.rs`, `options.rs`
- **Integration tests**: `crates/sms-core/tests/` directory with:
  - `capability_truth_tests.rs` — provider capability matrix assertions
  - `reuse_coordinator_tests.rs` — end-to-end reuse/release coordination

### Test Utilities

- `TempDir` for isolated filesystem state
- Mock provider manifests via `mock_manifest_toml()` helper
- `SmsService::with_persistence_paths()` for test construction with SQLite in temp dirs
- JSON fixture files in `tests/fixtures/` for provider response parsing

### Coverage Areas

- Provider capability matrix (per-provider feature support)
- Reuse pool coordination (acquire, release, retry)
- Ticket lifecycle management
- Routing plan normalization
- Provider registry loading

## 5. Security

### HTTP Secret Authentication

Two-layer auth in `sms-server`:

1. **Bearer token**: `Authorization: Bearer <secret>` checked against `effective_http_secret()`
2. **Session-based**: Cookie/header session ID matched against in-memory session list

### Secret Generation

`generate_runtime_secret()` produces UUID v7 (time-ordered, cryptographically random). Auto-generated on first launch if empty. Regeneratable via `regenerate_http_secret` API endpoint.

### Secret Override

Docker deployments can override the persisted secret via environment variable (`state.http_secret`). The `effective_http_secret()` method resolves: env override > persisted value.

### Single Instance (Desktop)

Tauri app uses `fs2` crate (file locking) for single-instance enforcement.

### Access Control

All mutating HTTP endpoints require authentication via `ensure_http_authenticated()`. Unauthenticated requests receive 401.

## 6. Environment

### Runtime Modes

| Mode | Detection | Characteristics |
|------|-----------|-----------------|
| **Docker** | `MADAO_RUNTIME_MODE=docker` env var | Config at `/var/lib/madao`, bind `0.0.0.0:7822`, env-overridable paths |
| **Desktop** | Tauri `__TAURI_INTERNALS__` in window | Config via `ProjectDirs`, socket transport (non-Windows), single-instance lock |
| **Web** | Fallback (no Tauri detected) | API base from `window.location.origin` |

### UI Runtime Detection (`ui/src/services/runtimeEnv.ts`)

Exports:
- `RUNTIME_MODE`: `'desktop'` | `'web'`
- `IS_DESKTOP_RUNTIME` / `IS_WEB_RUNTIME`
- `USE_SOCKET_TRANSPORT`: desktop + non-Windows
- `API_BASE`: resolved from env or defaults
- `SOCKET_PATH`: `/tmp/madao-sms.sock`

### Daemon Config Resolution

Docker mode: `MADAO_CONFIG_DIR` env → `/var/lib/madao` fallback.
Desktop mode: `ProjectDirs::from("com", "madao", "sms")` (platform-specific app config).

### Environment Variables (Docker)

| Variable | Purpose | Default |
|----------|---------|---------|
| `MADAO_RUNTIME_MODE` | Mode detection (`docker`) | — |
| `MADAO_CONFIG_DIR` | Config directory | `/var/lib/madao` |
| `MADAO_HTTP_BIND` | HTTP bind address | `0.0.0.0:7822` |
| `MADAO_SOCKET_PATH` | Unix socket path | `/tmp/madao-sms.sock` |
| `MADAO_HTTP_SECRET` | Override persisted HTTP secret | — (uses persisted UUID v7) |
