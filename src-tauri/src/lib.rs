use plugin_sdk::ProviderManifest;
use serde::Serialize;
use sms_core::config::ServerConfig;
use sms_core::models::ProviderSummary;
use sms_core::registry::ProviderRegistry;
use sms_core::service::SmsService;
use sms_server::spawn_http_server;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::Emitter;
use tauri::Manager;
use tauri::WebviewWindow;
use tauri::WindowEvent;
use tauri::image::Image;
use tauri::menu::{CheckMenuItemBuilder, Menu, MenuBuilder, MenuItem, SubmenuBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

const MENU_COMMAND_EVENT: &str = "menu-command";
const TRAY_ID: &str = "madao-menu-bar";
const MENU_NEW_ACTIVATION_ID: &str = "menu.new_activation";
const MENU_OPEN_MAIN_WINDOW_ID: &str = "menu.open_main_window";
const MENU_PREFERENCES_ID: &str = "menu.preferences";
const MENU_QUIT_ID: &str = "menu.quit";
const MENU_SCREEN_OVERVIEW_ID: &str = "screen.overview";
const MENU_SCREEN_PROVIDERS_ID: &str = "screen.providers";
const MENU_SCREEN_ROUTING_ID: &str = "screen.routing";
const MENU_SCREEN_MESSAGES_ID: &str = "screen.messages";
const MENU_SCREEN_SETTINGS_ID: &str = "screen.settings";
const MENU_SCREEN_LOGS_ID: &str = "screen.logs";
const MENU_PROVIDER_PREFIX: &str = "provider.";
const DEFAULT_CONFIG_RESOURCE_PATH: &str = "defaults/config/server.toml";
const DEFAULT_PROVIDER_RESOURCE_DIR: &str = "defaults/providers";
const RUNTIME_SETTINGS_FILE_NAME: &str = "runtime-settings.json";
const PROVIDER_OPTIONS_CACHE_FILE_NAME: &str = "provider-options-cache.json";
const PROVIDER_OPTIONS_RAW_AUDIT_FILE_NAME: &str = "provider-options-raw.json";

#[derive(Debug, Clone, PartialEq, Eq)]
enum MenuAction {
    Noop,
    ShowWindow,
    NewActivation,
    OpenScreen(&'static str),
    OpenProvider(String),
    Quit,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum MenuCommandPayload {
    NewActivation,
    OpenScreen {
        screen: &'static str,
    },
    OpenProvider {
        provider_id: String,
        section: &'static str,
    },
}

fn menu_action_for_id(event_id: &str) -> MenuAction {
    match event_id {
        MENU_NEW_ACTIVATION_ID => MenuAction::NewActivation,
        MENU_OPEN_MAIN_WINDOW_ID => MenuAction::ShowWindow,
        MENU_PREFERENCES_ID | MENU_SCREEN_SETTINGS_ID => MenuAction::OpenScreen("settings"),
        MENU_SCREEN_OVERVIEW_ID => MenuAction::OpenScreen("overview"),
        MENU_SCREEN_PROVIDERS_ID => MenuAction::OpenScreen("providers"),
        MENU_SCREEN_ROUTING_ID => MenuAction::OpenScreen("routing"),
        MENU_SCREEN_MESSAGES_ID => MenuAction::OpenScreen("messages"),
        MENU_SCREEN_LOGS_ID => MenuAction::OpenScreen("logs"),
        MENU_QUIT_ID => MenuAction::Quit,
        _ => event_id
            .strip_prefix(MENU_PROVIDER_PREFIX)
            .map(|provider_id| MenuAction::OpenProvider(provider_id.to_string()))
            .unwrap_or(MenuAction::Noop),
    }
}

fn show_main_window(app: &tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    let _ = app.set_dock_visibility(true);
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
    Ok(())
}

fn hide_main_window(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.hide().map_err(|err| err.to_string())?;
    }
    app.set_dock_visibility(false)
        .map_err(|err| err.to_string())?;
    Ok(())
}

fn emit_menu_command(app: &tauri::AppHandle, payload: MenuCommandPayload) -> Result<(), String> {
    app.emit(MENU_COMMAND_EVENT, payload)
        .map_err(|err| err.to_string())
}

fn init_user_config(app: &tauri::AppHandle) -> Result<(PathBuf, PathBuf), String> {
    let app_config_dir = app
        .path()
        .app_config_dir()
        .map_err(|err| format!("resolve app config dir failed: {err}"))?;
    let config_path = app_config_dir.join("config.toml");
    let providers_dir = app_config_dir.join("providers");

    fs::create_dir_all(&app_config_dir)
        .map_err(|err| format!("create app config dir failed: {err}"))?;
    fs::create_dir_all(&providers_dir)
        .map_err(|err| format!("create app provider dir failed: {err}"))?;

    if !config_path.exists() {
        let resource_config = app
            .path()
            .resolve(
                DEFAULT_CONFIG_RESOURCE_PATH,
                tauri::path::BaseDirectory::Resource,
            )
            .map_err(|err| format!("resolve bundled config failed: {err}"))?;
        let content = fs::read_to_string(&resource_config)
            .map_err(|err| format!("read bundled config failed: {err}"))?;
        let mut config: ServerConfig = toml::from_str(&content)
            .map_err(|err| format!("parse bundled config failed: {err}"))?;
        config.provider_dir = PathBuf::from("providers");
        let normalized = toml::to_string_pretty(&config)
            .map_err(|err| format!("serialize normalized config failed: {err}"))?;
        fs::write(&config_path, normalized)
            .map_err(|err| format!("write initial config failed: {err}"))?;
    }

    seed_default_providers(app, &providers_dir)?;

    Ok((config_path, providers_dir))
}

fn seed_default_providers(app: &tauri::AppHandle, target_dir: &Path) -> Result<(), String> {
    let source_dir = app
        .path()
        .resolve(
            DEFAULT_PROVIDER_RESOURCE_DIR,
            tauri::path::BaseDirectory::Resource,
        )
        .map_err(|err| format!("resolve bundled providers failed: {err}"))?;

    let entries =
        fs::read_dir(&source_dir).map_err(|err| format!("read bundled providers failed: {err}"))?;

    for entry in entries {
        let entry = entry.map_err(|err| format!("read bundled provider entry failed: {err}"))?;
        let source_path = entry.path();
        if source_path.extension().and_then(|value| value.to_str()) != Some("toml") {
            continue;
        }
        let target_path = target_dir.join(
            source_path
                .file_name()
                .ok_or_else(|| "provider template missing file name".to_string())?,
        );
        if !target_path.exists() {
            fs::copy(&source_path, &target_path)
                .map_err(|err| format!("copy bundled provider failed: {err}"))?;
        }
    }

    Ok(())
}

fn build_app_menu(app: &tauri::AppHandle) -> Result<Menu<tauri::Wry>, String> {
    let new_activation = MenuItem::with_id(
        app,
        MENU_NEW_ACTIVATION_ID,
        "New Activation",
        true,
        Some("CmdOrCtrl+N"),
    )
    .map_err(|err| err.to_string())?;
    let open_main_window = MenuItem::with_id(
        app,
        MENU_OPEN_MAIN_WINDOW_ID,
        "Open Main Window",
        true,
        Some("CmdOrCtrl+O"),
    )
    .map_err(|err| err.to_string())?;
    let preferences = MenuItem::with_id(
        app,
        MENU_PREFERENCES_ID,
        "Preferences...",
        true,
        None::<&str>,
    )
    .map_err(|err| err.to_string())?;
    let quit = MenuItem::with_id(
        app,
        MENU_QUIT_ID,
        "Quit MadaoSMS",
        true,
        Some("CmdOrCtrl+Q"),
    )
    .map_err(|err| err.to_string())?;
    let overview = MenuItem::with_id(app, MENU_SCREEN_OVERVIEW_ID, "Overview", true, None::<&str>)
        .map_err(|err| err.to_string())?;
    let providers = MenuItem::with_id(
        app,
        MENU_SCREEN_PROVIDERS_ID,
        "Providers",
        true,
        None::<&str>,
    )
    .map_err(|err| err.to_string())?;
    let routing = MenuItem::with_id(app, MENU_SCREEN_ROUTING_ID, "Routing", true, None::<&str>)
        .map_err(|err| err.to_string())?;
    let messages = MenuItem::with_id(app, MENU_SCREEN_MESSAGES_ID, "Messages", true, None::<&str>)
        .map_err(|err| err.to_string())?;
    let settings = MenuItem::with_id(app, MENU_SCREEN_SETTINGS_ID, "Settings", true, None::<&str>)
        .map_err(|err| err.to_string())?;
    let logs = MenuItem::with_id(app, MENU_SCREEN_LOGS_ID, "Logs", true, None::<&str>)
        .map_err(|err| err.to_string())?;

    let app_submenu = SubmenuBuilder::new(app, "MadaoSMS")
        .item(&open_main_window)
        .separator()
        .item(&preferences)
        .separator()
        .item(&quit)
        .build()
        .map_err(|err| err.to_string())?;
    let file_submenu = SubmenuBuilder::new(app, "File")
        .item(&new_activation)
        .item(&open_main_window)
        .build()
        .map_err(|err| err.to_string())?;
    let window_submenu = SubmenuBuilder::new(app, "Window")
        .item(&overview)
        .item(&providers)
        .item(&routing)
        .item(&messages)
        .item(&settings)
        .item(&logs)
        .build()
        .map_err(|err| err.to_string())?;

    MenuBuilder::new(app)
        .item(&app_submenu)
        .item(&file_submenu)
        .item(&window_submenu)
        .build()
        .map_err(|err| err.to_string())
}

fn build_tray_menu(
    app: &tauri::AppHandle,
    providers: &[ProviderSummary],
) -> Result<Menu<tauri::Wry>, String> {
    let mut sorted = providers
        .iter()
        .filter(|provider| provider.id != "mock")
        .cloned()
        .collect::<Vec<_>>();
    sorted.sort_by(|left, right| {
        left.priority
            .cmp(&right.priority)
            .then_with(|| left.name.cmp(&right.name))
    });

    let active_count = sorted.iter().filter(|provider| provider.enabled).count();
    let status = MenuItem::with_id(
        app,
        "tray.status",
        format!("{active_count} providers active"),
        false,
        None::<&str>,
    )
    .map_err(|err| err.to_string())?;
    let new_activation = MenuItem::with_id(
        app,
        MENU_NEW_ACTIVATION_ID,
        "New Activation",
        true,
        Some("CmdOrCtrl+N"),
    )
    .map_err(|err| err.to_string())?;
    let open_main_window = MenuItem::with_id(
        app,
        MENU_OPEN_MAIN_WINDOW_ID,
        "Open Main Window",
        true,
        Some("CmdOrCtrl+O"),
    )
    .map_err(|err| err.to_string())?;
    let providers_header = MenuItem::with_id(
        app,
        "tray.providers_header",
        "PROVIDERS",
        false,
        None::<&str>,
    )
    .map_err(|err| err.to_string())?;
    let preferences = MenuItem::with_id(
        app,
        MENU_PREFERENCES_ID,
        "Preferences...",
        true,
        None::<&str>,
    )
    .map_err(|err| err.to_string())?;
    let quit = MenuItem::with_id(
        app,
        MENU_QUIT_ID,
        "Quit MadaoSMS",
        true,
        Some("CmdOrCtrl+Q"),
    )
    .map_err(|err| err.to_string())?;

    let mut builder = MenuBuilder::new(app)
        .item(&status)
        .separator()
        .item(&new_activation)
        .item(&open_main_window)
        .separator()
        .item(&providers_header);

    if sorted.is_empty() {
        let empty = MenuItem::with_id(
            app,
            "tray.providers_empty",
            "No providers available",
            false,
            None::<&str>,
        )
        .map_err(|err| err.to_string())?;
        builder = builder.item(&empty);
    } else {
        for provider in sorted {
            let provider_item = CheckMenuItemBuilder::with_id(
                format!("{MENU_PROVIDER_PREFIX}{}", provider.id),
                provider.name,
            )
            .checked(provider.enabled)
            .build(app)
            .map_err(|err| err.to_string())?;
            builder = builder.item(&provider_item);
        }
    }

    builder
        .separator()
        .item(&preferences)
        .separator()
        .item(&quit)
        .build()
        .map_err(|err| err.to_string())
}

fn sync_menu_bar(app: &tauri::AppHandle) -> Result<(), String> {
    let service = app.state::<Arc<SmsService>>();
    let snapshot = service.runtime_snapshot();
    let active_count = snapshot
        .providers
        .iter()
        .filter(|provider| provider.id != "mock" && provider.enabled)
        .count();
    let tray_menu = build_tray_menu(app, &snapshot.providers)?;

    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        tray.set_menu(Some(tray_menu))
            .map_err(|err| err.to_string())?;
        tray.set_tooltip(Some(format!(
            "MaDao SMS Platform · {active_count} active providers"
        )))
        .map_err(|err| err.to_string())?;
        return Ok(());
    }

    let tray_icon = Image::from_bytes(include_bytes!("../icons/tray-icon.png"))
        .map_err(|err| err.to_string())?;
    TrayIconBuilder::with_id(TRAY_ID)
        .icon(tray_icon)
        .icon_as_template(true)
        .menu(&tray_menu)
        .show_menu_on_left_click(false)
        .tooltip(format!(
            "MaDao SMS Platform · {active_count} active providers"
        ))
        .build(app)
        .map_err(|err| err.to_string())?;

    Ok(())
}

fn handle_menu_event(app: &tauri::AppHandle, event_id: &str) {
    match menu_action_for_id(event_id) {
        MenuAction::Noop => {}
        MenuAction::ShowWindow => {
            if let Err(err) = show_main_window(app) {
                eprintln!("menu action `{event_id}` failed: {err}");
            }
        }
        MenuAction::NewActivation => {
            let result = show_main_window(app)
                .and_then(|_| emit_menu_command(app, MenuCommandPayload::NewActivation));
            if let Err(err) = result {
                eprintln!("menu action `{event_id}` failed: {err}");
            }
        }
        MenuAction::OpenScreen(screen) => {
            let result = show_main_window(app)
                .and_then(|_| emit_menu_command(app, MenuCommandPayload::OpenScreen { screen }));
            if let Err(err) = result {
                eprintln!("menu action `{event_id}` failed: {err}");
            }
        }
        MenuAction::OpenProvider(provider_id) => {
            let result = show_main_window(app).and_then(|_| {
                emit_menu_command(
                    app,
                    MenuCommandPayload::OpenProvider {
                        provider_id,
                        section: "config",
                    },
                )
            });
            if let Err(err) = result {
                eprintln!("menu action `{event_id}` failed: {err}");
            }
        }
        MenuAction::Quit => {
            app.exit(0);
            return;
        }
    }

    if let Err(err) = sync_menu_bar(app) {
        eprintln!("menu bar refresh failed: {err}");
    }
}

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
    let value = service
        .save_provider_manifest(&provider, manifest)
        .await
        .map_err(|err| err.to_string())?;
    sync_menu_bar(&app)?;
    serde_json::to_value(value).map_err(|err| err.to_string())
}

