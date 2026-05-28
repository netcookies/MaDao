#[cfg(unix)]
use anyhow::Context;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::routing::{get, post};
use axum::{Json, Router, response::IntoResponse};
use parking_lot::RwLock;
use serde::Serialize;
use sms_core::config::ServerConfig;
use sms_core::models::{
    AcquireCodeRequest, HttpAuthLoginRequest, HttpAuthStatus, NotificationFeed,
    OpenAiSmsRegionsCache, OptionCacheOverview, PollCodeRequest, ProviderManifestList,
    ProviderOperatorsQuery, ProviderPriceQuery, ProviderReorderRequest, ProviderServicesQuery,
    ReleaseCodeRequest, RemoteStatsSummaryQuery, RemoteStatsSummaryResponse,
    ReusePoolClearResponse, RoutingFailoverRequest, RoutingPlan, RoutingPlanList,
    RoutingReplaceRequest, RuntimeAccessInfo, RuntimeSettings, RuntimeSettingsUpdate,
    RuntimeSnapshot, StatsSyncResult, TicketCallbackRegistrationRequest, TicketListResponse,
};
use sms_core::service::SmsService;
#[cfg(unix)]
use sms_core::socket_api::SocketCommand;
use std::net::SocketAddr;
use std::path::Path as FsPath;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
#[cfg(unix)]
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpListener;
#[cfg(unix)]
use tokio::net::UnixListener;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;

#[derive(Clone)]
pub struct ApiState {
    pub service: Arc<SmsService>,
    pub http_secret: Option<String>,
    pub sessions: Arc<RwLock<Vec<String>>>,
    pub session_counter: Arc<AtomicU64>,
}

#[derive(Debug, Serialize)]
pub struct ApiError {
    pub message: String,
}

const SESSION_COOKIE_NAME: &str = "madao_http_session";

#[cfg(unix)]
fn wrap_socket_result<T: serde::Serialize>(result: Result<T, sms_core::error::SmsError>) -> String {
    match result {
        Ok(value) => serde_json::json!({
            "status": "ok",
            "data": value
        })
        .to_string(),
        Err(error) => serde_json::json!({
            "status": "error",
            "message": error.to_string()
        })
        .to_string(),
    }
}

#[cfg(unix)]
fn wrap_socket_plain_result<T: serde::Serialize>(
    result: Result<T, sms_core::error::SmsError>,
) -> String {
    wrap_socket_result(result)
}

#[cfg(unix)]
async fn handle_socket_command(service: &SmsService, line: &str) -> String {
    if let Ok(command) = serde_json::from_str::<SocketCommand>(line) {
        return match command {
            SocketCommand::Ping => serde_json::json!({
                "status": "ok",
                "data": { "status": "pong" }
            })
            .to_string(),
            SocketCommand::Snapshot => wrap_socket_plain_result(Ok(service.runtime_snapshot())),
            SocketCommand::Acquire { request } => {
                wrap_socket_result(service.acquire_code(request).await)
            }
            SocketCommand::Poll { request } => wrap_socket_result(service.poll_code(request).await),
            SocketCommand::Release { request } => {
                wrap_socket_result(service.release_code(request).await)
            }
            SocketCommand::RoutingReplace { request } => {
                wrap_socket_result(service.replace_routing_attempt(request).await)
            }
            SocketCommand::RoutingFailover { request } => {
                wrap_socket_result(service.failover_routing_attempt(request).await)
            }
            SocketCommand::Balance { provider } => {
                wrap_socket_result(service.get_balance(&provider).await)
            }
            SocketCommand::Prices { request } => {
                wrap_socket_result(service.get_prices(request).await)
            }
            SocketCommand::ProviderManifests => {
                wrap_socket_plain_result(Ok(service.list_provider_manifests()))
            }
            SocketCommand::RoutingPlans => {
                wrap_socket_plain_result(Ok(service.list_routing_plans()))
            }
            SocketCommand::RoutingPlan { plan_id } => {
                wrap_socket_plain_result(service.routing_plan(&plan_id))
            }
            SocketCommand::SaveRoutingPlan { plan } => {
                wrap_socket_plain_result(service.save_routing_plan(plan))
            }
            SocketCommand::DeleteRoutingPlan { plan_id } => {
                wrap_socket_plain_result(service.delete_routing_plan(&plan_id))
            }
            SocketCommand::ProviderManifest { provider } => {
                wrap_socket_plain_result(service.provider_manifest(&provider))
            }
            SocketCommand::SaveProviderManifest { provider, manifest } => {
                wrap_socket_plain_result(service.save_provider_manifest(&provider, manifest).await)
            }
            SocketCommand::ReloadProviders => {
                wrap_socket_plain_result(service.reload_provider_registry())
            }
            SocketCommand::RuntimeSettings => {
                wrap_socket_plain_result(Ok(service.runtime_settings()))
            }
            SocketCommand::UpdateRuntimeSettings { request } => {
                wrap_socket_plain_result(service.update_runtime_settings(request))
            }
            SocketCommand::RegenerateHttpSecret => {
                wrap_socket_plain_result(service.regenerate_http_secret())
            }
            SocketCommand::RuntimeAccessInfo => {
                wrap_socket_plain_result(Ok(service.runtime_access_info(None)))
            }
            SocketCommand::SyncTicketStats => wrap_socket_result(service.sync_ticket_stats().await),
            SocketCommand::RemoteStatsSummary { query } => {
                wrap_socket_result(service.fetch_remote_stats_summary(query).await)
            }
            SocketCommand::OpenAiSmsRegions => {
                wrap_socket_result(Ok(service.get_openai_sms_regions_cache().await))
            }
            SocketCommand::OptionCacheOverview => {
                wrap_socket_plain_result(Ok(service.option_cache_overview()))
            }
            SocketCommand::Notifications => {
                wrap_socket_plain_result(Ok(service.notification_feed()))
            }
            SocketCommand::ClearNotifications => {
                service.clear_logs();
                wrap_socket_plain_result(Ok(service.notification_feed()))
            }
            SocketCommand::ProviderCountries { provider } => {
                wrap_socket_result(service.list_provider_countries(&provider).await)
            }
            SocketCommand::ProviderServices { provider, request } => {
                wrap_socket_result(service.list_provider_services(&provider, request).await)
            }
            SocketCommand::ProviderOperators { provider, request } => {
                wrap_socket_result(service.list_provider_operators(&provider, request).await)
            }
            SocketCommand::RefreshProviderOptions { provider } => {
                wrap_socket_result(service.refresh_provider_options(&provider).await)
            }
            SocketCommand::ProviderOptionsCache { provider } => {
                wrap_socket_plain_result(service.provider_cached_options(&provider))
            }
            SocketCommand::ClearProviderReusePool { provider } => {
                wrap_socket_plain_result(service.clear_provider_reuse_pool(&provider))
            }
            SocketCommand::ReorderProviders { request } => {
                wrap_socket_plain_result(service.reorder_providers(request))
            }
        };
    }

    let snapshot = service.runtime_snapshot();
    match line.trim() {
        "ping" => serde_json::json!({
            "status": "ok",
            "data": { "status": "pong" }
        })
        .to_string(),
        "snapshot" => wrap_socket_plain_result(Ok(snapshot)),
        other => serde_json::json!({
            "status": "error",
            "message": format!("unknown socket command: {other}")
        })
        .to_string(),
    }
}

