use crate::error::SmsError;
use crate::models::{RoutingPlanItem, RoutingPlanStore, RuntimeSettings};
use crate::options::{canonical_country_key, canonical_service_key};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub const ROUTING_PLANS_FILE_NAME: &str = "routing-plans.json";
pub const RUNTIME_DB_FILE_NAME: &str = "runtime.db";
pub const RUNTIME_SETTINGS_FILE_NAME: &str = "runtime-settings.json";
pub const PROVIDER_OPTIONS_CACHE_FILE_NAME: &str = "provider-options-cache.json";
pub const PROVIDER_OPTIONS_RAW_AUDIT_FILE_NAME: &str = "provider-options-raw.json";

#[derive(Debug, Clone)]
pub struct AppPersistencePaths {
    pub runtime_settings_path: PathBuf,
    pub runtime_db_path: PathBuf,
    pub provider_options_path: PathBuf,
    pub provider_options_raw_path: PathBuf,
    pub routing_plans_path: PathBuf,
}

impl AppPersistencePaths {
    pub fn from_config_dir(config_dir: &Path) -> Self {
        Self {
            runtime_settings_path: config_dir.join(RUNTIME_SETTINGS_FILE_NAME),
            runtime_db_path: config_dir.join(RUNTIME_DB_FILE_NAME),
            provider_options_path: config_dir.join(PROVIDER_OPTIONS_CACHE_FILE_NAME),
            provider_options_raw_path: config_dir.join(PROVIDER_OPTIONS_RAW_AUDIT_FILE_NAME),
            routing_plans_path: config_dir.join(ROUTING_PLANS_FILE_NAME),
        }
    }
}

#[derive(Debug, Clone)]
pub struct RuntimeConfigState {
    pub settings: RuntimeSettings,
    pub routing_plans: RoutingPlanStore,
}

pub trait RuntimeConfigRepository: Send + Sync {
    fn load_state(&self) -> Result<RuntimeConfigState, SmsError>;
    fn save_settings(&self, settings: &RuntimeSettings) -> Result<(), SmsError>;
    fn save_routing_plans(&self, store: &RoutingPlanStore) -> Result<(), SmsError>;
    fn ensure_settings_persisted(&self, settings: &RuntimeSettings) -> Result<(), SmsError>;
}

#[derive(Debug, Clone, Default)]
pub struct FileRuntimeConfigRepository {
    runtime_settings_path: Option<PathBuf>,
    routing_plans_path: Option<PathBuf>,
}

impl FileRuntimeConfigRepository {
    pub fn new(runtime_settings_path: Option<PathBuf>, routing_plans_path: Option<PathBuf>) -> Self {
        let routing_plans_path = routing_plans_path.or_else(|| {
            runtime_settings_path.as_ref().and_then(|path| {
                path.parent()
                    .map(|parent| parent.join(ROUTING_PLANS_FILE_NAME))
            })
        });
        Self {
            runtime_settings_path,
            routing_plans_path,
        }
    }
}

impl RuntimeConfigRepository for FileRuntimeConfigRepository {
    fn load_state(&self) -> Result<RuntimeConfigState, SmsError> {
        let settings = self
            .runtime_settings_path
            .as_deref()
            .and_then(|path| load_runtime_settings(path).ok())
            .unwrap_or_else(default_runtime_settings);
        let routing_plans = self
            .routing_plans_path
            .as_deref()
            .and_then(|path| load_routing_plans(path).ok())
            .unwrap_or_default();
        Ok(RuntimeConfigState {
            settings,
            routing_plans,
        })
    }

    fn save_settings(&self, settings: &RuntimeSettings) -> Result<(), SmsError> {
        let Some(path) = self.runtime_settings_path.as_deref() else {
            return Ok(());
        };
        save_runtime_settings(path, settings)
    }

    fn save_routing_plans(&self, store: &RoutingPlanStore) -> Result<(), SmsError> {
        let Some(path) = self.routing_plans_path.as_deref() else {
            return Ok(());
        };
        save_routing_plans(path, store)
    }

    fn ensure_settings_persisted(&self, settings: &RuntimeSettings) -> Result<(), SmsError> {
        self.save_settings(settings)
    }
}

pub fn load_runtime_settings(path: &Path) -> Result<RuntimeSettings, SmsError> {
    let content = fs::read_to_string(path)
        .map_err(|err| SmsError::Io(format!("read runtime settings failed: {err}")))?;
    serde_json::from_str(&content)
        .map_err(|err| SmsError::Config(format!("parse runtime settings failed: {err}")))
}

pub fn load_runtime_settings_from_disk(path: &Path) -> Result<RuntimeSettings, SmsError> {
    load_runtime_settings(path)
}

pub fn default_runtime_settings() -> RuntimeSettings {
    RuntimeSettings {
        routing_strategy: "ordered_priority".to_string(),
        auto_fallback: true,
        option_cache_enabled: true,
        option_cache_poll_interval_minutes: 30,
        only_show_openai_sms_countries: false,
        check_updates_on_launch: true,
        http_port: 7822,
        http_secret: generate_runtime_secret(),
    }
}

pub fn save_runtime_settings(path: &Path, settings: &RuntimeSettings) -> Result<(), SmsError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| SmsError::Io(format!("create runtime settings dir failed: {err}")))?;
    }
    let content = serde_json::to_string_pretty(settings)
        .map_err(|err| SmsError::Config(format!("serialize runtime settings failed: {err}")))?;
    fs::write(path, content)
        .map_err(|err| SmsError::Io(format!("write runtime settings failed: {err}")))
}

pub fn normalize_routing_plan_service(plan: &mut crate::models::RoutingPlan) -> bool {
    let canonical = canonical_service_key(&plan.service, Some(&plan.service));
    if plan.service == canonical {
        return false;
    }
    plan.service = canonical;
    true
}

pub fn normalize_routing_plan_country(country: &mut String) -> bool {
    let canonical = canonical_country_key(country, Some(country.as_str()), None);
    if *country == canonical {
        return false;
    }
    *country = canonical;
    true
}

pub fn normalize_routing_plan_item(item: &mut RoutingPlanItem) -> bool {
    normalize_routing_plan_country(&mut item.country)
}

pub fn normalize_loaded_routing_plans(mut store: RoutingPlanStore) -> (RoutingPlanStore, bool) {
    let mut changed = false;
    for plan in &mut store.plans {
        changed |= normalize_routing_plan_service(plan);
        for item in &mut plan.items {
            changed |= normalize_routing_plan_item(item);
        }
    }
    (store, changed)
}

pub fn load_routing_plans(path: &Path) -> Result<RoutingPlanStore, SmsError> {
    if !path.exists() {
        return Ok(RoutingPlanStore::default());
    }
    let content = fs::read_to_string(path)
        .map_err(|err| SmsError::Io(format!("read routing plans failed: {err}")))?;
    serde_json::from_str(&content)
        .map_err(|err| SmsError::Config(format!("parse routing plans failed: {err}")))
}

pub fn save_routing_plans(path: &Path, store: &RoutingPlanStore) -> Result<(), SmsError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| SmsError::Io(format!("create routing plans dir failed: {err}")))?;
    }
    let content = serde_json::to_string_pretty(store)
        .map_err(|err| SmsError::Config(format!("serialize routing plans failed: {err}")))?;
    fs::write(path, content)
        .map_err(|err| SmsError::Io(format!("write routing plans failed: {err}")))
}

fn generate_runtime_secret() -> String {
    Uuid::now_v7().simple().to_string()
}
