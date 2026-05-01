use plugin_sdk::ProviderManifest;
use sms_core::config::ServerConfig;
use sms_core::registry::ProviderRegistry;
use sms_core::service::SmsService;
use sms_server::spawn_http_server;
use std::sync::Arc;
use tauri::Emitter;
use tauri::Manager;
use tauri::PhysicalSize;
use tauri::WebviewWindow;

#[tauri::command]
async fn runtime_snapshot(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let service = app.state::<Arc<SmsService>>();
    serde_json::to_value(service.runtime_snapshot()).map_err(|err| err.to_string())
}

#[tauri::command]
async fn list_provider_manifests(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let service = app.state::<Arc<SmsService>>();
    serde_json::to_value(service.list_provider_manifests()).map_err(|err| err.to_string())
}

#[tauri::command]
async fn save_provider_manifest(
    app: tauri::AppHandle,
    provider: String,
    manifest: ProviderManifest,
) -> Result<serde_json::Value, String> {
    let service = app.state::<Arc<SmsService>>();
    service
        .save_provider_manifest(&provider, manifest)
        .map_err(|err| err.to_string())
        .and_then(|value| serde_json::to_value(value).map_err(|err| err.to_string()))
}

#[tauri::command]
async fn reload_provider_registry(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let service = app.state::<Arc<SmsService>>();
    service
        .reload_provider_registry()
        .map_err(|err| err.to_string())
        .and_then(|value| serde_json::to_value(value).map_err(|err| err.to_string()))
}

#[tauri::command]
async fn window_action(window: WebviewWindow, action: String) -> Result<(), String> {
    match action.as_str() {
        "minimize" => window.minimize().map_err(|err| err.to_string()),
        "maximize_toggle" => {
            let maximized = window.is_maximized().map_err(|err| err.to_string())?;
            if maximized {
                window.unmaximize().map_err(|err| err.to_string())
            } else {
                window.maximize().map_err(|err| err.to_string())
            }
        }
        "close" => window.close().map_err(|err| err.to_string()),
        other => Err(format!("unsupported window action: {other}")),
    }
}

pub fn run() {
    let cwd = std::env::current_dir().expect("read current dir");
    let config = ServerConfig::load_from_file(cwd.join("config/server.toml")).expect("load config");
    let registry = ProviderRegistry::load_from_dir(cwd.join(&config.provider_dir)).expect("load providers");
    let service = Arc::new(SmsService::new(registry, config.log_buffer));

    tauri::Builder::default()
        .manage(service)
        .invoke_handler(tauri::generate_handler![
            runtime_snapshot,
            list_provider_manifests,
            save_provider_manifest,
            reload_provider_registry,
            window_action
        ])
        .setup(move |app| {
            let app_handle = app.handle().clone();
            let service = app.state::<Arc<SmsService>>().inner().clone();
            let config = config.clone();
            let screenshot_target = std::env::var("MA_DAO_SCREENSHOT_TARGET").ok();
            tauri::async_runtime::spawn(async move {
                match spawn_http_server(service, &config).await {
                    Ok((addr, _handle)) => {
                        eprintln!("embedded http server listening on {addr}");
                    }
                    Err(error) => {
                        eprintln!("embedded http server failed to start: {error}");
                        let _ = app_handle.emit("runtime-error", error.to_string());
                    }
                }
            });
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title("MaDao SMS Platform");
                if screenshot_target.is_some() {
                    let _ = window.set_decorations(false);
                    let _ = window.set_resizable(false);
                    let _ = window.set_size(PhysicalSize::new(1104, 848));
                    let _ = window.center();
                    if let Some(target) = screenshot_target.clone() {
                        let script = format!(
                            "window.__MA_DAO_SCREENSHOT_TARGET__ = {};",
                            serde_json::to_string(&target).unwrap_or_else(|_| "\"Overview\"".to_string())
                        );
                        let _ = window.eval(&script);
                    }
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