#[tauri::command]
async fn reload_provider_registry(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let service = app.state::<Arc<SmsService>>();
    let value = service
        .reload_provider_registry()
        .map_err(|err| err.to_string())?;
    sync_menu_bar(&app)?;
    serde_json::to_value(value).map_err(|err| err.to_string())
}

#[tauri::command]
async fn refresh_menu_bar(app: tauri::AppHandle) -> Result<(), String> {
    sync_menu_bar(&app)
}

#[tauri::command]
async fn app_config_directory(app: tauri::AppHandle) -> Result<String, String> {
    app.path()
        .app_config_dir()
        .map(|path| path.display().to_string())
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn open_app_config_directory(app: tauri::AppHandle) -> Result<(), String> {
    let path = app
        .path()
        .app_config_dir()
        .map_err(|err| format!("resolve app config dir failed: {err}"))?;

    let mut command = if cfg!(target_os = "macos") {
        let mut command = std::process::Command::new("open");
        command.arg(&path);
        command
    } else if cfg!(target_os = "windows") {
        let mut command = std::process::Command::new("explorer");
        command.arg(&path);
        command
    } else {
        let mut command = std::process::Command::new("xdg-open");
        command.arg(&path);
        command
    };

    command
        .spawn()
        .map_err(|err| format!("open config dir failed: {err}"))?;
    Ok(())
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
    tauri::Builder::default()
        .enable_macos_default_menu(false)
        .invoke_handler(tauri::generate_handler![
            runtime_snapshot,
            list_provider_manifests,
            save_provider_manifest,
            reload_provider_registry,
            refresh_menu_bar,
            app_config_directory,
            open_app_config_directory,
            window_action
        ])
        .on_tray_icon_event(|app, event| {
            if event.id().as_ref() != TRAY_ID {
                return;
            }

            if let TrayIconEvent::Click {
                button,
                button_state,
                ..
            } = event
            {
                match (button, button_state) {
                    (MouseButton::Left, MouseButtonState::Up) => {
                        if let Err(err) = show_main_window(app) {
                            eprintln!("tray left click failed: {err}");
                        }
                    }
                    _ => {}
                }
            }
        })
        .on_menu_event(|app, event| {
            handle_menu_event(app, event.id().as_ref());
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = hide_main_window(&window.app_handle());
            }
        })
        .setup(move |app| {
            let (config_path, providers_dir) = init_user_config(&app.handle())?;
            let config =
                ServerConfig::load_from_file(&config_path).map_err(|err| err.to_string())?;
            let registry =
                ProviderRegistry::load_from_dir(&providers_dir).map_err(|err| err.to_string())?;
            let runtime_settings_path = config_path
                .parent()
                .ok_or_else(|| "resolve config parent dir failed".to_string())?
                .join(RUNTIME_SETTINGS_FILE_NAME);
            let provider_options_path = config_path
                .parent()
                .ok_or_else(|| "resolve config parent dir failed".to_string())?
                .join(PROVIDER_OPTIONS_CACHE_FILE_NAME);
            let provider_options_raw_path = config_path
                .parent()
                .ok_or_else(|| "resolve config parent dir failed".to_string())?
                .join(PROVIDER_OPTIONS_RAW_AUDIT_FILE_NAME);
            let service = Arc::new(SmsService::with_persistence_paths(
                registry,
                config.log_buffer,
                Some(runtime_settings_path),
                Some(provider_options_path),
                Some(provider_options_raw_path),
                None,
            ));
            app.manage(Arc::clone(&service));
            let app_handle = app.handle().clone();
            let config = config.clone();
            let cache_service = Arc::clone(&service);
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
            tauri::async_runtime::spawn(async move {
                loop {
                    let _ = cache_service.maybe_poll_provider_options().await;
                    cache_service.maybe_dispatch_ticket_callbacks().await;
                    tokio::time::sleep(std::time::Duration::from_secs(60)).await;
                }
            });
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title("MaDao SMS Platform");
            }
            let _ = app.set_dock_visibility(true);
            let menu = build_app_menu(&app.handle())?;
            let _ = app.set_menu(menu).map_err(|err| err.to_string())?;
            sync_menu_bar(&app.handle())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{
        MENU_PROVIDER_PREFIX, MENU_QUIT_ID, MENU_SCREEN_LOGS_ID, MenuAction, menu_action_for_id,
    };

    #[test]
    fn parses_screen_event_ids() {
        assert_eq!(
            menu_action_for_id(MENU_SCREEN_LOGS_ID),
            MenuAction::OpenScreen("logs")
        );
    }

    #[test]
    fn parses_provider_event_ids() {
        assert_eq!(
            menu_action_for_id(&format!("{MENU_PROVIDER_PREFIX}fivesim")),
            MenuAction::OpenProvider("fivesim".to_string())
        );
    }

    #[test]
    fn parses_quit_event_id() {
        assert_eq!(menu_action_for_id(MENU_QUIT_ID), MenuAction::Quit);
    }
}
