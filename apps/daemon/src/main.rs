use anyhow::Context;
use directories::ProjectDirs;
use sms_core::config::ServerConfig;
use sms_core::models::RuntimeSettings;
use sms_core::registry::ProviderRegistry;
use sms_core::service::SmsService;
use sms_server::{spawn_http_server, spawn_socket_server};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

const DEFAULT_CONFIG_TEMPLATE_PATH: &str = "config/server.toml";
const DEFAULT_PROVIDER_TEMPLATE_DIR: &str = "plugins/providers";
const DEFAULT_DOCKER_CONFIG_DIR: &str = "/var/lib/madao";
const DEFAULT_DOCKER_HTTP_BIND: &str = "0.0.0.0:7822";
const DEFAULT_DOCKER_SOCKET_PATH: &str = "/tmp/madao-sms.sock";
const RUNTIME_MODE_DOCKER: &str = "docker";

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli_config_path = std::env::args().nth(1).map(PathBuf::from);
    let config_path = prepare_config_path(cli_config_path.as_deref())?;
    let mut config = ServerConfig::load_from_file(&config_path)?;
    let registry = ProviderRegistry::load_from_dir(&config.provider_dir)?;
    let config_dir = config_path
        .parent()
        .context("resolve config directory failed")?;
    if let Ok(settings) = load_runtime_settings_file(&config_dir.join("runtime-settings.json")) {
        config = config.with_http_port(settings.http_port);
    }
    config = config.with_http_bind_host("0.0.0.0");
    let service = Arc::new(SmsService::with_persistence_paths(
        registry,
        config.log_buffer,
        Some(config_dir.join("runtime-settings.json")),
        Some(config_dir.join("runtime-state.json")),
        Some(config_dir.join("provider-options-cache.json")),
        Some(config_dir.join("provider-options-raw.json")),
        Some(config_dir.join("routing-plans.json")),
    ));
    service.ensure_runtime_settings_persisted();
    let http_secret_override = env::var("MADAO_HTTP_SECRET")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let (http_addr, _http_handle) = spawn_http_server(
        Arc::clone(&service),
        &config,
        http_secret_override,
    )
    .await
    .with_context(|| format!("bind http listener failed: {}", config.http_bind))?;

    spawn_socket_server(Arc::clone(&service), &config.socket_path).await?;

    println!("http listening on {}", http_addr);

    if is_docker_runtime() && config.http_bind != DEFAULT_DOCKER_HTTP_BIND {
        let internal_config = ServerConfig {
            http_bind: DEFAULT_DOCKER_HTTP_BIND.to_string(),
            ..config.clone()
        };
        let _ = spawn_http_server(
            Arc::clone(&service),
            &internal_config,
            env::var("MADAO_HTTP_SECRET")
                .ok()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty()),
        )
        .await
        .with_context(|| format!("bind internal docker http listener failed: {}", internal_config.http_bind))?;
        println!("internal http listening on {}", internal_config.http_bind);
    }

    log_socket_transport(&config.socket_path);

    tokio::signal::ctrl_c()
        .await
        .context("wait for shutdown signal failed")
}

#[cfg(unix)]
fn log_socket_transport(socket_path: &Path) {
    println!("socket listening on {}", socket_path.display());
}

#[cfg(not(unix))]
fn log_socket_transport(socket_path: &Path) {
    eprintln!(
        "unix socket transport is disabled on this platform: {}",
        socket_path.display()
    );
}

fn prepare_config_path(explicit_path: Option<&Path>) -> anyhow::Result<PathBuf> {
    if let Some(path) = explicit_path {
        return Ok(path.to_path_buf());
    }

    let config_dir = daemon_config_dir()?;
    fs::create_dir_all(&config_dir)
        .with_context(|| format!("create daemon config dir failed: {}", config_dir.display()))?;
    let config_path = config_dir.join("config.toml");

    let cwd = env::current_dir().context("read current dir failed")?;
    let template_path = cwd.join(DEFAULT_CONFIG_TEMPLATE_PATH);
    ensure_runtime_config(&config_path, &template_path)?;

    seed_default_providers(&config_dir)?;
    Ok(config_path)
}

fn daemon_config_dir() -> anyhow::Result<PathBuf> {
    if is_docker_runtime() {
        return Ok(PathBuf::from(
            env::var("MADAO_CONFIG_DIR").unwrap_or_else(|_| DEFAULT_DOCKER_CONFIG_DIR.to_string()),
        ));
    }
    ProjectDirs::from("com", "madao", "sms")
        .map(|dirs| dirs.config_dir().to_path_buf())
        .context("resolve daemon config dir failed")
}

fn ensure_runtime_config(
    config_path: &Path,
    template_path: &Path,
) -> anyhow::Result<()> {
    if config_path.exists() && !is_docker_runtime() {
        return Ok(());
    }

    let mut config = if config_path.exists() {
        ServerConfig::load_from_file(config_path)
            .with_context(|| format!("load daemon config failed: {}", config_path.display()))?
    } else {
        ServerConfig::load_from_file(template_path)
            .with_context(|| format!("load config template failed: {}", template_path.display()))?
    };

    config.provider_dir = PathBuf::from("providers");

    if is_docker_runtime() {
        config.http_bind = env::var("MADAO_HTTP_BIND")
            .unwrap_or_else(|_| DEFAULT_DOCKER_HTTP_BIND.to_string());
        config.socket_path = PathBuf::from(
            env::var("MADAO_SOCKET_PATH")
                .unwrap_or_else(|_| DEFAULT_DOCKER_SOCKET_PATH.to_string()),
        );
    }

    let content = toml::to_string_pretty(&config).context("serialize daemon config failed")?;
    fs::write(config_path, content)
        .with_context(|| format!("write daemon config failed: {}", config_path.display()))?;

    Ok(())
}

fn is_docker_runtime() -> bool {
    env::var("MADAO_RUNTIME_MODE")
        .map(|value| value.trim().eq_ignore_ascii_case(RUNTIME_MODE_DOCKER))
        .unwrap_or(false)
}

fn load_runtime_settings_file(path: &Path) -> anyhow::Result<RuntimeSettings> {
    let content = fs::read_to_string(path)?;
    Ok(serde_json::from_str(&content)?)
}

fn seed_default_providers(config_dir: &Path) -> anyhow::Result<()> {
    let target_dir = config_dir.join("providers");
    fs::create_dir_all(&target_dir)
        .with_context(|| format!("create provider dir failed: {}", target_dir.display()))?;

    let cwd = std::env::current_dir().context("read current dir failed")?;
    let source_dir = cwd.join(DEFAULT_PROVIDER_TEMPLATE_DIR);
    let entries = fs::read_dir(&source_dir).with_context(|| {
        format!(
            "read provider template dir failed: {}",
            source_dir.display()
        )
    })?;

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
