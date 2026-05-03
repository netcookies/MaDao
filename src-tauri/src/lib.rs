use plugin_sdk::ProviderManifest;
use serde::Serialize;
use sms_core::models::ProviderSummary;
use sms_core::config::ServerConfig;
use sms_core::registry::ProviderRegistry;
use sms_core::service::SmsService;
use sms_server::spawn_http_server;
use std::sync::Arc;
use tauri::Emitter;
use tauri::Manager;
use tauri::WebviewWindow;
use tauri::WindowEvent;
use tauri::image::Image;
use tauri::menu::{CheckMenuItemBuilder, Menu, MenuBuilder, MenuItem, SubmenuBuilder};
use tauri::tray::TrayIconBuilder;

const MENU_COMMAND_EVENT: &str = "menu-command";
const TRAY_ID: &str = "madao-menu-bar";
const MENU_NEW_ACTIVATION_ID: &str = "menu.new_activation";
const MENU_OPEN_MAIN_WINDOW_ID: &str = "menu.open_main_window";
const MENU_PREFERENCES_ID: &str = "menu.preferences";
const MENU_QUIT_ID: &str = "menu.quit";
const MENU_SCREEN_OVERVIEW_ID: &str = "screen.overview";
const MENU_SCREEN_PROVIDERS_ID: &str = "screen.providers";
const MENU_SCREEN_MESSAGES_ID: &str = "screen.messages";
const MENU_SCREEN_SETTINGS_ID: &str = "screen.settings";
const MENU_SCREEN_LOGS_ID: &str = "screen.logs";
const MENU_PROVIDER_PREFIX: &str = "provider.";

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
    OpenScreen { screen: &'static str },
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
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
    Ok(())
}

fn emit_menu_command(app: &tauri::AppHandle, payload: MenuCommandPayload) -> Result<(), String> {
    app.emit(MENU_COMMAND_EVENT, payload)
        .map_err(|err| err.to_string())
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
    let preferences = MenuItem::with_id(app, MENU_PREFERENCES_ID, "Preferences...", true, None::<&str>)
        .map_err(|err| err.to_string())?;
    let quit = MenuItem::with_id(app, MENU_QUIT_ID, "Quit MadaoSMS", true, Some("CmdOrCtrl+Q"))
        .map_err(|err| err.to_string())?;
    let overview = MenuItem::with_id(app, MENU_SCREEN_OVERVIEW_ID, "Overview", true, None::<&str>)
        .map_err(|err| err.to_string())?;
    let providers = MenuItem::with_id(app, MENU_SCREEN_PROVIDERS_ID, "Providers", true, None::<&str>)
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

fn build_tray_menu(app: &tauri::AppHandle, providers: &[ProviderSummary]) -> Result<Menu<tauri::Wry>, String> {
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
    let providers_header =
        MenuItem::with_id(app, "tray.providers_header", "PROVIDERS", false, None::<&str>)
            .map_err(|err| err.to_string())?;
    let preferences = MenuItem::with_id(app, MENU_PREFERENCES_ID, "Preferences...", true, None::<&str>)
        .map_err(|err| err.to_string())?;
    let quit = MenuItem::with_id(app, MENU_QUIT_ID, "Quit MadaoSMS", true, Some("CmdOrCtrl+Q"))
        .map_err(|err| err.to_string())?;

    let mut builder = MenuBuilder::new(app)
        .item(&status)
        .separator()
        .item(&new_activation)
        .item(&open_main_window)
        .separator()
        .item(&providers_header);

    if sorted.is_empty() {
        let empty = MenuItem::with_id(app, "tray.providers_empty", "No providers available", false, None::<&str>)
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
        tray.set_tooltip(Some(format!("MaDao SMS Platform · {active_count} active providers")))
            .map_err(|err| err.to_string())?;
        return Ok(());
    }

    let tray_icon = Image::from_bytes(include_bytes!("../icons/tray-icon.png"))
        .map_err(|err| err.to_string())?;
    TrayIconBuilder::with_id(TRAY_ID)
        .icon(tray_icon)
        .icon_as_template(true)
        .menu(&tray_menu)
        .show_menu_on_left_click(true)
        .tooltip(format!("MaDao SMS Platform · {active_count} active providers"))
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
            let result = show_main_window(app).and_then(|_| emit_menu_command(app, MenuCommandPayload::NewActivation));
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
        .enable_macos_default_menu(false)
        .manage(service)
        .invoke_handler(tauri::generate_handler![
            runtime_snapshot,
            list_provider_manifests,
            save_provider_manifest,
            reload_provider_registry,
            refresh_menu_bar,
            window_action
        ])
        .on_menu_event(|app, event| {
            handle_menu_event(app, event.id().as_ref());
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(move |app| {
            let app_handle = app.handle().clone();
            let service = app.state::<Arc<SmsService>>().inner().clone();
            let config = config.clone();
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
            }
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
        assert_eq!(menu_action_for_id(MENU_SCREEN_LOGS_ID), MenuAction::OpenScreen("logs"));
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