fn extract_session_id(headers: &HeaderMap) -> Option<String> {
    let cookie_header = headers.get(header::COOKIE)?.to_str().ok()?;
    cookie_header
        .split(';')
        .filter_map(|segment| {
            let mut parts = segment.trim().splitn(2, '=');
            let key = parts.next()?.trim();
            let value = parts.next()?.trim();
            Some((key, value))
        })
        .find(|(key, _)| *key == SESSION_COOKIE_NAME)
        .map(|(_, value)| value.to_string())
}

fn build_session_cookie(session_id: &str) -> HeaderValue {
    HeaderValue::from_str(&format!(
        "{SESSION_COOKIE_NAME}={session_id}; Path=/; HttpOnly; SameSite=Lax"
    ))
    .expect("valid session cookie")
}

fn is_secret_authorized(state: &ApiState, headers: &HeaderMap) -> bool {
    let Some(value) = headers.get(header::AUTHORIZATION) else {
        return false;
    };
    let Ok(raw) = value.to_str() else {
        return false;
    };
    let secret = state
        .service
        .effective_http_secret(state.http_secret.as_deref());
    raw.strip_prefix("Bearer ")
        .map(str::trim)
        .map(|candidate| candidate == secret)
        .unwrap_or(false)
}

fn is_http_authenticated(state: &ApiState, headers: &HeaderMap) -> bool {
    if is_secret_authorized(state, headers) {
        return true;
    }
    extract_session_id(headers)
        .map(|session_id| state.sessions.read().iter().any(|item| item == &session_id))
        .unwrap_or(false)
}

fn ensure_http_authenticated(
    state: &ApiState,
    headers: &HeaderMap,
) -> Result<(), (StatusCode, Json<ApiError>)> {
    if is_http_authenticated(state, headers) {
        Ok(())
    } else {
        Err((
            StatusCode::UNAUTHORIZED,
            Json(ApiError {
                message: "authentication required".to_string(),
            }),
        ))
    }
}

pub fn build_router(service: Arc<SmsService>, http_secret: Option<String>) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/auth/status", get(http_auth_status))
        .route("/auth/check", get(http_auth_check))
        .route("/auth/login", post(http_auth_login))
        .route("/auth/logout", post(http_auth_logout))
        .route("/api/access-info", get(get_runtime_access_info))
        .route("/api/providers", get(list_runtime))
        .route("/api/provider-manifests", get(list_provider_manifests))
        .route(
            "/api/provider-manifests/reload",
            post(reload_provider_manifests),
        )
        .route("/api/providers/reorder", post(reorder_providers))
        .route(
            "/api/routing-plans",
            get(list_routing_plans).post(save_routing_plan),
        )
        .route(
            "/api/routing-plans/{plan_id}",
            get(get_routing_plan).delete(delete_routing_plan),
        )
        .route(
            "/api/notifications",
            get(get_notifications).post(clear_notifications),
        )
        .route("/api/tickets", get(list_tickets))
        .route("/api/tickets/{ticket_id}", get(get_ticket))
        .route(
            "/api/tickets/{ticket_id}/callbacks",
            get(list_ticket_callbacks).post(register_ticket_callback),
        )
        .route(
            "/api/settings/runtime",
            get(get_runtime_settings).post(update_runtime_settings),
        )
        .route(
            "/api/settings/runtime/regenerate-secret",
            post(regenerate_http_secret),
        )
        .route("/api/settings/stats/sync", post(sync_ticket_stats))
        .route(
            "/api/settings/stats/summary",
            post(get_remote_stats_summary),
        )
        .route(
            "/api/settings/openai-sms-regions",
            get(get_openai_sms_regions),
        )
        .route("/api/settings/option-cache", get(get_option_cache_overview))
        .route("/api/acquire", post(acquire_code))
        .route("/api/poll", post(poll_code))
        .route("/api/release", post(release_code))
        .route("/api/routing/replace", post(replace_routing))
        .route("/api/routing/failover", post(failover_routing))
        .route("/api/providers/{provider}/balance", get(get_balance))
        .route("/api/providers/{provider}/prices", post(get_prices))
        .route(
            "/api/providers/{provider}/refresh-options",
            post(refresh_provider_options),
        )
        .route(
            "/api/providers/{provider}/options-cache",
            get(get_provider_options_cache),
        )
        .route(
            "/api/providers/{provider}/reuse-pool",
            post(clear_provider_reuse_pool),
        )
        .route(
            "/api/providers/{provider}/countries",
            get(get_provider_countries),
        )
        .route(
            "/api/providers/{provider}/services",
            post(get_provider_services),
        )
        .route(
            "/api/providers/{provider}/operators",
            post(get_provider_operators),
        )
        .route(
            "/api/providers/{provider}/manifest",
            get(get_manifest).put(put_manifest),
        )
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(ApiState {
            service,
            http_secret,
            sessions: Arc::new(RwLock::new(Vec::new())),
            session_counter: Arc::new(AtomicU64::new(1)),
        })
}

