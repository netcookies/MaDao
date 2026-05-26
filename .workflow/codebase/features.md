# MaDao Features & Capabilities

## 1. API Surface

All HTTP endpoints served via Axum (`crates/sms-server/src/lib.rs`). Auth-protected unless noted.

### Authentication

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check (public) |
| GET | `/auth/status` | Check if session is authenticated (public) |
| GET | `/auth/check` | Verify auth requirement status |
| POST | `/auth/login` | Login with HTTP secret |
| POST | `/auth/logout` | Destroy session |

### Core SMS Operations

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/acquire` | Acquire a phone number (handler: `acquire_code`) |
| POST | `/api/poll` | Poll for received SMS code (handler: `poll_code`) |
| POST | `/api/release` | Release/finish/cancel/retry a ticket (handler: `release_code`) |
| POST | `/api/routing/failover` | Trigger routing failover to next plan item (handler: `failover_routing`) |

### Provider Management

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/providers` | List provider runtime summaries (`list_runtime`) |
| GET | `/api/provider-manifests` | List all provider manifests |
| POST | `/api/provider-manifests/reload` | Hot-reload provider registry from disk |
| POST | `/api/providers/reorder` | Reorder provider priority |
| GET | `/api/providers/{provider}/balance` | Get provider balance |
| POST | `/api/providers/{provider}/prices` | Query prices by service/country |
| POST | `/api/providers/{provider}/refresh-options` | Force refresh provider option cache |
| GET | `/api/providers/{provider}/options-cache` | Get cached options for provider |
| POST | `/api/providers/{provider}/reuse-pool` | Clear reuse pool for provider |
| GET | `/api/providers/{provider}/countries` | List available countries |
| POST | `/api/providers/{provider}/services` | List available services (filtered by country/operator) |
| POST | `/api/providers/{provider}/operators` | List available operators (filtered by country) |
| GET | `/api/providers/{provider}/manifest` | Get provider manifest |
| PUT | `/api/providers/{provider}/manifest` | Update provider manifest |

### Routing Plans

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/routing-plans` | List all routing plans |
| POST | `/api/routing-plans` | Create/update a routing plan |
| GET | `/api/routing-plans/{plan_id}` | Get single routing plan |
| DELETE | `/api/routing-plans/{plan_id}` | Delete a routing plan |

### Tickets & Callbacks

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/tickets` | List all ticket records |
| GET | `/api/tickets/{ticket_id}` | Get single ticket |
| GET | `/api/tickets/{ticket_id}/callbacks` | List callback subscriptions for ticket |
| POST | `/api/tickets/{ticket_id}/callbacks` | Register webhook callback for ticket code delivery |

### Settings & Runtime

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/access-info` | Get runtime access info (port, auth requirement) |
| GET | `/api/settings/runtime` | Get runtime settings |
| POST | `/api/settings/runtime` | Update runtime settings |
| POST | `/api/settings/runtime/regenerate-secret` | Regenerate HTTP auth secret |
| GET | `/api/settings/openai-sms-regions` | Get OpenAI SMS region availability cache |
| GET | `/api/settings/option-cache` | Get option cache overview (fresh/stale/missing counts) |

### Notifications

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notifications` | Get notification feed (log entries) |
| POST | `/api/notifications` | Clear notifications |

---

## 2. Core Capabilities

### Provider Management
- TOML-based provider manifests in `plugins/providers/` with hot-reload (`reload_provider_registry`)
- Per-provider enable/disable toggle with `can_enable` validation
- Priority-based ordering (`reorder_providers`)
- Balance querying and caching (`get_balance`, `refresh_all_provider_balances`)
- Dynamic option discovery: countries, services, operators per provider
- Option cache with configurable poll interval and freshness tracking (`OptionCacheState`: Fresh/Stale/Missing)

### Activation Flow (Acquire / Poll / Release)
- `acquire_code`: Requests a phone number from a provider for a given service/country
- `poll_code`: Polls for incoming SMS verification code on an active ticket
- `release_code`: Releases a ticket with action: `Finish`, `Cancel`, `Retry`, or `Ban`
- Ticket lifecycle: `Pending` -> code received -> `Finish`/`Cancel`/`Retry`/`Ban`
- `AcquirePath` variants: `FreshAcquire`, `ExactReuse`, `IntentReuse`, `SameActivationRetry`

### Routing Engine
- Named routing plans with ordered items (provider + country + operator + price constraints)
- Execution modes: `Sequential` (ordered failover) and `Random`
- Multi-round execution (`execution_rounds`)
- Per-item price mode: `Any`, `Range` (min/max), `Fixed`
- Automatic failover via `failover_routing_attempt` — advances to next item in plan
- `routing_plan_id`/`routing_plan_name` tracked on each ticket for traceability

### Reuse Pool
- Phone number reuse across activations (`reuse_phone`, `reuse_key`)
- TTL-based expiry (`DEFAULT_REUSE_TTL_HOURS = 24`)
- Per-provider pool with clear capability (`clear_provider_reuse_pool`)
- Reuse paths: exact match by phone, intent-based match, same-activation retry

### Auto-Release Coordination
- Automatic release scheduling (`auto_release_at` on tickets)
- Retry with backoff (`AUTO_RELEASE_RETRY_INTERVAL_SEC = 5`)
- Owner lease mechanism (`AUTO_RELEASE_OWNER_LEASE_SEC = 15`)
- `maybe_process_pending_releases` background task
- Respects provider `minActivationTime` constraints

