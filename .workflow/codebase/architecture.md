# MaDao Architecture

## Layer Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  UI Layer (ui/)                                             │
│  React + Vite + Tauri IPC / HTTP / Unix Socket              │
└────────────────────────────┬────────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              │ Tauri IPC    │ HTTP REST    │ Unix Socket
              │ (desktop)    │ (web/daemon) │ (desktop macOS/Linux)
              ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────┐
│  Transport Layer (crates/sms-server)                        │
│  axum Router + Unix Socket JSON-RPC                         │
│  ApiState { service: Arc<SmsService>, http_secret, ... }    │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  Core Layer (crates/sms-core)                               │
│  SmsService — orchestration, routing, caching, lifecycle    │
│  ├── ProviderRegistry — manifest discovery + provider pool  │
│  ├── RuntimeConfigRepository — settings & routing plans     │
│  ├── RuntimeStateRepository — tickets, logs, reuse pool     │
│  ├── ReleaseCoordinationRepository — auto-release leasing   │
│  └── ProviderMetadataCacheRepository — option/price cache   │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  Provider Layer (crates/sms-core/src/provider.rs)           │
│  trait SmsProvider: acquire, poll_code, release,            │
│                     get_balance, list_countries/services/ops │
│  Implementations: FiveSimProvider, HandlerApiProvider, Mock │
└─────────────────────────────────────────────────────────────┘
```

## Module Boundaries and Responsibilities

### ui/ (Frontend)

| Concern | Implementation |
|---------|---------------|
| Framework | React 18 + Vite |
| State | Local state in `App.tsx` (~2400 lines monolith component) |
| Transport bridge | `services/runtimeApi.ts` — adaptive dispatch |
| Transport detection | `services/runtimeEnv.ts` — detects Tauri/web/socket |
| Screens | Overview, Providers, Routing, Messages, Logs, Settings |

### src-tauri/ (Desktop Shell)

| Concern | Implementation |
|---------|---------------|
| Runtime | Tauri v2 (Rust backend + webview) |
| Entry | `src/lib.rs` → `run()` |
| Embedded server | Spawns HTTP + Unix Socket servers in-process |
| IPC commands | `desktop_snapshot`, `desktop_acquire_code`, `desktop_poll_code`, `desktop_release_code`, `desktop_http_access_info`, etc. |
| System tray | Menu bar with provider shortcuts, screen navigation |
| Config seeding | Copies default `server.toml` + provider TOML templates on first launch |

### apps/daemon/ (Headless Server)

| Concern | Implementation |
|---------|---------------|
| Entry | `src/main.rs` → `#[tokio::main] async fn main()` |
| Config | Loads `ServerConfig` from TOML, resolves `AppPersistencePaths` |
| Servers | `spawn_http_server` + `spawn_socket_server` |
| Docker mode | Dual HTTP listener (user-configured + internal `0.0.0.0:7822`) |
| Lock | `desktop-runtime-owner.lock` via `fs2::FileExt` for single-instance |

### crates/sms-server (HTTP/Socket API)

| Concern | Implementation |
|---------|---------------|
| Framework | axum 0.7 |
| Router | `build_router()` — 30+ REST endpoints under `/api/` and `/auth/` |
| State | `ApiState { service, http_secret, sessions, session_counter }` |
| Auth | Cookie-based session (`madao_http_session`) with secret login |
| Socket | Unix domain socket, newline-delimited JSON (`SocketCommand` enum) |
| CORS | `CorsLayer::permissive()` |

### crates/sms-core (Domain Logic)

| Module | Responsibility |
|--------|---------------|
| `service.rs` | `SmsService` — central orchestrator, all business logic |
| `registry.rs` | `ProviderRegistry` — discovers TOML manifests, builds providers |
| `provider.rs` | `trait SmsProvider` + concrete implementations |
| `runtime_config.rs` | `RuntimeConfigRepository` — JSON file persistence for settings/routing |
| `runtime_store.rs` | `RuntimeStore` (SQLite/InMemory) — runtime state persistence |
| `models.rs` | All domain types (tickets, routing plans, snapshots, etc.) |
| `options.rs` | Provider option normalization, caching, canonical keys |
| `config.rs` | `ServerConfig` — TOML-based server configuration |
| `socket_api.rs` | `SocketCommand` enum for Unix socket protocol |
| `canonical_data.rs` | Canonical country/service data |
| `smsbower_assets.rs` | SmsBower FAQ integration for icons/metadata |
| `error.rs` | `SmsError` — unified error type |

## Data Flow: Acquire SMS Code