pub async fn serve_http(service: Arc<SmsService>, bind: &str) -> anyhow::Result<()> {
    let listener = TcpListener::bind(bind).await?;
    axum::serve(listener, build_router(service, None)).await?;
    Ok(())
}

pub async fn spawn_http_server(
    service: Arc<SmsService>,
    config: &ServerConfig,
    http_secret: Option<String>,
) -> anyhow::Result<(SocketAddr, tokio::task::JoinHandle<()>)> {
    let listener = TcpListener::bind(&config.http_bind).await?;
    let local_addr = listener.local_addr()?;
    let router = build_router(service, http_secret);
    let handle = tokio::spawn(async move {
        if let Err(error) = axum::serve(listener, router).await {
            eprintln!("embedded http server failed: {error}");
        }
    });
    Ok((local_addr, handle))
}

#[cfg(unix)]
pub async fn spawn_socket_server(
    service: Arc<SmsService>,
    socket_path: &FsPath,
) -> anyhow::Result<()> {
    if socket_path.exists() {
        let _ = std::fs::remove_file(socket_path);
    }
    let unix_listener = UnixListener::bind(socket_path)
        .with_context(|| format!("bind unix socket failed: {}", socket_path.display()))?;

    tokio::spawn(async move {
        loop {
            let Ok((stream, _addr)) = unix_listener.accept().await else {
                break;
            };
            let service = Arc::clone(&service);
            tokio::spawn(async move {
                let (reader, mut writer) = stream.into_split();
                let mut lines = BufReader::new(reader).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    let payload = handle_socket_command(&service, &line).await;
                    let _ = writer.write_all(payload.as_bytes()).await;
                    let _ = writer.write_all(b"\n").await;
                }
            });
        }
    });

    Ok(())
}

#[cfg(not(unix))]
pub async fn spawn_socket_server(
    _service: Arc<SmsService>,
    _socket_path: &FsPath,
) -> anyhow::Result<()> {
    Ok(())
}

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "status": "ok"
    }))
}

async fn get_runtime_access_info(State(state): State<ApiState>) -> Json<RuntimeAccessInfo> {
    Json(
        state
            .service
            .runtime_access_info(state.http_secret.as_deref()),
    )
}

async fn http_auth_status(
    State(state): State<ApiState>,
    headers: HeaderMap,
) -> Json<HttpAuthStatus> {
    Json(HttpAuthStatus {
        authenticated: is_http_authenticated(&state, &headers),
    })
}

async fn http_auth_check(State(state): State<ApiState>, headers: HeaderMap) -> impl IntoResponse {
    if is_http_authenticated(&state, &headers) {
        StatusCode::NO_CONTENT.into_response()
    } else {
        (
            StatusCode::UNAUTHORIZED,
            Json(ApiError {
                message: "authentication required".to_string(),
            }),
        )
            .into_response()
    }
}

async fn http_auth_login(
    State(state): State<ApiState>,
    Json(request): Json<HttpAuthLoginRequest>,
) -> impl IntoResponse {
    let expected_secret = state
        .service
        .effective_http_secret(state.http_secret.as_deref());
    if request.secret != expected_secret {
        return (
            StatusCode::UNAUTHORIZED,
            Json(ApiError {
                message: "invalid secret".to_string(),
            }),
        )
            .into_response();
    }

    let session_id = format!(
        "{}-{}",
        state.session_counter.fetch_add(1, Ordering::Relaxed),
        uuid::Uuid::now_v7().simple()
    );
    state.sessions.write().push(session_id.clone());
    let cookie = build_session_cookie(&session_id);

    let mut headers = HeaderMap::new();
    headers.insert(header::SET_COOKIE, cookie);
    (
        StatusCode::OK,
        headers,
        Json(HttpAuthStatus {
            authenticated: true,
        }),
    )
        .into_response()
}

async fn http_auth_logout(State(state): State<ApiState>, headers: HeaderMap) -> impl IntoResponse {
    if let Some(session_id) = extract_session_id(&headers) {
        state.sessions.write().retain(|item| item != &session_id);
    }

    let mut response_headers = HeaderMap::new();
    response_headers.insert(
        header::SET_COOKIE,
        HeaderValue::from_static("madao_http_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"),
    );
    (
        StatusCode::OK,
        response_headers,
        Json(HttpAuthStatus {
            authenticated: false,
        }),
    )
        .into_response()
}

async fn list_runtime(
    State(state): State<ApiState>,
    headers: HeaderMap,
) -> Result<Json<RuntimeSnapshot>, (StatusCode, Json<ApiError>)> {
    ensure_http_authenticated(&state, &headers)?;
    state
        .service
        .log_http_access("GET", "/api/providers", "200");
    Ok(Json(state.service.runtime_snapshot()))
}

async fn list_provider_manifests(
    State(state): State<ApiState>,
    headers: HeaderMap,
) -> Result<Json<ProviderManifestList>, (StatusCode, Json<ApiError>)> {
    ensure_http_authenticated(&state, &headers)?;
    state
        .service
        .log_http_access("GET", "/api/provider-manifests", "200");
    Ok(Json(state.service.list_provider_manifests()))
}

async fn get_notifications(
    State(state): State<ApiState>,
    headers: HeaderMap,
) -> Result<Json<NotificationFeed>, (StatusCode, Json<ApiError>)> {
    ensure_http_authenticated(&state, &headers)?;
    state
        .service
        .log_http_access("GET", "/api/notifications", "200");
    Ok(Json(state.service.notification_feed()))
}

async fn clear_notifications(
    State(state): State<ApiState>,
    headers: HeaderMap,
) -> Result<Json<NotificationFeed>, (StatusCode, Json<ApiError>)> {
    ensure_http_authenticated(&state, &headers)?;
    state.service.clear_logs();
    state
        .service
        .log_http_access("POST", "/api/notifications", "200");
    Ok(Json(state.service.notification_feed()))
}

async fn list_tickets(
    State(state): State<ApiState>,
    headers: HeaderMap,
) -> Result<Json<TicketListResponse>, (StatusCode, Json<ApiError>)> {
    ensure_http_authenticated(&state, &headers)?;
    state.service.log_http_access("GET", "/api/tickets", "200");
    Ok(Json(state.service.list_tickets()))
}

