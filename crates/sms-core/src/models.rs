use chrono::{DateTime, Utc};
use plugin_sdk::ProviderManifest;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};
use uuid::Uuid;

fn default_true() -> bool {
    true
}

fn default_execution_rounds() -> u32 {
    1
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
    pub acquire_path: AcquirePath,
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
pub struct RoutingReplaceRequest {
    pub ticket_id: String,
    #[serde(default)]
    pub reason: Option<String>,
    #[serde(default)]
    pub failed_item_id: Option<String>,
    #[serde(default = "default_release_action_cancel")]
    pub release_action: ReleaseAction,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ReleaseAction {
    Finish,
    Cancel,
    Retry,
    Ban,
}

fn default_release_action_cancel() -> ReleaseAction {
    ReleaseAction::Cancel
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
pub struct RoutingReplaceResponse {
    pub current_ticket_id: String,
    pub current_ticket_release: ReleaseCodeResponse,
    pub next_ticket: AcquireCodeResponse,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderBalance {
    pub provider: String,
    pub amount: f64,
    pub currency: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderBalanceCacheEntry {
    pub provider: String,
    pub amount: f64,
    pub currency: String,
    pub fetched_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderPriceQuery {
    pub provider: String,
    #[serde(default)]
    pub service: Option<String>,
    #[serde(default)]
    pub country: Option<String>,
    #[serde(default)]
    pub operator: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderPriceItem {
    pub country: String,
    pub display_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display_name_zh: Option<String>,
    pub operator: String,
    #[serde(default)]
    pub operator_label: Option<String>,
    #[serde(default)]
    pub provider_country: Option<String>,
    #[serde(default)]
    pub provider_operator: Option<String>,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label_zh: Option<String>,
    #[serde(default)]
    pub provider_value: Option<String>,
    #[serde(default)]
    pub icon_url: Option<String>,
    #[serde(default)]
    pub provider_icon_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderDynamicOptions {
    pub provider: String,
    #[serde(default)]
    pub raw_services: Vec<OptionItem>,
    #[serde(default)]
    pub raw_countries: Vec<OptionItem>,
    #[serde(default)]
    pub raw_operators: Vec<OptionItem>,
    pub services: Vec<OptionItem>,
    pub countries: Vec<OptionItem>,
    pub operators: Vec<OptionItem>,
    #[serde(default)]
    pub operators_by_country: BTreeMap<String, ProviderCountryOperatorOptions>,
    #[serde(default)]
    pub cache_state: OptionCacheState,
    #[serde(default)]
    pub fetched_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ProviderCountryOperatorOptions {
    #[serde(default)]
    pub raw_operators: Vec<OptionItem>,
    #[serde(default)]
    pub operators: Vec<OptionItem>,
    #[serde(default)]
    pub fetched_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptionListResponse {
    pub provider: String,
    pub items: Vec<OptionItem>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ProviderServicesQuery {
    #[serde(default)]
    pub country: Option<String>,
    #[serde(default)]
    pub operator: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ProviderOperatorsQuery {
    #[serde(default)]
    pub country: Option<String>,
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
pub struct ProviderRawOptionAuditEntry {
    pub provider: String,
    pub fetched_at: DateTime<Utc>,
    pub raw_services: Vec<OptionItem>,
    pub raw_countries: Vec<OptionItem>,
    pub raw_operators: Vec<OptionItem>,
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
    #[serde(default)]
    pub protocol_label: Option<String>,
    pub primary_endpoint: Option<String>,
    pub default_service: String,
    pub default_country: String,
    pub homepage: Option<String>,
    pub description: Option<String>,
    pub priority: u32,
    #[serde(default)]
    pub icon_url: Option<String>,
    #[serde(default)]
    pub badge_label: Option<String>,
    #[serde(default)]
    pub cancel_cooldown_sec: Option<u64>,
    #[serde(default)]
    pub operator_selectable: bool,
    #[serde(default)]
    pub option_cache_state: OptionCacheState,
    #[serde(default)]
    pub option_cache_fetched_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub balance: Option<f64>,
    #[serde(default)]
    pub balance_currency: Option<String>,
    #[serde(default)]
    pub balance_fetched_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub can_enable: bool,
    #[serde(default)]
    pub reuse_capabilities: Vec<String>,
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
pub struct ActivityFeed {
    pub items: Vec<ActivityEntry>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ActivityLevel {
    Info,
    Warn,
    Error,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ActivityKind {
    TicketEvent,
    RoutingEvent,
    ReleaseEvent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TicketListResponse {
    pub items: Vec<TicketRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TicketCallbackRegistrationRequest {
    pub url: String,
    #[serde(default)]
    pub secret: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TicketCallbackSubscription {
    pub id: String,
    pub ticket_id: String,
    pub url: String,
    #[serde(default)]
    pub secret: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TicketCallbackListResponse {
    pub items: Vec<TicketCallbackSubscription>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TicketCodeCallbackPayload {
    pub ticket_id: String,
    pub provider: String,
    pub service: String,
    pub country: String,
    pub phone_number: String,
    #[serde(default)]
    pub code: Option<String>,
    #[serde(default)]
    pub message: Option<String>,
    pub received_at: DateTime<Utc>,
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
    #[serde(default = "default_execution_rounds")]
    pub execution_rounds: u32,
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
    #[serde(default = "default_only_show_openai_sms_countries")]
    pub only_show_openai_sms_countries: bool,
    #[serde(default = "default_check_updates_on_launch")]
    pub check_updates_on_launch: bool,
    #[serde(default = "default_http_port")]
    pub http_port: u16,
    #[serde(default = "default_http_secret")]
    pub http_secret: String,
    #[serde(default = "default_stats_sync_instance_id")]
    pub stats_sync_instance_id: String,
    #[serde(default)]
    pub stats_sync_enabled: bool,
    #[serde(default)]
    pub stats_sync_base_url: String,
    #[serde(default)]
    pub stats_sync_api_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeSettingsUpdate {
    pub routing_strategy: String,
    pub auto_fallback: bool,
    pub option_cache_enabled: bool,
    pub option_cache_poll_interval_minutes: u32,
    pub only_show_openai_sms_countries: bool,
    pub check_updates_on_launch: bool,
    pub http_port: u16,
    #[serde(default)]
    pub stats_sync_enabled: bool,
    #[serde(default)]
    pub stats_sync_base_url: String,
    #[serde(default)]
    pub stats_sync_api_token: String,
}

fn default_only_show_openai_sms_countries() -> bool {
    false
}

fn default_check_updates_on_launch() -> bool {
    true
}

fn default_http_port() -> u16 {
    7822
}

fn default_http_secret() -> String {
    String::new()
}

fn default_stats_sync_instance_id() -> String {
    String::new()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeAccessInfo {
    pub http_port: u16,
    pub http_secret_overridden: bool,
    pub requires_http_login: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatsSyncResult {
    pub uploaded: u32,
    pub remaining: u32,
    pub status: StatsSyncStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RemoteStatsSummaryQuery {
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub service: Option<String>,
    #[serde(default)]
    pub country: Option<String>,
    #[serde(default)]
    pub operator: Option<String>,
    #[serde(default)]
    pub lookback_hours: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteStatsSummaryItem {
    pub provider: String,
    pub service: String,
    pub country: String,
    pub operator: String,
    pub total: u32,
    pub success_count: u32,
    pub success_rate: f64,
    pub cancelled_count: u32,
    pub banned_count: u32,
    pub failed_count: u32,
    #[serde(default)]
    pub avg_effective_price: Option<f64>,
    #[serde(default)]
    pub avg_receive_time_secs: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteStatsSummaryResponse {
    pub lookback_hours: u32,
    pub items: Vec<RemoteStatsSummaryItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpAuthLoginRequest {
    pub secret: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpAuthStatus {
    pub authenticated: bool,
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
pub struct ReusePoolClearResponse {
    pub provider: String,
    pub removed: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeSnapshot {
    pub providers: Vec<ProviderSummary>,
    pub tickets: Vec<TicketRecord>,
    pub logs: Vec<LogEntry>,
    #[serde(default)]
    pub reuse_pool: Vec<ReusePoolSummary>,
    #[serde(default)]
    pub activity: Vec<ActivityEntry>,
    #[serde(default)]
    pub stats_sync_status: Option<StatsSyncStatus>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum AcquirePath {
    #[default]
    FreshAcquire,
    ExactReuse,
    IntentReuse,
    SameActivationRetry,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TicketRecord {
    pub id: String,
    pub provider: String,
    pub service: String,
    pub country: String,
    #[serde(default)]
    pub operator: Option<String>,
    pub phone_number: String,
    #[serde(default)]
    pub upstream_id: Option<String>,
    #[serde(default)]
    pub price: Option<f64>,
    pub status: TicketStatus,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    #[serde(default)]
    pub acquire_path: AcquirePath,
    #[serde(default)]
    pub code: Option<String>,
    #[serde(default)]
    pub message: Option<String>,
    #[serde(default)]
    pub same_activation_retry_supported: bool,
    #[serde(default)]
    pub same_activation_retry_expires_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub pending_release_action: Option<ReleaseAction>,
    #[serde(default)]
    pub auto_release_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub next_release_attempt_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub release_retry_deadline_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub release_retry_count: u32,
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
    pub routing_execution_rounds: Option<u32>,
    #[serde(default)]
    pub routing_current_round: Option<u32>,
    #[serde(default)]
    pub routing_candidate_item_ids: Vec<String>,
    #[serde(default)]
    pub routing_attempt_count: u32,
    #[serde(default)]
    pub reuse_count: u32,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TicketStatsOutcome {
    Acquired,
    CodeReceived,
    Finished,
    Cancelled,
    CancelPending,
    Failed,
    Banned,
    RetryRequested,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TicketStatsEvent {
    pub id: String,
    pub ticket_id: String,
    pub provider: String,
    pub service: String,
    pub country: String,
    #[serde(default)]
    pub operator: Option<String>,
    pub outcome: TicketStatsOutcome,
    pub status: TicketStatus,
    pub occurred_at: DateTime<Utc>,
    #[serde(default)]
    pub price: Option<f64>,
    #[serde(default)]
    pub receive_duration_secs: Option<f64>,
    #[serde(default)]
    pub message: Option<String>,
    #[serde(default)]
    pub synced_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct StatsSyncStatus {
    #[serde(default)]
    pub pending_events: u32,
    #[serde(default)]
    pub last_attempt_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub last_success_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub last_error: Option<String>,
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
            operator: None,
            phone_number,
            upstream_id,
            price,
            status: TicketStatus::Pending,
            created_at: now,
            updated_at: now,
            acquire_path: AcquirePath::FreshAcquire,
            code: None,
            message: None,
            same_activation_retry_supported: false,
            same_activation_retry_expires_at: None,
            pending_release_action: None,
            auto_release_at: None,
            next_release_attempt_at: None,
            release_retry_deadline_at: None,
            release_retry_count: 0,
            routing_plan_id: None,
            routing_plan_name: None,
            routing_item_id: None,
            routing_item_index: None,
            routing_execution_mode: None,
            routing_execution_rounds: None,
            routing_current_round: None,
            routing_candidate_item_ids: Vec::new(),
            routing_attempt_count: 0,
            reuse_count: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TicketStatus {
    Pending,
    WaitingCode,
    CancelPending,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityEntry {
    pub id: String,
    pub timestamp: DateTime<Utc>,
    pub kind: ActivityKind,
    pub level: ActivityLevel,
    pub title: String,
    #[serde(default)]
    pub detail: Option<String>,
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub service: Option<String>,
    #[serde(default)]
    pub country: Option<String>,
    #[serde(default)]
    pub routing_plan_id: Option<String>,
    #[serde(default)]
    pub routing_plan_name: Option<String>,
    #[serde(default)]
    pub routing_item_id: Option<String>,
    #[serde(default)]
    pub routing_round: Option<u32>,
    #[serde(default)]
    pub ticket_id: Option<String>,
}

pub type ReuseKey = (String, String, String);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReusePoolEntry {
    #[serde(default)]
    pub reuse_key: Option<String>,
    pub phone_number: String,
    pub provider: String,
    pub service: String,
    pub country: String,
    pub upstream_id: Option<String>,
    pub reuse_count: u32,
    pub max_reuse: u32,
    pub last_used_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ReusePoolSummary {
    pub provider: String,
    pub service: String,
    pub country: String,
    #[serde(default)]
    pub active_count: u32,
    #[serde(default)]
    pub max_reuse: u32,
    #[serde(default)]
    pub last_used_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub expires_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RuntimeStateStore {
    #[serde(default)]
    pub tickets: Vec<TicketRecord>,
    #[serde(default)]
    pub logs: Vec<LogEntry>,
    #[serde(default)]
    pub activity: Vec<ActivityEntry>,
    #[serde(default)]
    pub provider_balance_cache: Vec<ProviderBalanceCacheEntry>,
    #[serde(default)]
    pub reuse_pool: HashMap<String, Vec<ReusePoolEntry>>,
    #[serde(default)]
    pub openai_sms_regions_cache: OpenAiSmsRegionsCache,
    #[serde(default)]
    pub ticket_stats_events: Vec<TicketStatsEvent>,
    #[serde(default)]
    pub stats_sync_status: StatsSyncStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct OpenAiSmsRegionsCache {
    #[serde(default)]
    pub sms_regions: Vec<String>,
    #[serde(default)]
    pub sms_only_regions: Vec<String>,
    #[serde(default)]
    pub whatsapp_regions: Vec<String>,
    #[serde(default)]
    pub all_regions: Vec<String>,
    #[serde(default)]
    pub fetched_at: Option<DateTime<Utc>>,
}

/// Three-provider reuse capability truth.
/// Locked rules:
/// - Retry != reuse: SameActivationRetry is NOT number-pool reuse
/// - SmsBower exact path deferred until evidence sufficient
/// - All three providers remain in final architecture
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ReuseCapability {
    ExactNumberReuse,
    IntentReuse,
    SameActivationRetry,
    Unsupported,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderCapabilityMatrix {
    capabilities: HashMap<String, Vec<ReuseCapability>>,
}

impl Default for ProviderCapabilityMatrix {
    fn default() -> Self {
        Self::new()
    }
}

impl ProviderCapabilityMatrix {
    pub fn new() -> Self {
        let mut capabilities = HashMap::new();
        capabilities.insert(
            "fivesim".to_string(),
            vec![
                ReuseCapability::ExactNumberReuse,
                ReuseCapability::IntentReuse,
            ],
        );
        capabilities.insert(
            "herosms".to_string(),
            vec![
                ReuseCapability::ExactNumberReuse,
                ReuseCapability::SameActivationRetry,
            ],
        );
        capabilities.insert(
            "smsbower".to_string(),
            vec![ReuseCapability::SameActivationRetry],
        );
        Self { capabilities }
    }

    pub fn capabilities_for(&self, provider_id: &str) -> &[ReuseCapability] {
        self.capabilities
            .get(provider_id)
            .map(|v| v.as_slice())
            .unwrap_or(&[])
    }

    pub fn supports(&self, provider_id: &str, cap: ReuseCapability) -> bool {
        self.capabilities_for(provider_id).contains(&cap)
    }
}
