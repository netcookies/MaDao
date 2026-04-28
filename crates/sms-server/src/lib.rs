use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Serialize;
use sms_core::models::{
    AcquireCodeRequest, PollCodeRequest, ProviderManifestList, ProviderPriceQuery, ReleaseCodeRequest,
    RuntimeSnapshot,
};
use sms_core::service::SmsService;
use std::sync::Arc;
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
        .route("/api/provider-manifests/reload", post(reload_provider_manifests))
        .route("/api/acquire", post(acquire_code))
        .route("/api/poll", post(poll_code))
        .route("/api/release", post(release_code))
        .route("/api/providers/{provider}/balance", get(get_balance))
        .route("/api/providers/{provider}/prices", post(get_prices))
        .route("/api/providers/{provider}/manifest", get(get_manifest).put(put_manifest))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(ApiState { service })
}

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "status": "ok"
    }))
}

async fn list_runtime(State(state): State<ApiState>) -> Json<RuntimeSnapshot> {
    Json(state.service.runtime_snapshot())
}

async fn list_provider_manifests(State(state): State<ApiState>) -> Json<ProviderManifestList> {
    Json(state.service.list_provider_manifests())
}

async fn reload_provider_manifests(
    State(state): State<ApiState>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
    state
        .service
        .reload_provider_registry()
        .map(|value| Json(serde_json::json!(value)))
        .map_err(to_api_error)
}

async fn acquire_code(
    State(state): State<ApiState>,
    Json(request): Json<AcquireCodeRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
    state
        .service
        .acquire_code(request)
        .await
        .map(|value| Json(serde_json::json!(value)))
        .map_err(to_api_error)
}

async fn poll_code(
    State(state): State<ApiState>,
    Json(request): Json<PollCodeRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
    state
        .service
        .poll_code(request)
        .await
        .map(|value| Json(serde_json::json!(value)))
        .map_err(to_api_error)
}

async fn release_code(
    State(state): State<ApiState>,
    Json(request): Json<ReleaseCodeRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
    state
        .service
        .release_code(request)
        .await
        .map(|value| Json(serde_json::json!(value)))
        .map_err(to_api_error)
}

async fn get_balance(
    State(state): State<ApiState>,
    Path(provider): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
    state
        .service
        .get_balance(&provider)
        .await
        .map(|value| Json(serde_json::json!(value)))
        .map_err(to_api_error)
}

async fn get_prices(
    State(state): State<ApiState>,
    Path(provider): Path<String>,
    Json(mut request): Json<ProviderPriceQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
    request.provider = provider;
    state
        .service
        .get_prices(request)
        .await
        .map(|value| Json(serde_json::json!(value)))
        .map_err(to_api_error)
}

async fn get_manifest(
    State(state): State<ApiState>,
    Path(provider): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
    state
        .service
        .provider_manifest(&provider)
        .map(|value| Json(serde_json::json!(value)))
        .map_err(to_api_error)
}

async fn put_manifest(
    State(state): State<ApiState>,
    Path(provider): Path<String>,
    Json(manifest): Json<plugin_sdk::ProviderManifest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ApiError>)> {
    state
        .service
        .save_provider_manifest(&provider, manifest)
        .map(|value| Json(serde_json::json!(value)))
        .map_err(to_api_error)
}

fn to_api_error(error: sms_core::error::SmsError) -> (StatusCode, Json<ApiError>) {
    (StatusCode::BAD_REQUEST, Json(ApiError { message: error.to_string() }))
}