### Ticket Callbacks (Webhooks)
- Register webhook URLs per ticket (`register_ticket_callback`)
- Payload includes ticket_id, provider, phone_number, code, message
- Optional HMAC secret for payload verification
- Dispatched via `maybe_dispatch_ticket_callbacks`

### OpenAI SMS Region Awareness
- Fetches OpenAI's dynamic SMS region config from auth bootstrap page
- Caches with 24h TTL (`OPENAI_SMS_REGIONS_CACHE_TTL_HOURS`)
- Filters country/price lists to only show OpenAI-available regions (optional setting)

---

## 3. UI Screens

All screens in `ui/src/app/`. Tauri desktop app + HTTP web mode. i18n via `react-i18next`.

| Screen | File | Purpose |
|--------|------|---------|
| Overview | `overview/OverviewScreen.tsx` | Dashboard with stats (messages sent, active providers, success rate) and recent activity feed |
| Providers List | `providers/ProvidersListScreen.tsx` | Grid of provider cards showing status, protocol, balance, enable/disable toggle, reorder |
| Provider Workspace | `providers/ProviderWorkspaceScreen.tsx` | Per-provider detail: manifest editing, credential config, option cache, reuse pool |
| Routing | `routing/RoutingScreen.tsx` | Routing plan CRUD with drag-and-drop item ordering, per-item provider/country/operator/price config |
| Messages | `messages/MessagesScreen.tsx` | Ticket list with status filters, code display, copy, release actions (finish/cancel/retry), auto-release countdown |
| Logs | `logs/LogsScreen.tsx` | System log viewer with filtering |
| Settings | `settings/SettingsScreen.tsx` | Auto-refresh toggle, language, appearance theme, option cache config, OpenAI SMS filter, HTTP port/secret, update check |
| HTTP Login | `auth/HttpLoginScreen.tsx` | Secret-based login for HTTP remote access mode |

### Modals / Overlays
- `NewActivationModal`: Form to acquire a new number (provider, service, country, price range, routing plan selection)
- `ManifestModal`: Provider manifest JSON editor
- `SearchSelectorModal`: Unified search/select for countries, services, operators, routing plans

---

## 4. Provider Integration

### Supported Providers (via `plugins/providers/*.toml`)

| Provider | ID | Protocol (`kind`) | Description |
|----------|----|--------------------|-------------|
| 5SIM | `fivesim` | `five_sim` | REST API integration with 5sim.net |
| HeroSMS | `herosms` | `handler_api` | handler_api.php style provider |
| SmsBower | `smsbower` | `handler_api` | handler_api.php style provider |
| Mock | `mock` | `mock` | Local development/testing provider |

### Provider Capabilities (from manifests)
- **Balance query**: All providers expose balance
- **Price query**: Per-service/country pricing with stock levels
- **Dynamic options**: Countries, services, operators fetched from upstream
- **Operator selection**: Per-provider (`operator_selectable` flag)
- **Service aliases**: Map common names (e.g., `chatgpt` -> `dr`) to provider-specific codes
- **Cancel cooldown**: Provider-specific cooldown before cancel is allowed (`cancel_cooldown_sec`)
- **Reuse**: Configurable `reuse_phone`, `reuse_max`, `reuse_ttl_hours`
- **Auto-pick country**: Provider can auto-select cheapest/available country

### Protocol Adapters
- `five_sim`: 5SIM REST API adapter
- `handler_api`: Generic handler_api.php protocol (used by HeroSMS, SmsBower, and similar services)
- `mock`: In-memory mock for testing

---

## 5. Socket / Real-time

### Unix Domain Socket API (`crates/sms-core/src/socket_api.rs`)

JSON-over-newline protocol on Unix socket (macOS/Linux only, `#[cfg(unix)]`). Supports all core operations:

| Command | Description |
|---------|-------------|
| `Ping` | Health check (returns "pong") |
| `Snapshot` | Full runtime snapshot (providers, tickets, logs, reuse pool, activity) |
| `Acquire` | Acquire phone number |
| `Poll` | Poll for SMS code |
| `Release` | Release ticket |
| `RoutingFailover` | Trigger routing failover |
| `Balance` | Get provider balance |
| `Prices` | Query prices |
| `ProviderManifests` | List manifests |
| `RoutingPlans` / `RoutingPlan` / `SaveRoutingPlan` / `DeleteRoutingPlan` | Routing plan CRUD |
| `ProviderManifest` / `SaveProviderManifest` | Manifest read/write |
| `ReloadProviders` | Hot-reload provider registry |
| `RuntimeSettings` / `UpdateRuntimeSettings` | Settings read/write |
| `RegenerateHttpSecret` | Regenerate auth secret |
| `OpenAiSmsRegions` | Get OpenAI SMS region cache |
| `OptionCacheOverview` | Cache health overview |
| `Notifications` / `ClearNotifications` | Notification feed |
| `ProviderCountries` / `ProviderServices` / `ProviderOperators` | Dynamic option queries |
| `RefreshProviderOptions` / `ProviderOptionsCache` | Option cache management |
| `ClearProviderReusePool` | Clear reuse pool |
| `ReorderProviders` | Reorder priority |

The socket API mirrors the HTTP API surface and is used by the Tauri desktop app for local IPC (bypassing HTTP auth). The daemon (`apps/daemon/src/main.rs`) spawns both the HTTP server and the Unix socket listener.

### Legacy Text Protocol
The socket also supports a plain-text fallback (`line.trim()` matching) that returns the runtime snapshot as JSON for simple tooling integration.
