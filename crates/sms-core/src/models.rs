use chrono::{DateTime, Utc};
use plugin_sdk::ProviderManifest;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use uuid::Uuid;

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcquireCodeRequest {
    pub provider: String,
    #[serde(default)]
    pub service: Option<String>,
    #[serde(default)]
    pub country: Option<String>,
    #[serde(default)]
    pub max_price: Option<f64>,
    #[serde(default)]
    pub min_price: Option<f64>,
    #[serde(default)]
    pub auto_pick_country: Option<bool>,
    #[serde(default)]
    pub reuse_phone: Option<bool>,
    #[serde(default)]
    pub reuse_key: Option<String>,
    #[serde(default)]
    pub metadata: BTreeMap<String, String>,
    #[serde(default)]
    pub routing_plan_id: Option<String>,
    #[serde(default)]
    pub routing_plan_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcquireCodeResponse {
    pub ticket_id: String,
    pub provider: String,
    pub service: String,
    pub country: String,
    pub phone_number: String,
    #[serde(default)]
    pub upstream_id: Option<String>,
    #[serde(default)]
    pub price: Option<f64>,
    pub status: TicketStatus,
    pub created_at: DateTime<Utc>,
    #[serde(default)]
    pub routing_plan_id: Option<String>,
    #[serde(default)]
    pub routing_plan_name: Option<String>,
    #[serde(default)]
    pub routing_item_id: Option<String>,
    #[serde(default)]
    pub routing_item_index: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PollCodeRequest {
    pub ticket_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PollCodeResponse {
    pub ticket_id: String,
    pub provider: String,
    pub status: TicketStatus,
    #[serde(default)]
    pub code: Option<String>,
    #[serde(default)]
    pub message: Option<String>,
    #[serde(default)]
    pub next_retry_after_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReleaseCodeRequest {
    pub ticket_id: String,
    pub action: ReleaseAction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoutingFailoverRequest {
    pub ticket_id: String,
    #[serde(default)]
    pub reason: Option<String>,
    #[serde(default)]
    pub failed_item_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReleaseAction {
    Finish,
    Cancel,
    Retry,
    Ban,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReleaseCodeResponse {
    pub ticket_id: String,
    pub provider: String,
    pub status: TicketStatus,
    #[serde(default)]
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderBalance {
    pub provider: String,
    pub amount: f64,
    pub currency: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderPriceQuery {
    pub provider: String,
    #[serde(default)]
    pub service: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderPriceItem {
    pub country: String,
    pub display_name: String,
    pub operator: String,
    pub price: f64,
    pub stock: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderPriceResponse {
    pub provider: String,
    pub service: String,
    pub items: Vec<ProviderPriceItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptionItem {
    pub value: String,
    pub label: String,
    pub hint: String,
    #[serde(default)]
    pub provider_value: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderDynamicOptions {
    pub provider: String,
    pub services: Vec<OptionItem>,
    pub countries: Vec<OptionItem>,
    pub operators: Vec<OptionItem>,
    #[serde(default)]
    pub cache_state: OptionCacheState,
    #[serde(default)]
    pub fetched_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum OptionCacheState {
    #[default]
    Missing,
    Fresh,
    Stale,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderOptionCacheEntry {
    pub provider: String,
    pub fetched_at: DateTime<Utc>,
    pub options: ProviderDynamicOptions,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptionCacheOverview {
    pub fresh_providers: u32,
    pub stale_providers: u32,
    pub missing_providers: u32,
    #[serde(default)]
    pub last_refresh_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderSummary {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub kind: String,
    pub protocol: String,
    pub primary_endpoint: Option<String>,
    pub default_service: String,
    pub default_country: String,
    pub homepage: Option<String>,
    pub description: Option<String>,
    pub priority: u32,
    #[serde(default)]
    pub option_cache_state: OptionCacheState,
    #[serde(default)]
    pub option_cache_fetched_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub can_enable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderPriorityEntry {
    pub id: String,
    pub priority: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderReorderRequest {
    pub order: Vec<ProviderPriorityEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderManifestList {
    pub manifests: Vec<ProviderManifest>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotificationFeed {
    pub items: Vec<LogEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowActionRequest {
    pub action: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum RoutingExecutionMode {
    #[default]
    Sequential,
    Random,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum RoutingPriceMode {
    #[default]
    Any,
    Range,
    Fixed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoutingPlanItem {
    pub id: String,
    pub provider: String,
    #[serde(default)]
    pub country: String,
    #[serde(default)]
    pub operator: String,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub price_mode: RoutingPriceMode,
    #[serde(default)]
    pub min_price: Option<f64>,
    #[serde(default)]
    pub max_price: Option<f64>,
    #[serde(default)]
    pub fixed_price: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoutingPlan {
    pub id: String,
    pub name: String,
    pub service: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub execution_mode: RoutingExecutionMode,
    #[serde(default)]
    pub items: Vec<RoutingPlanItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RoutingPlanStore {
    #[serde(default)]
    pub plans: Vec<RoutingPlan>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoutingPlanList {
    pub plans: Vec<RoutingPlan>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeSettings {
    pub routing_strategy: String,
    pub auto_fallback: bool,
    pub option_cache_enabled: bool,
    pub option_cache_poll_interval_minutes: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeSettingsUpdate {
    pub routing_strategy: String,
    pub auto_fallback: bool,
    pub option_cache_enabled: bool,
    pub option_cache_poll_interval_minutes: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderManifestSaveResponse {
    pub manifest: ProviderManifest,
    pub option_cache_state: OptionCacheState,
    #[serde(default)]
    pub option_cache_fetched_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub cache_refresh_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeSnapshot {
    pub providers: Vec<ProviderSummary>,
    pub tickets: Vec<TicketRecord>,
    pub logs: Vec<LogEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TicketRecord {
    pub id: String,
    pub provider: String,
    pub service: String,
    pub country: String,
    pub phone_number: String,
    #[serde(default)]
    pub upstream_id: Option<String>,
    #[serde(default)]
    pub price: Option<f64>,
    pub status: TicketStatus,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    #[serde(default)]
    pub code: Option<String>,
    #[serde(default)]
    pub message: Option<String>,
    #[serde(default)]
    pub routing_plan_id: Option<String>,
    #[serde(default)]
    pub routing_plan_name: Option<String>,
    #[serde(default)]
    pub routing_item_id: Option<String>,
    #[serde(default)]
    pub routing_item_index: Option<usize>,
    #[serde(default)]
    pub routing_execution_mode: Option<RoutingExecutionMode>,
    #[serde(default)]
    pub routing_candidate_item_ids: Vec<String>,
    #[serde(default)]
    pub routing_attempt_count: u32,
}

impl TicketRecord {
    pub fn new(
        provider: String,
        service: String,
        country: String,
        phone_number: String,
        upstream_id: Option<String>,
        price: Option<f64>,
    ) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::now_v7().to_string(),
            provider,
            service,
            country,
            phone_number,
            upstream_id,
            price,
            status: TicketStatus::Pending,
            created_at: now,
            updated_at: now,
            code: None,
            message: None,
            routing_plan_id: None,
            routing_plan_name: None,
            routing_item_id: None,
            routing_item_index: None,
            routing_execution_mode: None,
            routing_candidate_item_ids: Vec::new(),
            routing_attempt_count: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TicketStatus {
    Pending,
    WaitingCode,
    CodeReceived,
    Finished,
    Cancelled,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub timestamp: DateTime<Utc>,
    pub scope: String,
    pub level: String,
    pub message: String,
}
