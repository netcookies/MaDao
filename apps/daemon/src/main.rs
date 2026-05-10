use anyhow::Context;
use directories::ProjectDirs;
use plugin_sdk::ProviderManifest;
use serde::Deserialize;
use sms_core::config::ServerConfig;
use sms_core::models::{
    AcquireCodeRequest, PollCodeRequest, ProviderPriceQuery, ReleaseCodeRequest,
    RoutingFailoverRequest, RoutingPlan,
};
use sms_core::registry::ProviderRegistry;
use sms_core::service::SmsService;
use sms_server::spawn_http_server;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::UnixListener;

const DEFAULT_CONFIG_TEMPLATE_PATH: &str = "config/server.toml";
const DEFAULT_PROVIDER_TEMPLATE_DIR: &str = "plugins/providers";

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli_config_path = std::env::args().nth(1).map(PathBuf::from);
    let config_path = prepare_config_path(cli_config_path.as_deref())?;
    let config = ServerConfig::load_from_file(&config_path)?;
    let registry = ProviderRegistry::load_from_dir(&config.provider_dir)?;
    let config_dir = config_path
        .parent()
        .context("resolve config directory failed")?;
    let service = Arc::new(SmsService::with_persistence_paths(
        registry,
        config.log_buffer,
        Some(config_dir.join("runtime-settings.json")),
        Some(config_dir.join("runtime-state.json")),
        Some(config_dir.join("provider-options-cache.json")),
        Some(config_dir.join("provider-options-raw.json")),
        Some(config_dir.join("routing-plans.json")),
    ));

    let (http_addr, _http_handle) = spawn_http_server(Arc::clone(&service), &config)
        .await
        .with_context(|| format!("bind http listener failed: {}", config.http_bind))?;

    let socket_path = config.socket_path.clone();
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

    tokio::signal::ctrl_c()
        .await
        .context("wait for shutdown signal failed")
}

async fn handle_socket_command(service: &SmsService, line: &str) -> String {
    if let Ok(command) = serde_json::from_str::<SocketCommand>(line) {
        return match command {
            SocketCommand::Ping => serde_json::json!({ "status": "pong" }).to_string(),
            SocketCommand::Snapshot => serde_json::to_string(&service.runtime_snapshot())
                .unwrap_or_else(|_| "{}".to_string()),
            SocketCommand::Acquire { request } => {
                wrap_socket_result(service.acquire_code(request).await)
            }
            SocketCommand::Poll { request } => wrap_socket_result(service.poll_code(request).await),
            SocketCommand::Release { request } => {
                wrap_socket_result(service.release_code(request).await)
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

fn prepare_config_path(explicit_path: Option<&Path>) -> anyhow::Result<PathBuf> {
    if let Some(path) = explicit_path {
        return Ok(path.to_path_buf());
    }

    let config_dir = daemon_config_dir()?;
    fs::create_dir_all(&config_dir)
        .with_context(|| format!("create daemon config dir failed: {}", config_dir.display()))?;
    let config_path = config_dir.join("config.toml");

    if !config_path.exists() {
        let cwd = std::env::current_dir().context("read current dir failed")?;
        let template_path = cwd.join(DEFAULT_CONFIG_TEMPLATE_PATH);
        let mut config = ServerConfig::load_from_file(&template_path)
            .with_context(|| format!("load config template failed: {}", template_path.display()))?;
        config.provider_dir = PathBuf::from("providers");
        let content = toml::to_string_pretty(&config).context("serialize daemon config failed")?;
        fs::write(&config_path, content)
            .with_context(|| format!("write daemon config failed: {}", config_path.display()))?;
    }

    seed_default_providers(&config_dir)?;
    Ok(config_path)
}

fn daemon_config_dir() -> anyhow::Result<PathBuf> {
    ProjectDirs::from("com", "madao", "sms")
        .map(|dirs| dirs.config_dir().to_path_buf())
        .context("resolve daemon config dir failed")
}

fn seed_default_providers(config_dir: &Path) -> anyhow::Result<()> {
    let target_dir = config_dir.join("providers");
    fs::create_dir_all(&target_dir)
        .with_context(|| format!("create provider dir failed: {}", target_dir.display()))?;

    let cwd = std::env::current_dir().context("read current dir failed")?;
    let source_dir = cwd.join(DEFAULT_PROVIDER_TEMPLATE_DIR);
    let entries = fs::read_dir(&source_dir)
        .with_context(|| format!("read provider template dir failed: {}", source_dir.display()))?;

    for entry in entries {
        let entry = entry.context("read provider template entry failed")?;
        let source_path = entry.path();
        if source_path.extension().and_then(|value| value.to_str()) != Some("toml") {
            continue;
        }
        let target_path = target_dir.join(
            source_path
                .file_name()
                .context("provider template missing file name")?,
        );
        if !target_path.exists() {
            fs::copy(&source_path, &target_path).with_context(|| {
                format!(
                    "copy provider template failed: {} -> {}",
                    source_path.display(),
                    target_path.display()
                )
            })?;
        }
    }

    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(tag = "command", rename_all = "snake_case")]
enum SocketCommand {
    Ping,
    Snapshot,
    Acquire {
        request: AcquireCodeRequest,
    },
    Poll {
        request: PollCodeRequest,
    },
    Release {
        request: ReleaseCodeRequest,
    },
    RoutingFailover {
        request: RoutingFailoverRequest,
    },
    Balance {
        provider: String,
    },
    Prices {
        request: ProviderPriceQuery,
    },
    ProviderManifests,
    RoutingPlans,
    RoutingPlan {
        plan_id: String,
    },
    SaveRoutingPlan {
        plan: RoutingPlan,
    },
    DeleteRoutingPlan {
        plan_id: String,
    },
    ProviderManifest {
        provider: String,
    },
    SaveProviderManifest {
        provider: String,
        manifest: ProviderManifest,
    },
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

fn wrap_socket_plain_result<T: serde::Serialize>(
    result: Result<T, sms_core::error::SmsError>,
) -> String {
    wrap_socket_result(result)
}
