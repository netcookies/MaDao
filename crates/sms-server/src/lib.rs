use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Serialize;
use sms_core::config::ServerConfig;
use sms_core::models::{
    AcquireCodeRequest, NotificationFeed, OptionCacheOverview, PollCodeRequest,
    ProviderManifestList, ProviderOperatorsQuery, ProviderPriceQuery, ProviderReorderRequest,
    ProviderServicesQuery, ReleaseCodeRequest, RoutingFailoverRequest, RoutingPlan,
    RoutingPlanList, RuntimeSettings, RuntimeSettingsUpdate, RuntimeSnapshot,
    TicketCallbackRegistrationRequest, TicketListResponse,
};
use sms_core::service::SmsService;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;

#[derive(Clone)]
pub struct ApiState {
    pub service: Arc<SmsService>,
}

#[derive(Debug, Serialize)]
pub struct ApiError {
    pub message: String,
}

pub fn build_router(service: Arc<SmsService>) -> Router {
    Router::new()
        .route("/health", get(health))
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
        .route("/api/settings/option-cache", get(get_option_cache_overview))
        .route("/api/acquire", post(acquire_code))
        .route("/api/poll", post(poll_code))
        .route("/api/release", post(release_code))
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
        .with_state(ApiState { service })
}

pub async fn serve_http(service: Arc<SmsService>, bind: &str) -> anyhow::Result<()> {
    let listener = TcpListener::bind(bind).await?;
    axum::serve(listener, build_router(service)).await?;
    Ok(())
}

pub async fn spawn_http_server(
    service: Arc<SmsService>,
    config: &ServerConfig,
) -> anyhow::Result<(SocketAddr, tokio::task::JoinHandle<()>)> {
    let listener = TcpListener::bind(&config.http_bind).await?;
    let local_addr = listener.local_addr()?;
    let router = build_router(service);
    let handle = tokio::spawn(async move {
        if let Err(error) = axum::serve(listener, router).await {
            eprintln!("embedded http server failed: {error}");
        }
    });
    Ok((local_addr, handle))
}

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "status": "ok"
    }))
}

async fn list_runtime(State(state): State<ApiState>) -> Json<RuntimeSnapshot> {
    state
        .service
        .log_http_access("GET", "/api/providers", "200");
    Json(state.service.runtime_snapshot())
}

async fn list_provider_manifests(State(state): State<ApiState>) -> Json<ProviderManifestList> {
    state
        .service
        .log_http_access("GET", "/api/provider-manifests", "200");
    Json(state.service.list_provider_manifests())
}

async fn get_notifications(State(state): State<ApiState>) -> Json<NotificationFeed> {
    state
        .service
        .log_http_access("GET", "/api/notifications", "200");
    Json(state.service.notification_feed())
}

async fn clear_notifications(State(state): State<ApiState>) -> Json<NotificationFeed> {
    state.service.clear_logs();
    state
        .service
        .log_http_access("POST", "/api/notifications", "200");
    Json(state.service.notification_feed())
}

async fn list_tickets(State(state): State<ApiState>) -> Json<TicketListResponse> {
    state.service.log_http_access("GET", "/api/tickets", "200");
    Json(state.service.list_tickets())
}

async fn get_ticket(
    State(state): State<ApiState>,
    Path(ticket_id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
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
    Path(ticket_id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
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
    Path(ticket_id): Path<String>,
    Json(request): Json<TicketCallbackRegistrationRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
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

async fn list_routing_plans(State(state): State<ApiState>) -> Json<RoutingPlanList> {
    state
        .service
        .log_http_access("GET", "/api/routing-plans", "200");
    Json(state.service.list_routing_plans())
}

async fn get_routing_plan(
    State(state): State<ApiState>,
    Path(plan_id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
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
    Json(plan): Json<RoutingPlan>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
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
    Path(plan_id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
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

async fn get_runtime_settings(State(state): State<ApiState>) -> Json<RuntimeSettings> {
    state
        .service
        .log_http_access("GET", "/api/settings/runtime", "200");
    Json(state.service.runtime_settings())
}

async fn update_runtime_settings(
    State(state): State<ApiState>,
    Json(update): Json<RuntimeSettingsUpdate>,
) -> Json<RuntimeSettings> {
    state
        .service
        .log_http_access("POST", "/api/settings/runtime", "200");
    Json(state.service.update_runtime_settings(update))
}

async fn get_option_cache_overview(State(state): State<ApiState>) -> Json<OptionCacheOverview> {
    state
        .service
        .log_http_access("GET", "/api/settings/option-cache", "200");
    Json(state.service.option_cache_overview())
}

async fn reload_provider_manifests(
    State(state): State<ApiState>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
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
    Json(request): Json<ProviderReorderRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
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
    Json(request): Json<AcquireCodeRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
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
    Json(request): Json<PollCodeRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
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
    Json(request): Json<ReleaseCodeRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
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
    Json(request): Json<RoutingFailoverRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
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

async fn get_balance(
    State(state): State<ApiState>,
    Path(provider): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
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
    Path(provider): Path<String>,
    Json(mut request): Json<ProviderPriceQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
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
    Path(provider): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
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
    Path(provider): Path<String>,
    Json(query): Json<ProviderServicesQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
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
    Path(provider): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
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
    Path(provider): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
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
    Path(provider): Path<String>,
    Json(query): Json<ProviderOperatorsQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
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
    Path(provider): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
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
    Path(provider): Path<String>,
    Json(manifest): Json<plugin_sdk::ProviderManifest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
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
        build_router(service)
    }

    #[tokio::test]
    async fn can_save_and_list_routing_plans_over_http() {
        let app = test_router();
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
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(list_response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn acquire_and_failover_work_over_http() {
        let app = test_router();
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
    async fn disabled_routing_plan_is_rejected_over_http() {
        let app = test_router();
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
        let app = test_router();

        let options_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri("/api/providers/mock/options")
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
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(options_cache_response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn provider_options_cache_endpoint_returns_cached_options_after_refresh() {
        let app = test_router();

        let refresh_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/providers/mock/refresh-options")
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
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(options_cache_response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn tickets_endpoint_lists_acquired_ticket() {
        let app = test_router();

        let acquire_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/acquire")
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
        let app = test_router();

        let acquire_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/acquire")
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
        let app = test_router();

        let _ = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri("/api/providers")
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
        let app = test_router();

        let _ = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri("/api/providers")
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
}
