use anyhow::Context;
use plugin_sdk::ProviderManifest;
use sms_core::config::ServerConfig;
use sms_core::models::{
    AcquireCodeRequest, PollCodeRequest, ProviderPriceQuery, ReleaseCodeRequest,
    RoutingFailoverRequest, RoutingPlan,
};
use sms_core::registry::ProviderRegistry;
use sms_core::service::SmsService;
use sms_server::spawn_http_server;
use serde::Deserialize;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::UnixListener;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cwd = std::env::current_dir().context("read current dir failed")?;
    let config_path = std::env::args()
        .nth(1)
        .map(PathBuf::from)
        .unwrap_or_else(|| cwd.join("config/server.toml"));
    let mut config = ServerConfig::load_from_file(&config_path)?;
    if !config.provider_dir.exists() {
      let fallback_provider_dir = cwd.join("plugins/providers");
      if fallback_provider_dir.exists() {
          config.provider_dir = fallback_provider_dir;
      }
    }
    let registry = ProviderRegistry::load_from_dir(cwd.join(&config.provider_dir))?;
    let config_dir = config_path
        .parent()
        .context("resolve config directory failed")?;
    let service = Arc::new(SmsService::with_persistence_paths(
        registry,
        config.log_buffer,
        Some(config_dir.join("runtime-settings.json")),
        Some(config_dir.join("provider-options-cache.json")),
        Some(config_dir.join("routing-plans.json")),
    ));

    let (http_addr, _http_handle) = spawn_http_server(Arc::clone(&service), &config)
        .await
        .with_context(|| format!("bind http listener failed: {}", config.http_bind))?;

    let socket_path = normalize_socket_path(&cwd, &config.socket_path);
    if socket_path.exists() {
        let _ = std::fs::remove_file(&socket_path);
    }
    let unix_listener = UnixListener::bind(&socket_path)
        .with_context(|| format!("bind unix socket failed: {}", socket_path.display()))?;

    let socket_service = Arc::clone(&service);
    tokio::spawn(async move {
        loop {
            let Ok((stream, _addr)) = unix_listener.accept().await else {
                break;
            };
            let service = Arc::clone(&socket_service);
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

    println!("http listening on {}", http_addr);
    println!("socket listening on {}", socket_path.display());

    tokio::signal::ctrl_c().await.context("wait for shutdown signal failed")
}

async fn handle_socket_command(service: &SmsService, line: &str) -> String {
    if let Ok(command) = serde_json::from_str::<SocketCommand>(line) {
        return match command {
            SocketCommand::Ping => serde_json::json!({ "status": "pong" }).to_string(),
            SocketCommand::Snapshot => serde_json::to_string(&service.runtime_snapshot())
                .unwrap_or_else(|_| "{}".to_string()),
            SocketCommand::Acquire { request } => wrap_socket_result(service.acquire_code(request).await),
            SocketCommand::Poll { request } => wrap_socket_result(service.poll_code(request).await),
            SocketCommand::Release { request } => wrap_socket_result(service.release_code(request).await),
            SocketCommand::RoutingFailover { request } => {
                wrap_socket_result(service.failover_routing_attempt(request).await)
            }
            SocketCommand::Balance { provider } => wrap_socket_result(service.get_balance(&provider).await),
            SocketCommand::Prices { request } => wrap_socket_result(service.get_prices(request).await),
            SocketCommand::ProviderManifests => {
                wrap_socket_plain_result(Ok(service.list_provider_manifests()))
            }
            SocketCommand::RoutingPlans => wrap_socket_plain_result(Ok(service.list_routing_plans())),
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
            SocketCommand::ReloadProviders => wrap_socket_plain_result(service.reload_provider_registry()),
        };
    }
    let snapshot = service.runtime_snapshot();
    match line.trim() {
        "ping" => serde_json::json!({ "status": "pong" }).to_string(),
        "snapshot" => serde_json::to_string(&snapshot).unwrap_or_else(|_| "{}".to_string()),
        other => serde_json::json!({
            "status": "error",
            "message": format!("unknown socket command: {other}")
        })
        .to_string(),
    }
}

fn normalize_socket_path(cwd: &PathBuf, raw: &PathBuf) -> PathBuf {
    if raw.is_absolute() {
        raw.clone()
    } else {
        cwd.join(raw)
    }
}

#[derive(Debug, Deserialize)]
#[serde(tag = "command", rename_all = "snake_case")]
enum SocketCommand {
    Ping,
    Snapshot,
    Acquire { request: AcquireCodeRequest },
    Poll { request: PollCodeRequest },
    Release { request: ReleaseCodeRequest },
    RoutingFailover { request: RoutingFailoverRequest },
    Balance { provider: String },
    Prices { request: ProviderPriceQuery },
    ProviderManifests,
    RoutingPlans,
    RoutingPlan { plan_id: String },
    SaveRoutingPlan { plan: RoutingPlan },
    DeleteRoutingPlan { plan_id: String },
    ProviderManifest { provider: String },
    SaveProviderManifest { provider: String, manifest: ProviderManifest },
    ReloadProviders,
}

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

fn wrap_socket_plain_result<T: serde::Serialize>(result: Result<T, sms_core::error::SmsError>) -> String {
    wrap_socket_result(result)
}