async fn get_ticket(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(ticket_id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
    ensure_http_authenticated(&state, &headers)?;
    let result = state
        .service
        .ticket(&ticket_id)
        .map(|value| Json(serde_json::json!(value)))
        .map_err(to_api_error);
    state.service.log_http_access(
        "GET",
        format!("/api/tickets/{ticket_id}"),
        if result.is_ok() { "200" } else { "400" },
    );
    result
}

async fn list_ticket_callbacks(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(ticket_id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
    ensure_http_authenticated(&state, &headers)?;
    let result = state
        .service
        .list_ticket_callbacks(&ticket_id)
        .map(|value| Json(serde_json::json!(value)))
        .map_err(to_api_error);
    state.service.log_http_access(
        "GET",
        format!("/api/tickets/{ticket_id}/callbacks"),
        if result.is_ok() { "200" } else { "400" },
    );
    result
}

async fn register_ticket_callback(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(ticket_id): Path<String>,
    Json(request): Json<TicketCallbackRegistrationRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
    ensure_http_authenticated(&state, &headers)?;
    let result = state
        .service
        .register_ticket_callback(&ticket_id, request)
        .map(|value| Json(serde_json::json!(value)))
        .map_err(to_api_error);
    state.service.log_http_access(
        "POST",
        format!("/api/tickets/{ticket_id}/callbacks"),
        if result.is_ok() { "200" } else { "400" },
    );
    result
}

async fn list_routing_plans(
    State(state): State<ApiState>,
    headers: HeaderMap,
) -> Result<Json<RoutingPlanList>, (StatusCode, Json<ApiError>)> {
    ensure_http_authenticated(&state, &headers)?;
    state
        .service
        .log_http_access("GET", "/api/routing-plans", "200");
    Ok(Json(state.service.list_routing_plans()))
}

async fn get_routing_plan(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(plan_id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
    ensure_http_authenticated(&state, &headers)?;
    let result = state
        .service
        .routing_plan(&plan_id)
        .map(|value| Json(serde_json::json!(value)))
        .map_err(to_api_error);
    state.service.log_http_access(
        "GET",
        format!("/api/routing-plans/{plan_id}"),
        if result.is_ok() { "200" } else { "400" },
    );
    result
}

async fn save_routing_plan(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(plan): Json<RoutingPlan>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
    ensure_http_authenticated(&state, &headers)?;
    let result = state
        .service
        .save_routing_plan(plan)
        .map(|value| Json(serde_json::json!(value)))
        .map_err(to_api_error);
    state.service.log_http_access(
        "POST",
        "/api/routing-plans",
        if result.is_ok() { "200" } else { "400" },
    );
    result
}

async fn delete_routing_plan(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(plan_id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
    ensure_http_authenticated(&state, &headers)?;
    let result = state
        .service
        .delete_routing_plan(&plan_id)
        .map(|value| Json(serde_json::json!(value)))
        .map_err(to_api_error);
    state.service.log_http_access(
        "DELETE",
        format!("/api/routing-plans/{plan_id}"),
        if result.is_ok() { "200" } else { "400" },
    );
    result
}

async fn get_runtime_settings(
    State(state): State<ApiState>,
    headers: HeaderMap,
) -> Result<Json<RuntimeSettings>, (StatusCode, Json<ApiError>)> {
    ensure_http_authenticated(&state, &headers)?;
    state
        .service
        .log_http_access("GET", "/api/settings/runtime", "200");
    Ok(Json(state.service.runtime_settings()))
}

async fn update_runtime_settings(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(update): Json<RuntimeSettingsUpdate>,
) -> Result<Json<RuntimeSettings>, (StatusCode, Json<ApiError>)> {
    ensure_http_authenticated(&state, &headers)?;
    state
        .service
        .log_http_access("POST", "/api/settings/runtime", "200");
    state
        .service
        .update_runtime_settings(update)
        .map(Json)
        .map_err(to_api_error)
}

async fn regenerate_http_secret(
    State(state): State<ApiState>,
    headers: HeaderMap,
) -> Result<Json<RuntimeSettings>, (StatusCode, Json<ApiError>)> {
    ensure_http_authenticated(&state, &headers)?;
    let result = state
        .service
        .regenerate_http_secret()
        .map(Json)
        .map_err(to_api_error);
    state.service.log_http_access(
        "POST",
        "/api/settings/runtime/regenerate-secret",
        if result.is_ok() { "200" } else { "400" },
    );
    result
}

async fn get_openai_sms_regions(
    State(state): State<ApiState>,
    headers: HeaderMap,
) -> Result<Json<OpenAiSmsRegionsCache>, (StatusCode, Json<ApiError>)> {
    ensure_http_authenticated(&state, &headers)?;
    let result = Ok(Json(state.service.get_openai_sms_regions_cache().await));
    state.service.log_http_access(
        "GET",
        "/api/settings/openai-sms-regions",
        if result.is_ok() { "200" } else { "400" },
    );
    result
}

async fn get_option_cache_overview(
    State(state): State<ApiState>,
    headers: HeaderMap,
) -> Result<Json<OptionCacheOverview>, (StatusCode, Json<ApiError>)> {
    ensure_http_authenticated(&state, &headers)?;
    state
        .service
        .log_http_access("GET", "/api/settings/option-cache", "200");
    Ok(Json(state.service.option_cache_overview()))
}

async fn sync_ticket_stats(
    State(state): State<ApiState>,
    headers: HeaderMap,
) -> Result<Json<StatsSyncResult>, (StatusCode, Json<ApiError>)> {
    ensure_http_authenticated(&state, &headers)?;
    let result = state
        .service
        .sync_ticket_stats()
        .await
        .map(Json)
        .map_err(to_api_error);
    state.service.log_http_access(
        "POST",
        "/api/settings/stats/sync",
        if result.is_ok() { "200" } else { "400" },
    );
    result
}

async fn get_remote_stats_summary(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(query): Json<RemoteStatsSummaryQuery>,
) -> Result<Json<RemoteStatsSummaryResponse>, (StatusCode, Json<ApiError>)> {
    ensure_http_authenticated(&state, &headers)?;
    let result = state
        .service
        .fetch_remote_stats_summary(query)
        .await
        .map(Json)
        .map_err(to_api_error);
    state.service.log_http_access(
        "POST",
        "/api/settings/stats/summary",
        if result.is_ok() { "200" } else { "400" },
    );
    result
}

async fn reload_provider_manifests(
    State(state): State<ApiState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
    ensure_http_authenticated(&state, &headers)?;
    let result = state
        .service
        .reload_provider_registry()
        .map(|value| Json(serde_json::json!(value)))
        .map_err(to_api_error);
    state.service.log_http_access(
        "POST",
        "/api/provider-manifests/reload",
        if result.is_ok() { "200" } else { "400" },
    );
    result
}

async fn reorder_providers(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(request): Json<ProviderReorderRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
    ensure_http_authenticated(&state, &headers)?;
    let result = state
        .service
        .reorder_providers(request)
        .map(|value| Json(serde_json::json!(value)))
        .map_err(to_api_error);
    state.service.log_http_access(
        "POST",
        "/api/providers/reorder",
        if result.is_ok() { "200" } else { "400" },
    );
    result
}

async fn acquire_code(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(request): Json<AcquireCodeRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
    ensure_http_authenticated(&state, &headers)?;
    let result = state
        .service
        .acquire_code(request)
        .await
        .map(|value| Json(serde_json::json!(value)))
        .map_err(to_api_error);
    state.service.log_http_access(
        "POST",
        "/api/acquire",
        if result.is_ok() { "200" } else { "400" },
    );
    result
}

async fn poll_code(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(request): Json<PollCodeRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
    ensure_http_authenticated(&state, &headers)?;
    let result = state
        .service
        .poll_code(request)
        .await
        .map(|value| Json(serde_json::json!(value)))
        .map_err(to_api_error);
    state.service.log_http_access(
        "POST",
        "/api/poll",
        if result.is_ok() { "200" } else { "400" },
    );
    result
}

async fn release_code(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(request): Json<ReleaseCodeRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
    ensure_http_authenticated(&state, &headers)?;
    let result = state
        .service
        .release_code(request)
        .await
        .map(|value| Json(serde_json::json!(value)))
        .map_err(to_api_error);
    state.service.log_http_access(
        "POST",
        "/api/release",
        if result.is_ok() { "200" } else { "400" },
    );
    result
}

async fn failover_routing(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(request): Json<RoutingFailoverRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
    ensure_http_authenticated(&state, &headers)?;
    let result = state
        .service
        .failover_routing_attempt(request)
        .await
        .map(|value| Json(serde_json::json!(value)))
        .map_err(to_api_error);
    state.service.log_http_access(
        "POST",
        "/api/routing/failover",
        if result.is_ok() { "200" } else { "400" },
    );
    result
}

async fn replace_routing(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(request): Json<RoutingReplaceRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
    ensure_http_authenticated(&state, &headers)?;
    let result = state
        .service
        .replace_routing_attempt(request)
        .await
        .map(|value| Json(serde_json::json!(value)))
        .map_err(to_api_error);
    state.service.log_http_access(
        "POST",
        "/api/routing/replace",
        if result.is_ok() { "200" } else { "400" },
    );
    result
}

async fn get_balance(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(provider): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
    ensure_http_authenticated(&state, &headers)?;
    let result = state
        .service
        .get_balance(&provider)
        .await
        .map(|value| Json(serde_json::json!(value)))
        .map_err(to_api_error);
    state.service.log_http_access(
        "GET",
        format!("/api/providers/{provider}/balance"),
        if result.is_ok() { "200" } else { "400" },
    );
    result
}

async fn get_prices(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(provider): Path<String>,
    Json(mut request): Json<ProviderPriceQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
    ensure_http_authenticated(&state, &headers)?;
    let provider_for_log = provider.clone();
    request.provider = provider;
    let result = state
        .service
        .get_prices(request)
        .await
        .map(|value| Json(serde_json::json!(value)))
        .map_err(to_api_error);
    state.service.log_http_access(
        "POST",
        format!("/api/providers/{provider_for_log}/prices"),
        if result.is_ok() { "200" } else { "400" },
    );
    result
}

async fn get_provider_countries(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(provider): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
    ensure_http_authenticated(&state, &headers)?;
    let result = state
        .service
        .list_provider_countries(&provider)
        .await
        .map(|value| Json(serde_json::json!(value)))
        .map_err(to_api_error);
    state.service.log_http_access(
        "GET",
        format!("/api/providers/{provider}/countries"),
        if result.is_ok() { "200" } else { "400" },
    );
    result
}

async fn get_provider_services(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(provider): Path<String>,
    Json(query): Json<ProviderServicesQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
    ensure_http_authenticated(&state, &headers)?;
    let result = state
        .service
        .list_provider_services(&provider, query)
        .await
        .map(|value| Json(serde_json::json!(value)))
        .map_err(to_api_error);
    state.service.log_http_access(
        "POST",
        format!("/api/providers/{provider}/services"),
        if result.is_ok() { "200" } else { "400" },
    );
    result
}

async fn refresh_provider_options(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(provider): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
    ensure_http_authenticated(&state, &headers)?;
    let result = state
        .service
        .refresh_provider_options(&provider)
        .await
        .map(|value| Json(serde_json::json!(value)))
        .map_err(to_api_error);
    state.service.log_http_access(
        "POST",
        format!("/api/providers/{provider}/refresh-options"),
        if result.is_ok() { "200" } else { "400" },
    );
    result
}

async fn get_provider_options_cache(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(provider): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
    ensure_http_authenticated(&state, &headers)?;
    let result = state
        .service
        .provider_cached_options(&provider)
        .map(|value| Json(serde_json::json!(value)))
        .map_err(to_api_error);
    state.service.log_http_access(
        "GET",
        format!("/api/providers/{provider}/options-cache"),
        if result.is_ok() { "200" } else { "400" },
    );
    result
}

async fn get_provider_operators(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(provider): Path<String>,
    Json(query): Json<ProviderOperatorsQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
    ensure_http_authenticated(&state, &headers)?;
    let result = state
        .service
        .list_provider_operators(&provider, query)
        .await
        .map(|value| Json(serde_json::json!(value)))
        .map_err(to_api_error);
    state.service.log_http_access(
        "POST",
        format!("/api/providers/{provider}/operators"),
        if result.is_ok() { "200" } else { "400" },
    );
    result
}

async fn get_manifest(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(provider): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
    ensure_http_authenticated(&state, &headers)?;
    let result = state
        .service
        .provider_manifest(&provider)
        .map(|value| Json(serde_json::json!(value)))
        .map_err(to_api_error);
    state.service.log_http_access(
        "GET",
        format!("/api/providers/{provider}/manifest"),
        if result.is_ok() { "200" } else { "400" },
    );
    result
}

async fn put_manifest(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(provider): Path<String>,
    Json(manifest): Json<plugin_sdk::ProviderManifest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
    ensure_http_authenticated(&state, &headers)?;
    let result = match state
        .service
        .save_provider_manifest(&provider, manifest)
        .await
    {
        Ok(value) => Ok(Json(serde_json::json!(value))),
        Err(error) => Err(to_api_error(error)),
    };
    state.service.log_http_access(
        "PUT",
        format!("/api/providers/{provider}/manifest"),
        if result.is_ok() { "200" } else { "400" },
    );
    result
}

async fn clear_provider_reuse_pool(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(provider): Path<String>,
) -> Result<Json<ReusePoolClearResponse>, (StatusCode, Json<ApiError>)> {
    ensure_http_authenticated(&state, &headers)?;
    let result = state
        .service
        .clear_provider_reuse_pool(&provider)
        .map(Json)
        .map_err(to_api_error);
    state.service.log_http_access(
        "POST",
        format!("/api/providers/{provider}/reuse-pool"),
        if result.is_ok() { "200" } else { "400" },
    );
    result
}

fn to_api_error(error: sms_core::error::SmsError) -> (StatusCode, Json<ApiError>) {
    (
        StatusCode::BAD_REQUEST,
        Json(ApiError {
            message: error.to_string(),
        }),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::{Method, Request};
    use serde_json::json;
    use sms_core::registry::ProviderRegistry;
    use sms_core::service::SmsService;
    use std::fs;
    use std::path::PathBuf;
    use tower::util::ServiceExt;
    use uuid::Uuid;

    fn repo_root() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .canonicalize()
            .unwrap()
    }

    fn fixture_provider_dir() -> PathBuf {
        let base = std::env::temp_dir().join(format!("madao-sms-server-test-{}", Uuid::now_v7()));
        fs::create_dir_all(&base).unwrap();
        for name in ["mock.toml", "herosms.toml", "smsbower.toml", "fivesim.toml"] {
            fs::copy(
                repo_root().join("plugins/providers").join(name),
                base.join(name),
            )
            .unwrap();
        }
        base
    }

    fn test_router() -> Router {
        let provider_dir = fixture_provider_dir();
        let registry = ProviderRegistry::load_from_dir(provider_dir).unwrap();
        let service = Arc::new(SmsService::new(registry, 32));
        build_router(service, None)
    }

    fn test_context() -> (Router, String) {
        let provider_dir = fixture_provider_dir();
        let registry = ProviderRegistry::load_from_dir(provider_dir).unwrap();
        let service = Arc::new(SmsService::new(registry, 32));
        let secret = service.runtime_settings().http_secret.clone();
        (build_router(service, None), secret)
    }

    async fn login_cookie(app: &Router, secret: &str) -> String {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/auth/login")
                    .header("content-type", "application/json")
                    .body(Body::from(json!({ "secret": secret }).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        response
            .headers()
            .get("set-cookie")
            .unwrap()
            .to_str()
            .unwrap()
            .to_string()
    }

    #[tokio::test]
    async fn can_save_and_list_routing_plans_over_http() {
        let (app, secret) = test_context();
        let cookie = login_cookie(&app, &secret).await;
        let payload = json!({
            "id": "openai-plan",
            "name": "OpenAI Plan",
            "service": "openai",
            "enabled": true,
            "execution_mode": "sequential",
            "items": [
                {
                    "id": "mock-item",
                    "provider": "mock",
                    "country": "usa",
                    "operator": "",
                    "enabled": true,
                    "price_mode": "fixed",
                    "min_price": 0.1,
                    "max_price": 0.1,
                    "fixed_price": 0.1
                }
            ]
        });

        let save_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/routing-plans")
                    .header("cookie", &cookie)
                    .header("content-type", "application/json")
                    .body(Body::from(payload.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(save_response.status(), StatusCode::OK);

        let list_response = app
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri("/api/routing-plans")
                    .header("cookie", &cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(list_response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn routing_plan_detail_requires_login_over_http() {
        let (app, secret) = test_context();
        let cookie = login_cookie(&app, &secret).await;
        let payload = json!({
            "id": "openai-plan",
            "name": "OpenAI Plan",
            "service": "openai",
            "enabled": true,
            "execution_mode": "sequential",
            "items": [
                {
                    "id": "mock-item",
                    "provider": "mock",
                    "country": "usa",
                    "operator": "",
                    "enabled": true,
                    "price_mode": "fixed",
                    "min_price": 0.1,
                    "max_price": 0.1,
                    "fixed_price": 0.1
                }
            ]
        });

        let save_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/routing-plans")
                    .header("cookie", &cookie)
                    .header("content-type", "application/json")
                    .body(Body::from(payload.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(save_response.status(), StatusCode::OK);

        let unauthorized_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri("/api/routing-plans/openai-plan")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(unauthorized_response.status(), StatusCode::UNAUTHORIZED);

        let detail_response = app
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri("/api/routing-plans/openai-plan")
                    .header("cookie", &cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(detail_response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn acquire_and_failover_work_over_http() {
        let (app, secret) = test_context();
        let cookie = login_cookie(&app, &secret).await;
        let plan = json!({
            "id": "openai-plan",
            "name": "OpenAI Plan",
            "service": "openai",
            "enabled": true,
            "execution_mode": "sequential",
            "items": [
                {
                    "id": "mock-first",
                    "provider": "mock",
                    "country": "usa",
                    "operator": "",
                    "enabled": true,
                    "price_mode": "fixed",
                    "min_price": 0.1,
                    "max_price": 0.1,
                    "fixed_price": 0.1
                },
                {
                    "id": "mock-second",
                    "provider": "mock",
                    "country": "canada",
                    "operator": "",
                    "enabled": true,
                    "price_mode": "any"
                }
            ]
        });

        let save_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/routing-plans")
                    .header("cookie", &cookie)
                    .header("content-type", "application/json")
                    .body(Body::from(plan.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(save_response.status(), StatusCode::OK);

        let acquire_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/acquire")
                    .header("cookie", &cookie)
                    .header("content-type", "application/json")
                    .body(Body::from(
                        json!({
                            "provider": "auto",
                            "routing_plan_id": "openai-plan"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(acquire_response.status(), StatusCode::OK);
        let acquire_body = axum::body::to_bytes(acquire_response.into_body(), usize::MAX)
            .await
            .unwrap();
        let acquire_json: serde_json::Value = serde_json::from_slice(&acquire_body).unwrap();
        let ticket_id = acquire_json
            .pointer("/ticket_id")
            .and_then(serde_json::Value::as_str)
            .unwrap();
        assert_eq!(
            acquire_json
                .pointer("/routing_plan_id")
                .and_then(serde_json::Value::as_str),
            Some("openai-plan")
        );
        assert_eq!(
            acquire_json
                .pointer("/routing_item_id")
                .and_then(serde_json::Value::as_str),
            Some("mock-first")
        );

        let failover_response = app
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/routing/failover")
                    .header("cookie", &cookie)
                    .header("content-type", "application/json")
                    .body(Body::from(
                        json!({
                            "ticket_id": ticket_id,
                            "failed_item_id": "mock-first",
                            "reason": "http integration test"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(failover_response.status(), StatusCode::OK);
        let failover_body = axum::body::to_bytes(failover_response.into_body(), usize::MAX)
            .await
            .unwrap();
        let failover_json: serde_json::Value = serde_json::from_slice(&failover_body).unwrap();
        assert_eq!(
            failover_json
                .pointer("/routing_item_id")
                .and_then(serde_json::Value::as_str),
            Some("mock-second")
        );
    }

    #[tokio::test]
    async fn http_routing_replace_returns_release_and_next_ticket() {
        let (app, secret) = test_context();
        let cookie = login_cookie(&app, &secret).await;

        let plan = json!({
            "id": "openai-plan",
            "name": "OpenAI Plan",
            "service": "openai",
            "enabled": true,
            "execution_mode": "sequential",
            "items": [
                {
                    "id": "mock-first",
                    "provider": "mock",
                    "country": "usa",
                    "operator": "",
                    "enabled": true,
                    "price_mode": "fixed",
                    "min_price": 0.1,
                    "max_price": 0.1,
                    "fixed_price": 0.1
                },
                {
                    "id": "mock-second",
                    "provider": "mock",
                    "country": "canada",
                    "operator": "",
                    "enabled": true,
                    "price_mode": "any"
                }
            ]
        });
        let save_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/routing-plans")
                    .header("cookie", &cookie)
                    .header("content-type", "application/json")
                    .body(Body::from(plan.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(save_response.status(), StatusCode::OK);

        let acquire_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/acquire")
                    .header("cookie", &cookie)
                    .header("content-type", "application/json")
                    .body(Body::from(
                        json!({
                            "provider": "auto",
                            "routing_plan_id": "openai-plan"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(acquire_response.status(), StatusCode::OK);
        let acquire_body = axum::body::to_bytes(acquire_response.into_body(), usize::MAX)
            .await
            .unwrap();
        let acquire_json: serde_json::Value = serde_json::from_slice(&acquire_body).unwrap();
        let ticket_id = acquire_json
            .pointer("/ticket_id")
            .and_then(serde_json::Value::as_str)
            .unwrap();
        let failed_item_id = acquire_json
            .pointer("/routing_item_id")
            .and_then(serde_json::Value::as_str)
            .unwrap();

        let replace_response = app
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/routing/replace")
                    .header("cookie", &cookie)
                    .header("content-type", "application/json")
                    .body(Body::from(
                        json!({
                            "ticket_id": ticket_id,
                            "failed_item_id": failed_item_id,
                            "reason": "http replace integration test",
                            "release_action": "cancel"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(replace_response.status(), StatusCode::OK);
        let replace_body = axum::body::to_bytes(replace_response.into_body(), usize::MAX)
            .await
            .unwrap();
        let replace_json: serde_json::Value = serde_json::from_slice(&replace_body).unwrap();
        assert_eq!(
            replace_json
                .pointer("/current_ticket_id")
                .and_then(serde_json::Value::as_str),
            Some(ticket_id)
        );
        assert_eq!(
            replace_json
                .pointer("/current_ticket_release/status")
                .and_then(serde_json::Value::as_str),
            Some("cancelled")
        );
        assert_eq!(
            replace_json
                .pointer("/next_ticket/routing_item_id")
                .and_then(serde_json::Value::as_str),
            Some("mock-second")
        );
    }

    #[tokio::test]
    async fn disabled_routing_plan_is_rejected_over_http() {
        let (app, secret) = test_context();
        let cookie = login_cookie(&app, &secret).await;
        let plan = json!({
            "id": "disabled-plan",
            "name": "Disabled Plan",
            "service": "openai",
            "enabled": false,
            "execution_mode": "sequential",
            "items": [
                {
                    "id": "mock-item",
                    "provider": "mock",
                    "country": "usa",
                    "operator": "",
                    "enabled": true,
                    "price_mode": "any"
                }
            ]
        });

        let save_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/routing-plans")
                    .header("cookie", &cookie)
                    .header("content-type", "application/json")
                    .body(Body::from(plan.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(save_response.status(), StatusCode::OK);

        let acquire_response = app
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/acquire")
                    .header("cookie", &cookie)
                    .header("content-type", "application/json")
                    .body(Body::from(
                        json!({
                            "provider": "auto",
                            "routing_plan_id": "disabled-plan"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(acquire_response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn provider_option_resource_endpoints_work_over_http() {
        let (app, secret) = test_context();
        let cookie = login_cookie(&app, &secret).await;

        let options_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri("/api/providers/mock/options")
                    .header("cookie", &cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(options_response.status(), StatusCode::NOT_FOUND);

        let countries_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri("/api/providers/mock/countries")
                    .header("cookie", &cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(countries_response.status(), StatusCode::OK);

        let services_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/providers/mock/services")
                    .header("cookie", &cookie)
                    .header("content-type", "application/json")
                    .body(Body::from("{}"))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(services_response.status(), StatusCode::OK);

        let operators_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/providers/mock/operators")
                    .header("cookie", &cookie)
                    .header("content-type", "application/json")
                    .body(Body::from("{}"))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(operators_response.status(), StatusCode::OK);

        let options_cache_response = app
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri("/api/providers/mock/options-cache")
                    .header("cookie", &cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(options_cache_response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn provider_options_cache_endpoint_returns_cached_options_after_refresh() {
        let (app, secret) = test_context();
        let cookie = login_cookie(&app, &secret).await;

        let refresh_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/providers/mock/refresh-options")
                    .header("cookie", &cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(refresh_response.status(), StatusCode::OK);

        let options_cache_response = app
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri("/api/providers/mock/options-cache")
                    .header("cookie", &cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(options_cache_response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn tickets_endpoint_lists_acquired_ticket() {
        let (app, secret) = test_context();
        let cookie = login_cookie(&app, &secret).await;

        let acquire_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/acquire")
                    .header("cookie", &cookie)
                    .header("content-type", "application/json")
                    .body(Body::from(
                        json!({
                            "provider": "mock",
                            "service": "openai",
                            "country": "local"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(acquire_response.status(), StatusCode::OK);

        let tickets_response = app
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri("/api/tickets")
                    .header("cookie", &cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(tickets_response.status(), StatusCode::OK);
        let tickets_body = axum::body::to_bytes(tickets_response.into_body(), usize::MAX)
            .await
            .unwrap();
        let tickets_json: serde_json::Value = serde_json::from_slice(&tickets_body).unwrap();
        assert_eq!(
            tickets_json
                .pointer("/items/0/provider")
                .and_then(serde_json::Value::as_str),
            Some("mock")
        );
    }

    #[tokio::test]
    async fn ticket_detail_and_callback_endpoints_work_over_http() {
        let (app, secret) = test_context();
        let cookie = login_cookie(&app, &secret).await;

        let acquire_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/acquire")
                    .header("cookie", &cookie)
                    .header("content-type", "application/json")
                    .body(Body::from(
                        json!({
                            "provider": "mock",
                            "service": "openai",
                            "country": "local"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(acquire_response.status(), StatusCode::OK);
        let acquire_body = axum::body::to_bytes(acquire_response.into_body(), usize::MAX)
            .await
            .unwrap();
        let acquire_json: serde_json::Value = serde_json::from_slice(&acquire_body).unwrap();
        let ticket_id = acquire_json
            .pointer("/ticket_id")
            .and_then(serde_json::Value::as_str)
            .unwrap();

        let detail_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri(format!("/api/tickets/{ticket_id}"))
                    .header("cookie", &cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(detail_response.status(), StatusCode::OK);

        let register_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri(format!("/api/tickets/{ticket_id}/callbacks"))
                    .header("cookie", &cookie)
                    .header("content-type", "application/json")
                    .body(Body::from(
                        json!({
                            "url": "https://example.com/callback",
                            "secret": "demo"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(register_response.status(), StatusCode::OK);

        let callbacks_response = app
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri(format!("/api/tickets/{ticket_id}/callbacks"))
                    .header("cookie", &cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(callbacks_response.status(), StatusCode::OK);
        let callbacks_body = axum::body::to_bytes(callbacks_response.into_body(), usize::MAX)
            .await
            .unwrap();
        let callbacks_json: serde_json::Value = serde_json::from_slice(&callbacks_body).unwrap();
        assert_eq!(
            callbacks_json
                .pointer("/items/0/url")
                .and_then(serde_json::Value::as_str),
            Some("https://example.com/callback")
        );
    }

    #[tokio::test]
    async fn notifications_endpoint_can_clear_logs() {
        let (app, secret) = test_context();
        let cookie = login_cookie(&app, &secret).await;

        let _ = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri("/api/providers")
                    .header("cookie", &cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        let clear_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/notifications")
                    .header("cookie", &cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(clear_response.status(), StatusCode::OK);

        let clear_body = axum::body::to_bytes(clear_response.into_body(), usize::MAX)
            .await
            .unwrap();
        let clear_json: serde_json::Value = serde_json::from_slice(&clear_body).unwrap();
        let items = clear_json
            .pointer("/items")
            .and_then(serde_json::Value::as_array)
            .unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(
            items[0]
                .pointer("/scope")
                .and_then(serde_json::Value::as_str),
            Some("http")
        );
        assert!(
            items[0]
                .pointer("/message")
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default()
                .contains("POST /api/notifications -> 200")
        );
    }

    #[tokio::test]
    async fn client_http_access_is_written_to_logs() {
        let (app, secret) = test_context();
        let cookie = login_cookie(&app, &secret).await;

        let _ = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri("/api/providers")
                    .header("cookie", &cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        let logs_response = app
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri("/api/providers")
                    .header("cookie", &cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let body = axum::body::to_bytes(logs_response.into_body(), usize::MAX)
            .await
            .unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        let logs = json
            .pointer("/logs")
            .and_then(serde_json::Value::as_array)
            .unwrap();
        assert!(logs.iter().any(|entry| {
            entry.pointer("/scope").and_then(serde_json::Value::as_str) == Some("http")
                && entry
                    .pointer("/message")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or_default()
                    .contains("GET /api/providers -> 200")
        }));
    }

    #[tokio::test]
    async fn protected_api_requires_login() {
        let app = test_router();
        let response = app
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri("/api/provider-manifests")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn auth_status_endpoint_is_public() {
        let app = test_router();
        let response = app
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri("/auth/status")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }
}