```
UI (NewActivationModal)
  │
  ├─ Desktop macOS/Linux: invoke('desktop_acquire_code', { request })
  │    → Tauri command → service.acquire_code(&request)
  │
  ├─ Desktop macOS/Linux (socket): acquireActivationViaSocket(request)
  │    → Unix socket → SocketCommand::Acquire → service.acquire_code(&request)
  │
  └─ Web/Docker: POST /api/acquire { body: AcquireCodeRequest }
       → axum handler acquire_code() → service.acquire_code(&request)
                                              │
                                              ▼
                                    SmsService::acquire_code()
                                              │
                                    ┌─────────┴─────────┐
                                    │ Routing?          │
                                    │ Yes → resolve     │
                                    │   RoutingPlan     │
                                    │   → iterate items │
                                    │ No → direct       │
                                    └─────────┬─────────┘
                                              │
                                              ▼
                                    ProviderRegistry::get(provider_id)
                                              │
                                              ▼
                                    SmsProvider::acquire(&request)
                                              │
                                              ▼
                                    HTTP call to upstream API
                                    (5sim, handler-api, etc.)
                                              │
                                              ▼
                                    TicketRecord created
                                              │
                                              ▼
                                    RuntimeStoreBatch applied:
                                    - upsert_ticket
                                    - log_entries
                                    - activity_entries
                                              │
                                              ▼
                                    Response → UI
```

## Entry Points

| Entry Point | Path | Runtime | Starts |
|-------------|------|---------|--------|
| Daemon | `apps/daemon/src/main.rs` | tokio async | HTTP server + Unix socket |
| Desktop | `src-tauri/src/lib.rs` → `run()` | Tauri + tokio | HTTP + socket + webview + tray |
| UI | `ui/src/App.tsx` | Browser/Webview | React SPA |

### Daemon Bootstrap Sequence

1. Resolve config path (CLI arg or `~/.config/madao/server.toml`)
2. `ServerConfig::load_from_file()`
3. `ProviderRegistry::load_from_dir()` — scan TOML manifests
4. `AppPersistencePaths::from_config_dir()`
5. Acquire runtime owner lock (`fs2`)
6. Load persisted `RuntimeSettings` (override HTTP port)
7. `SmsService::with_persistence_paths()` — full initialization
8. `spawn_http_server()` + `spawn_socket_server()`
9. (Docker) optionally spawn internal listener on `0.0.0.0:7822`

### Desktop Bootstrap Sequence

1. Tauri `setup()` callback
2. Resolve app config dir (`tauri::api::path`)
3. Seed default config + provider templates if missing
4. Same core init: `ProviderRegistry` → `AppPersistencePaths` → `SmsService`
5. `spawn_http_server()` + `spawn_socket_server()`
6. Register Tauri IPC commands
7. Build system tray menu with provider entries
8. Open main webview window

## Persistence Architecture

### RuntimeStore (runtime_store.rs)

Dual-backend runtime state store:

```
RuntimeStore
├── Sqlite { path: PathBuf }        ← production (daemon + desktop)
└── InMemory { state, release_owner } ← testing
```

**Stored data** (via `RuntimeStoreBatch`):
- `TicketRecord` — active/completed SMS activations
- `LogEntry` — structured log buffer
- `ActivityEntry` — user-visible activity feed
- `ReusePoolEntry` — phone number reuse pool per provider
- `ProviderBalanceCacheEntry` — cached provider balances
- `OpenAiSmsRegionsCache` — OpenAI SMS region availability
- Release coordination leases (`ReleaseOwnerLease`)

**Repository traits**:
- `RuntimeStateRepository` — `load_state()`, `replace_state()`, `apply_batch()`
- `ReleaseCoordinationRepository` — `acquire_release_owner()`, `claim_pending_releases()`, `release_release_owner()`

**Bundled as**: `RuntimeRepositories { state, release_coordination }`

### RuntimeConfigRepository (runtime_config.rs)

JSON file-based configuration persistence:

```
AppPersistencePaths
├── runtime-settings.json     ← RuntimeSettings (http_port, http_secret, preferences)
├── runtime.db                ← SQLite (RuntimeStore)
├── provider-options-cache.json ← ProviderOptionCacheStore
├── provider-options-raw.json   ← ProviderRawOptionAuditStore
└── routing-plans.json          ← RoutingPlanStore
```

**Trait**: `RuntimeConfigRepository`
- `load_state()` → `RuntimeConfigState { settings, routing_plans }`
- `save_settings(&RuntimeSettings)`
- `save_routing_plans(&RoutingPlanStore)`
- `ensure_settings_persisted(&RuntimeSettings)`

**Implementation**: `FileRuntimeConfigRepository` — reads/writes JSON files at configured paths.

### ProviderMetadataCacheRepository (options.rs)

- `FileProviderMetadataCacheRepository` — persists option cache + raw audit to JSON files
- Loaded at startup, normalized against current provider manifests

## Key Abstractions

### SmsService

Central orchestrator. Holds all state behind `RwLock`s:

```rust
pub struct SmsService {
    registry: Arc<RwLock<ProviderRegistry>>,
    tickets: RwLock<BTreeMap<String, TicketRecord>>,
    logs: RwLock<VecDeque<LogEntry>>,
    activity: RwLock<VecDeque<ActivityEntry>>,
    runtime_settings: RwLock<RuntimeSettings>,
    runtime_config_repository: Arc<dyn RuntimeConfigRepository>,
    runtime_state_repository: Arc<dyn RuntimeStateRepository>,
    release_coordination_repository: Arc<dyn ReleaseCoordinationRepository>,
    provider_metadata_cache_repository: Arc<dyn ProviderMetadataCacheRepository>,
    routing_plans: RwLock<RoutingPlanStore>,
    provider_option_cache: RwLock<ProviderOptionCacheStore>,
    provider_raw_option_audit: RwLock<ProviderRawOptionAuditStore>,
    provider_balance_cache: RwLock<BTreeMap<String, ProviderBalanceCacheEntry>>,
    reuse_pool: RwLock<HashMap<String, Vec<ReusePoolEntry>>>,
    callback_subscriptions: RwLock<BTreeMap<String, Vec<TicketCallbackSubscription>>>,
    // ...
}
```

Constructors:
- `SmsService::new(registry, log_buffer)` — in-memory only (tests)
- `SmsService::with_persistence_paths(registry, log_buffer, settings_path, db_path, options_path, raw_path, routing_path)` — full persistence
- `SmsService::with_runtime_repositories(...)` — dependency-injected (internal)

### RuntimeStore

```rust
pub struct RuntimeStore { backend: Arc<RuntimeStoreBackend> }

impl RuntimeStore {
    pub fn open(path: impl Into<PathBuf>) -> Result<Self, SmsError>;  // SQLite
    pub fn in_memory() -> Self;                                        // Testing
    pub fn repositories(self) -> RuntimeRepositories;                  // Split into traits
}
```

### ProviderRegistry

```rust
pub struct ProviderRegistry {
    manifest_store: ProviderManifestStore,
    providers: BTreeMap<String, Arc<dyn SmsProvider>>,
    manifests: BTreeMap<String, ProviderManifest>,
}

impl ProviderRegistry {
    pub fn load_from_dir(path: impl AsRef<Path>) -> Result<Self, SmsError>;
    pub fn get(&self, id: &str) -> Result<Arc<dyn SmsProvider>, SmsError>;
    pub fn list_manifests_by_priority(&self) -> Vec<ProviderManifest>;
    pub fn reload(&mut self) -> Result<(), SmsError>;
    pub fn save_manifest(&mut self, id: &str, manifest: &ProviderManifest) -> Result<(), SmsError>;
}
```

Provider discovery: scans a directory for `*.toml` files, parses each as `ProviderManifest`, builds the corresponding `SmsProvider` implementation.

### SmsProvider Trait

```rust
#[async_trait]
pub trait SmsProvider: Send + Sync {
    fn manifest(&self) -> &ProviderManifest;
    async fn acquire(&self, request: &AcquireCodeRequest) -> Result<TicketRecord, SmsError>;
    async fn poll_code(&self, ticket: &TicketRecord) -> Result<PollCodeResponse, SmsError>;
    async fn release(&self, request: &ReleaseCodeRequest, ticket: &TicketRecord) -> Result<ReleaseCodeResponse, SmsError>;
    async fn get_balance(&self) -> Result<ProviderBalance, SmsError>;
    async fn get_prices(&self, query: &ProviderPriceQuery) -> Result<Vec<ProviderPriceItem>, SmsError>;
    async fn list_countries(&self) -> Result<Vec<OptionItem>, SmsError>;
    async fn list_services(&self, query: &ProviderServicesQuery) -> Result<Vec<OptionItem>, SmsError>;
    async fn list_operators(&self, query: &ProviderOperatorsQuery) -> Result<Vec<OptionItem>, SmsError>;
}
```

Implementations:
- `FiveSimProvider` — 5sim.net API
- `HandlerApiProvider` — generic handler-api protocol (sms-activate, etc.)
- `MockProvider` — deterministic mock for testing

### UI Transport Bridge (runtimeApi.ts)

Adaptive dispatch based on runtime detection:

```
USE_SOCKET_TRANSPORT (macOS/Linux desktop)
  → socketClientApi.ts → Unix socket JSON-RPC

IS_DESKTOP_RUNTIME && !USE_SOCKET_TRANSPORT (Windows desktop)
  → @tauri-apps/api/core invoke() → Tauri IPC commands

IS_WEB_RUNTIME (browser / Docker web UI)
  → fetch() → HTTP REST API
```
