use crate::error::SmsError;
use crate::models::{
    AcquireCodeRequest, AcquireCodeResponse, AcquirePath, ActivityEntry, ActivityFeed,
    ActivityKind, ActivityLevel, LogEntry, NotificationFeed, OpenAiSmsRegionsCache,
    OptionCacheOverview, OptionCacheState, OptionItem, OptionListResponse, PollCodeRequest,
    PollCodeResponse, ProviderBalance, ProviderBalanceCacheEntry, ProviderCapabilityMatrix,
    ProviderDynamicOptions, ProviderManifestList, ProviderManifestSaveResponse,
    ProviderOperatorsQuery, ProviderOptionCacheEntry, ProviderPriceQuery, ProviderPriceResponse,
    ProviderRawOptionAuditEntry, ProviderReorderRequest, ProviderServicesQuery, ProviderSummary,
    ReleaseCodeRequest, ReleaseCodeResponse, RemoteStatsSummaryItem, RemoteStatsSummaryQuery,
    RemoteStatsSummaryResponse, ReuseCapability, ReusePoolEntry, ReusePoolSummary,
    RoutingExecutionMode, RoutingFailoverRequest, RoutingPlan, RoutingPlanItem, RoutingPlanList,
    RoutingPlanStore, RoutingReplaceRequest, RoutingReplaceResponse, RuntimeAccessInfo,
    RuntimeSettings, RuntimeSettingsUpdate, RuntimeSnapshot, RuntimeStateStore, StatsSyncResult,
    StatsSyncStatus, TicketCallbackListResponse, TicketCallbackRegistrationRequest,
    TicketCallbackSubscription, TicketCodeCallbackPayload, TicketListResponse, TicketRecord,
    TicketStatsEvent, TicketStatsOutcome, TicketStatus,
};
use crate::options::{
    FileProviderMetadataCacheRepository, OptionKind, ProviderMetadataCacheBatch,
    ProviderMetadataCacheRepository, ProviderMetadataCacheState, ProviderOptionCacheStore,
    ProviderRawOptionAuditStore, build_cache_overview, cache_state, canonical_country_key,
    canonical_service_key, normalize_loaded_provider_options, normalize_operator_options,
    normalize_price_items, normalize_provider_options, normalize_ticket_record,
    operator_country_cache_key, resolve_provider_operator_value, resolve_provider_value,
    with_cache_state,
};
use crate::registry::ProviderRegistry;
use crate::runtime_config::{
    AppPersistencePaths, DEFAULT_STATS_SYNC_API_TOKEN, DEFAULT_STATS_SYNC_BASE_URL,
    FileRuntimeConfigRepository, RuntimeConfigRepository, RuntimeConfigState,
    default_runtime_settings, normalize_loaded_routing_plans, normalize_routing_plan_item,
    normalize_routing_plan_service,
};
use crate::runtime_store::{
    ReleaseCoordinationRepository, RuntimeRepositories, RuntimeStateRepository, RuntimeStore,
    RuntimeStoreApplyOptions, RuntimeStoreBatch,
};
use chrono::{Duration, Utc};
use parking_lot::RwLock;
use plugin_sdk::ProviderManifest;
use reqwest::Client;
use serde::Deserialize;
use std::collections::{BTreeMap, HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::Arc;
use url::Url;
use uuid::Uuid;

const ROUTING_ANY_PROVIDER: &str = "any";
const DEFAULT_TICKET_BUFFER: usize = 500;
const DEFAULT_ACTIVITY_BUFFER: usize = 200;
const SNAPSHOT_ACTIVITY_LIMIT: usize = 50;
const DEFAULT_NOTIFICATION_FEED_LIMIT: usize = 20;
const AUTO_RELEASE_RETRY_INTERVAL_SEC: i64 = 5;
const AUTO_RELEASE_OWNER_LEASE_SEC: i64 = 15;
const DEFAULT_REUSE_TTL_HOURS: i64 = 24;
const OPENAI_AUTH_BOOTSTRAP_URL: &str = "https://auth.openai.com";
const OPENAI_SMS_REGIONS_CACHE_TTL_HOURS: i64 = 24;
const OPENAI_SMS_DYNAMIC_CONFIG_KEY: &str =
    "phone-verification-sms-regions-by-verification-channel";
const LOW_BALANCE_PATTERNS: [&str; 8] = [
    "no balance",
    "not enough balance",
    "insufficient balance",
    "low balance",
    "balance too low",
    "not enough funds",
    "insufficient funds",
    "balance below",
];

fn normalize_stats_summary_snapshot_lookback(lookback_hours: Option<u32>) -> Option<u32> {
    let lookback_hours = lookback_hours.unwrap_or(24);
    matches!(lookback_hours, 24 | 72 | 168).then_some(lookback_hours)
}

fn optional_filter_matches(filter: &Option<String>, value: &str) -> bool {
    filter
        .as_ref()
        .map(|candidate| {
            let candidate = candidate.trim();
            candidate.is_empty() || candidate == value
        })
        .unwrap_or(true)
}

fn filter_remote_stats_summary_snapshot(
    mut snapshot: RemoteStatsSummaryResponse,
    query: &RemoteStatsSummaryQuery,
) -> RemoteStatsSummaryResponse {
    snapshot.items = snapshot
        .items
        .into_iter()
        .filter(|item| remote_stats_summary_item_matches(item, query))
        .collect();
    snapshot
}

fn remote_stats_summary_item_matches(
    item: &RemoteStatsSummaryItem,
    query: &RemoteStatsSummaryQuery,
) -> bool {
    optional_filter_matches(&query.provider, &item.provider)
        && optional_filter_matches(&query.service, &item.service)
        && optional_filter_matches(&query.country, &item.country)
        && optional_filter_matches(&query.operator, &item.operator)
}

fn is_legacy_stats_sync_base_url(value: &str) -> bool {
    let trimmed = value.trim().trim_end_matches('/');
    Url::parse(trimmed)
        .ok()
        .and_then(|url| url.host_str().map(str::to_string))
        .is_some_and(|host| host == "madao-stats.example.workers.dev")
}

fn repair_runtime_settings_with_defaults(
    runtime_settings: &mut RuntimeSettings,
    default_stats_sync_base_url: &str,
    default_stats_sync_api_token: &str,
) -> bool {
    let mut repaired = false;
    if runtime_settings.http_secret.trim().is_empty() {
        runtime_settings.http_secret = generate_runtime_secret();
        repaired = true;
    }
    if runtime_settings.stats_sync_base_url.trim().is_empty()
        || is_legacy_stats_sync_base_url(&runtime_settings.stats_sync_base_url)
    {
        runtime_settings.stats_sync_base_url = default_stats_sync_base_url.to_string();
        repaired = true;
    }
    if runtime_settings.stats_sync_instance_id.trim().is_empty() {
        runtime_settings.stats_sync_instance_id = Uuid::now_v7().to_string();
        repaired = true;
    }
    if !default_stats_sync_api_token.is_empty() {
        let current_token = runtime_settings.stats_sync_api_token.trim();
        if current_token.is_empty() || current_token == "replace-me" {
            runtime_settings.stats_sync_api_token = default_stats_sync_api_token.to_string();
            repaired = true;
        }
    }
    repaired
}

fn repair_runtime_settings(runtime_settings: &mut RuntimeSettings) -> bool {
    repair_runtime_settings_with_defaults(
        runtime_settings,
        DEFAULT_STATS_SYNC_BASE_URL,
        DEFAULT_STATS_SYNC_API_TOKEN,
    )
}

fn parse_min_activation_time_seconds(message: &str) -> Option<u64> {
    let marker = "minActivationTime=";
    let start = message.find(marker)? + marker.len();
    let rest = &message[start..];
    let digits = rest
        .chars()
        .take_while(|char| char.is_ascii_digit())
        .collect::<String>();
    if digits.is_empty() {
        return None;
    }
    digits.parse::<u64>().ok()
}

fn auto_release_retry_limit(min_activation_time_sec: u64) -> u32 {
    (((min_activation_time_sec as f64) / (AUTO_RELEASE_RETRY_INTERVAL_SEC as f64)).ceil() as u32)
        .max(1)
}

fn is_terminal_cancel_status(message: &str) -> bool {
    let upper = message.trim().to_ascii_uppercase();
    upper.contains("STATUS_CANCEL") || upper.contains("NO_ACTIVATION")
}

pub struct SmsService {
    registry: Arc<RwLock<ProviderRegistry>>,
    tickets: RwLock<BTreeMap<String, TicketRecord>>,
    logs: RwLock<VecDeque<LogEntry>>,
    activity: RwLock<VecDeque<ActivityEntry>>,
    runtime_settings: RwLock<RuntimeSettings>,
    runtime_config_repository: Arc<dyn RuntimeConfigRepository>,
    runtime_state_repository: Arc<dyn RuntimeStateRepository>,
    release_coordination_repository: Arc<dyn ReleaseCoordinationRepository>,
    provider_metadata_cache_repository: Arc<dyn ProviderMetadataCacheRepository>,
    routing_plans: RwLock<RoutingPlanStore>,
    provider_option_cache: RwLock<ProviderOptionCacheStore>,
    provider_raw_option_audit: RwLock<ProviderRawOptionAuditStore>,
    provider_balance_cache: RwLock<BTreeMap<String, ProviderBalanceCacheEntry>>,
    reuse_pool: RwLock<HashMap<String, Vec<ReusePoolEntry>>>,
    openai_sms_regions_cache: RwLock<OpenAiSmsRegionsCache>,
    ticket_stats_events: RwLock<VecDeque<TicketStatsEvent>>,
    stats_sync_status: RwLock<StatsSyncStatus>,
    callback_subscriptions: RwLock<BTreeMap<String, Vec<TicketCallbackSubscription>>>,
    callback_client: Client,
    log_buffer: usize,
    ticket_buffer: usize,
    activity_buffer: usize,
}

struct AcquireTicketRuntimeEffect {
    ticket: TicketRecord,
    uow: RuntimeUnitOfWork,
}

struct AcquireTicketRuntimeError {
    error: SmsError,
    uow: Option<RuntimeUnitOfWork>,
}

struct RoutingAcquireRuntimeEffect {
    response: AcquireCodeResponse,
    uow: RuntimeUnitOfWork,
}

struct RoutingAcquireRuntimeError {
    error: SmsError,
    uow: Option<RuntimeUnitOfWork>,
}

struct AcquireCodeRuntimeEffect {
    response: AcquireCodeResponse,
    uow: RuntimeUnitOfWork,
}

struct AcquireCodeRuntimeError {
    error: SmsError,
    uow: Option<RuntimeUnitOfWork>,
}

struct SameActivationRetryRuntimeEffect {
    response: Option<AcquireCodeResponse>,
    uow: RuntimeUnitOfWork,
}

struct SameActivationRetryRuntimeError {
    error: SmsError,
    uow: Option<RuntimeUnitOfWork>,
}

struct ReleaseRuntimeEffect {
    response: ReleaseCodeResponse,
    uow: RuntimeUnitOfWork,
}

struct ReleaseRuntimeError {
    error: SmsError,
    uow: Option<RuntimeUnitOfWork>,
}

fn stats_outcome_for_status(status: &TicketStatus) -> Option<TicketStatsOutcome> {
    match status {
        TicketStatus::Pending => None,
        TicketStatus::WaitingCode => Some(TicketStatsOutcome::RetryRequested),
        TicketStatus::CancelPending => Some(TicketStatsOutcome::CancelPending),
        TicketStatus::CodeReceived => Some(TicketStatsOutcome::CodeReceived),
        TicketStatus::Finished => Some(TicketStatsOutcome::Finished),
        TicketStatus::Cancelled => Some(TicketStatsOutcome::Cancelled),
        TicketStatus::Failed => Some(TicketStatsOutcome::Failed),
    }
}

struct ProviderOptionsRuntimeEffect {
    response: ProviderDynamicOptions,
    uow: RuntimeUnitOfWork,
}

struct ProviderOptionsRuntimeError {
    error: SmsError,
    uow: Option<RuntimeUnitOfWork>,
}

struct ProviderBalanceRuntimeEffect {
    response: ProviderBalance,
    uow: RuntimeUnitOfWork,
}

struct ProviderBalanceRuntimeError {
    error: SmsError,
    uow: Option<RuntimeUnitOfWork>,
}

struct ProviderPricesRuntimeEffect {
    response: ProviderPriceResponse,
    uow: RuntimeUnitOfWork,
}

struct ProviderPricesRuntimeError {
    error: SmsError,
    uow: Option<RuntimeUnitOfWork>,
}

#[derive(Debug, Deserialize)]
struct OpenAiBootstrapPage {
    #[serde(rename = "track")]
    _track: Option<String>,
    #[serde(rename = "statsigClientInitData")]
    statsig_client_init_data: OpenAiStatsigClientInitData,
}

#[derive(Debug, Deserialize)]
struct OpenAiStatsigClientInitData {
    bootstrap: String,
}

#[derive(Debug, Deserialize)]
struct OpenAiStatsigBootstrap {
    #[serde(default)]
    dynamic_configs: BTreeMap<String, OpenAiDynamicConfigEntry>,
}

#[derive(Debug, Deserialize)]
struct OpenAiDynamicConfigEntry {
    value: OpenAiSmsRegionsPayload,
}

#[derive(Debug, Deserialize, Default)]
struct OpenAiSmsRegionsPayload {
    #[serde(default)]
    sms: Vec<String>,
    #[serde(default)]
    whatsapp: Vec<String>,
}

#[derive(Default)]
struct RuntimeUnitOfWork {
    batch: RuntimeStoreBatch,
}

#[derive(Default)]
struct PreparedReuseRequest {
    exact_candidate: Option<ReusePoolEntry>,
    cleaned_bucket: Option<(String, Vec<ReusePoolEntry>)>,
}

impl SmsService {
    fn persistence_warning_entry(
        &self,
        scope: impl Into<String>,
        message: impl Into<String>,
    ) -> LogEntry {
        self.log_entry(scope, "warn", message)
    }

    fn record_persistence_warning(&self, scope: impl Into<String>, message: impl Into<String>) {
        let entry = self.persistence_warning_entry(scope, message);
        self.push_log_entry_in_memory(entry.clone());
        self.persist_runtime_batch(RuntimeStoreBatch {
            log_entries: vec![entry],
            ..RuntimeStoreBatch::default()
        });
    }

    fn with_runtime_repositories(
        registry: ProviderRegistry,
        log_buffer: usize,
        runtime_config_repository: Arc<dyn RuntimeConfigRepository>,
        runtime_repositories: RuntimeRepositories,
        provider_metadata_cache_repository: Arc<dyn ProviderMetadataCacheRepository>,
    ) -> Self {
        let mut startup_warnings = Vec::new();
        let RuntimeRepositories {
            state: runtime_state_repository,
            release_coordination: release_coordination_repository,
        } = runtime_repositories;
        let RuntimeConfigState {
            settings: runtime_settings,
            routing_plans,
        } = match runtime_config_repository.load_state() {
            Ok(state) => state,
            Err(error) => {
                startup_warnings.push(format!("runtime config load degraded to defaults: {error}"));
                RuntimeConfigState {
                    settings: default_runtime_settings(),
                    routing_plans: RoutingPlanStore::default(),
                }
            }
        };
        let mut runtime_settings = runtime_settings;
        let runtime_settings_repaired = repair_runtime_settings(&mut runtime_settings);
        if runtime_settings_repaired {
            if let Err(error) = runtime_config_repository.save_settings(&runtime_settings) {
                startup_warnings.push(format!(
                    "runtime settings persistence failed during startup repair: {error}"
                ));
            }
        }
        let ProviderMetadataCacheState {
            option_cache: provider_option_cache,
            raw_option_audit: provider_raw_option_audit,
        } = provider_metadata_cache_repository
            .load_state()
            .unwrap_or_default();
        let (provider_option_cache, provider_option_cache_recanonicalized) = {
            let registry_ref = &registry;
            let mut normalized_store = ProviderOptionCacheStore::default();
            let mut changed = false;
            for (provider_id, entry) in provider_option_cache.entries {
                if let Ok(manifest) = registry_ref.manifest(&provider_id) {
                    let original_options = entry.options.clone();
                    let normalized_options =
                        normalize_loaded_provider_options(&manifest, entry.options);
                    let original_serialized = serde_json::to_string(&original_options).ok();
                    let normalized_serialized = serde_json::to_string(&normalized_options).ok();
                    changed |= original_serialized != normalized_serialized;
                    normalized_store.entries.insert(
                        provider_id.clone(),
                        ProviderOptionCacheEntry {
                            options: normalized_options,
                            ..entry
                        },
                    );
                } else {
                    normalized_store.entries.insert(provider_id, entry);
                }
            }
            (normalized_store, changed)
        };
        if provider_option_cache_recanonicalized {
            let _ = provider_metadata_cache_repository.apply_batch(&ProviderMetadataCacheBatch {
                option_cache: Some(provider_option_cache.clone()),
                ..ProviderMetadataCacheBatch::default()
            });
        }
        let runtime_state = runtime_state_repository.load_state().unwrap_or_default();
        let (routing_plans, routing_plans_recanonicalized) =
            normalize_loaded_routing_plans(routing_plans);
        if routing_plans_recanonicalized {
            if let Err(error) = runtime_config_repository.save_routing_plans(&routing_plans) {
                startup_warnings.push(format!(
                    "routing plan recanonicalize persistence failed: {error}"
                ));
            }
        }
        let RuntimeStateStore {
            tickets,
            logs,
            activity,
            provider_balance_cache,
            reuse_pool,
            openai_sms_regions_cache,
            ticket_stats_events,
            stats_sync_status,
            ..
        } = runtime_state;
        let (runtime_tickets, reuse_pool, runtime_state_recanonicalized) =
            normalize_runtime_state(tickets, reuse_pool);
        let runtime_logs = normalize_runtime_logs(logs, log_buffer);
        let runtime_activity = normalize_runtime_activity(activity, DEFAULT_ACTIVITY_BUFFER);
        let runtime_balances = provider_balance_cache
            .into_iter()
            .map(|entry| (entry.provider.clone(), entry))
            .collect::<BTreeMap<_, _>>();
        if runtime_state_recanonicalized {
            let _ = runtime_state_repository.replace_state(&RuntimeStateStore {
                tickets: runtime_tickets.values().cloned().collect(),
                logs: runtime_logs.iter().cloned().collect(),
                activity: runtime_activity.iter().cloned().collect(),
                provider_balance_cache: runtime_balances.values().cloned().collect(),
                reuse_pool: reuse_pool.clone(),
                openai_sms_regions_cache: openai_sms_regions_cache.clone(),
                ticket_stats_events: ticket_stats_events.clone(),
                stats_sync_status: stats_sync_status.clone(),
            });
        }

        let service = Self {
            registry: Arc::new(RwLock::new(registry)),
            tickets: RwLock::new(runtime_tickets),
            logs: RwLock::new(runtime_logs),
            activity: RwLock::new(runtime_activity),
            runtime_settings: RwLock::new(runtime_settings),
            runtime_config_repository,
            runtime_state_repository,
            release_coordination_repository,
            provider_metadata_cache_repository,
            routing_plans: RwLock::new(routing_plans),
            provider_option_cache: RwLock::new(provider_option_cache),
            provider_raw_option_audit: RwLock::new(provider_raw_option_audit),
            provider_balance_cache: RwLock::new(runtime_balances),
            reuse_pool: RwLock::new(reuse_pool),
            openai_sms_regions_cache: RwLock::new(openai_sms_regions_cache),
            ticket_stats_events: RwLock::new(ticket_stats_events.into()),
            stats_sync_status: RwLock::new(stats_sync_status),
            callback_subscriptions: RwLock::new(BTreeMap::new()),
            callback_client: Client::builder()
                .timeout(std::time::Duration::from_secs(10))
                .build()
                .unwrap_or_else(|_| Client::new()),
            log_buffer,
            ticket_buffer: DEFAULT_TICKET_BUFFER,
            activity_buffer: DEFAULT_ACTIVITY_BUFFER,
        };
        for message in startup_warnings {
            service.record_persistence_warning("config", message);
        }
        service
    }

    fn log_entry(
        &self,
        scope: impl Into<String>,
        level: impl Into<String>,
        message: impl Into<String>,
    ) -> LogEntry {
        LogEntry {
            timestamp: Utc::now(),
            scope: scope.into(),
            level: level.into(),
            message: message.into(),
        }
    }

    fn push_log_entry_in_memory(&self, entry: LogEntry) {
        let mut logs = self.logs.write();
        logs.push_back(entry);
        while logs.len() > self.log_buffer {
            logs.pop_front();
        }
    }

    fn push_activity_entry_in_memory(&self, entry: ActivityEntry) {
        let mut activity = self.activity.write();
        activity.push_back(entry);
        while activity.len() > self.activity_buffer {
            activity.pop_front();
        }
    }

    fn update_ticket_in_memory(
        &self,
        ticket_id: &str,
        updater: impl FnOnce(&mut TicketRecord),
    ) -> Result<TicketRecord, SmsError> {
        let mut tickets = self.tickets.write();
        let ticket = tickets
            .get_mut(ticket_id)
            .ok_or_else(|| SmsError::InvalidRequest(format!("unknown ticket {ticket_id}")))?;
        updater(ticket);
        Ok(ticket.clone())
    }

    fn ticket_activity_entry(
        &self,
        kind: ActivityKind,
        level: ActivityLevel,
        title: String,
        detail: Option<String>,
        ticket: &TicketRecord,
    ) -> ActivityEntry {
        ActivityEntry {
            id: Uuid::now_v7().to_string(),
            timestamp: Utc::now(),
            kind,
            level,
            title,
            detail,
            provider: Some(ticket.provider.clone()),
            service: Some(ticket.service.clone()),
            country: Some(ticket.country.clone()),
            routing_plan_id: ticket.routing_plan_id.clone(),
            routing_plan_name: ticket.routing_plan_name.clone(),
            routing_item_id: ticket.routing_item_id.clone(),
            routing_round: ticket.routing_current_round,
            ticket_id: Some(ticket.id.clone()),
        }
    }

    fn routing_activity_entry(
        &self,
        level: ActivityLevel,
        title: String,
        detail: Option<String>,
        provider: Option<String>,
        service: Option<String>,
        country: Option<String>,
        plan: &RoutingPlan,
        item: &RoutingPlanItem,
        round: u32,
        ticket_id: Option<String>,
    ) -> ActivityEntry {
        ActivityEntry {
            id: Uuid::now_v7().to_string(),
            timestamp: Utc::now(),
            kind: ActivityKind::RoutingEvent,
            level,
            title,
            detail,
            provider,
            service,
            country,
            routing_plan_id: Some(plan.id.clone()),
            routing_plan_name: Some(plan.name.clone()),
            routing_item_id: Some(item.id.clone()),
            routing_round: Some(round),
            ticket_id,
        }
    }

    pub fn new(registry: ProviderRegistry, log_buffer: usize) -> Self {
        Self::with_persistence_paths(registry, log_buffer, None, None, None, None, None)
    }

    pub fn with_runtime_settings_path(
        registry: ProviderRegistry,
        log_buffer: usize,
        runtime_settings_path: Option<PathBuf>,
    ) -> Self {
        Self::with_persistence_paths(
            registry,
            log_buffer,
            runtime_settings_path,
            None,
            None,
            None,
            None,
        )
    }

    pub fn with_persistence_paths(
        registry: ProviderRegistry,
        log_buffer: usize,
        runtime_settings_path: Option<PathBuf>,
        runtime_db_path: Option<PathBuf>,
        provider_options_path: Option<PathBuf>,
        provider_options_raw_path: Option<PathBuf>,
        routing_plans_path: Option<PathBuf>,
    ) -> Self {
        let derived_paths = runtime_settings_path
            .as_ref()
            .and_then(|path| path.parent().map(AppPersistencePaths::from_config_dir));
        let runtime_db_path = runtime_db_path.or_else(|| {
            derived_paths
                .as_ref()
                .map(|paths| paths.runtime_db_path.clone())
        });
        let provider_options_path = provider_options_path.or_else(|| {
            derived_paths
                .as_ref()
                .map(|paths| paths.provider_options_path.clone())
        });
        let provider_options_raw_path = provider_options_raw_path.or_else(|| {
            derived_paths
                .as_ref()
                .map(|paths| paths.provider_options_raw_path.clone())
        });
        let routing_plans_path = routing_plans_path.or_else(|| {
            derived_paths
                .as_ref()
                .map(|paths| paths.routing_plans_path.clone())
        });
        let runtime_repositories = runtime_db_path
            .as_ref()
            .and_then(|path| RuntimeStore::open(path).ok())
            .unwrap_or_else(RuntimeStore::in_memory)
            .repositories();
        let runtime_config_repository = Arc::new(FileRuntimeConfigRepository::new(
            runtime_settings_path,
            routing_plans_path,
        ));
        let provider_metadata_cache_repository =
            Arc::new(FileProviderMetadataCacheRepository::new(
                provider_options_path,
                provider_options_raw_path,
            ));
        Self::with_runtime_repositories(
            registry,
            log_buffer,
            runtime_config_repository,
            runtime_repositories,
            provider_metadata_cache_repository,
        )
    }

    pub fn ensure_runtime_settings_persisted(&self) {
        let _ = self
            .runtime_config_repository
            .ensure_settings_persisted(&self.runtime_settings());
    }

    pub fn openai_sms_regions_cache(&self) -> OpenAiSmsRegionsCache {
        self.openai_sms_regions_cache.read().clone()
    }

    pub fn openai_sms_region_codes(&self) -> Vec<String> {
        self.openai_sms_regions_cache().sms_regions
    }

    pub async fn get_openai_sms_regions_cache(&self) -> OpenAiSmsRegionsCache {
        if self.should_refresh_openai_sms_regions() {
            let _ = self.refresh_openai_sms_regions_cache().await;
        }
        self.openai_sms_regions_cache()
    }

    pub async fn get_openai_sms_region_codes(&self) -> Vec<String> {
        self.get_openai_sms_regions_cache().await.sms_regions
    }

    pub fn registry(&self) -> Arc<RwLock<ProviderRegistry>> {
        Arc::clone(&self.registry)
    }

    fn persist_runtime_batch(&self, batch: RuntimeStoreBatch) {
        if batch.is_empty() {
            return;
        }
        let _ = self.runtime_state_repository.apply_batch(
            &batch,
            RuntimeStoreApplyOptions {
                log_limit: self.log_buffer,
                activity_limit: self.activity_buffer,
            },
        );
    }

    fn persist_provider_metadata_cache_batch(&self, batch: ProviderMetadataCacheBatch) {
        if batch.is_empty() {
            return;
        }
        let _ = self.provider_metadata_cache_repository.apply_batch(&batch);
    }

    fn commit_runtime_uow(&self, uow: RuntimeUnitOfWork) {
        self.persist_runtime_batch(uow.batch);
    }

    fn append_log_to_uow(&self, uow: &mut RuntimeUnitOfWork, entry: LogEntry) {
        self.push_log_entry_in_memory(entry.clone());
        uow.batch.log_entries.push(entry);
    }

    fn append_activity_to_uow(&self, uow: &mut RuntimeUnitOfWork, entry: ActivityEntry) {
        self.push_activity_entry_in_memory(entry.clone());
        uow.batch.activity_entries.push(entry);
    }

    fn push_ticket_stats_event_in_memory(&self, entry: TicketStatsEvent) {
        self.ticket_stats_events.write().push_back(entry);
    }

    fn append_ticket_stats_event_to_uow(
        &self,
        uow: &mut RuntimeUnitOfWork,
        ticket: &TicketRecord,
        outcome: TicketStatsOutcome,
        message: Option<String>,
        receive_started_at: Option<chrono::DateTime<Utc>>,
    ) {
        let now = Utc::now();
        let receive_duration_secs = if outcome == TicketStatsOutcome::CodeReceived {
            let started_at = receive_started_at.unwrap_or(ticket.created_at);
            Some((now - started_at).num_milliseconds().max(0) as f64 / 1000.0)
        } else {
            None
        };
        let event = TicketStatsEvent {
            id: Uuid::now_v7().to_string(),
            ticket_id: ticket.id.clone(),
            provider: ticket.provider.clone(),
            service: ticket.service.clone(),
            country: ticket.country.clone(),
            operator: ticket.operator.clone(),
            outcome,
            status: ticket.status.clone(),
            occurred_at: now,
            price: ticket.price,
            receive_duration_secs,
            message,
            synced_at: None,
        };
        self.push_ticket_stats_event_in_memory(event.clone());
        uow.batch.stats_events.push(event);
        let mut status = self.stats_sync_status.write();
        status.pending_events = status.pending_events.saturating_add(1);
        uow.batch.stats_sync_status = Some(status.clone());
    }

    fn upsert_ticket_into_uow(&self, uow: &mut RuntimeUnitOfWork, ticket: TicketRecord) {
        let mut tickets = self.tickets.write();
        tickets.insert(ticket.id.clone(), ticket.clone());
        let deleted_ids = self.trim_tickets(&mut tickets);
        drop(tickets);
        uow.batch.upsert_ticket = Some(ticket);
        uow.batch.delete_ticket_ids.extend(deleted_ids);
    }

    fn queue_ticket_persistence_into_uow(&self, uow: &mut RuntimeUnitOfWork, ticket: TicketRecord) {
        if let Some(current) = uow.batch.upsert_ticket.as_ref()
            && current.id == ticket.id
        {
            uow.batch.upsert_ticket = Some(ticket);
            return;
        }
        if let Some(existing) = uow
            .batch
            .upsert_tickets
            .iter_mut()
            .find(|current| current.id == ticket.id)
        {
            *existing = ticket;
            return;
        }
        uow.batch.upsert_tickets.push(ticket);
    }

    fn merge_runtime_uow(&self, target: &mut RuntimeUnitOfWork, source: RuntimeUnitOfWork) {
        if let Some(ticket) = source.batch.upsert_ticket {
            self.queue_ticket_persistence_into_uow(target, ticket);
        }
        for ticket in source.batch.upsert_tickets {
            self.queue_ticket_persistence_into_uow(target, ticket);
        }
        target
            .batch
            .delete_ticket_ids
            .extend(source.batch.delete_ticket_ids);
        target.batch.log_entries.extend(source.batch.log_entries);
        target
            .batch
            .activity_entries
            .extend(source.batch.activity_entries);
        if source.batch.reuse_bucket.is_some() {
            target.batch.reuse_bucket = source.batch.reuse_bucket;
        }
        if source.batch.provider_balance.is_some() {
            target.batch.provider_balance = source.batch.provider_balance;
        }
        if source.batch.openai_regions.is_some() {
            target.batch.openai_regions = source.batch.openai_regions;
        }
        target.batch.clear_logs |= source.batch.clear_logs;
    }

    fn replace_reuse_bucket_in_uow(
        &self,
        uow: &mut RuntimeUnitOfWork,
        provider_bucket: String,
        entries: Vec<ReusePoolEntry>,
    ) {
        uow.batch.reuse_bucket = Some((provider_bucket, entries));
    }

    fn log_into_uow(
        &self,
        uow: &mut RuntimeUnitOfWork,
        scope: impl Into<String>,
        level: impl Into<String>,
        message: impl Into<String>,
    ) {
        let entry = self.log_entry(scope, level, message);
        self.append_log_to_uow(uow, entry);
    }

    fn log_upstream_request_into_uow(
        &self,
        uow: &mut RuntimeUnitOfWork,
        provider: impl Into<String>,
        action: impl Into<String>,
        details: impl Into<String>,
    ) {
        let provider = provider.into();
        let action = action.into();
        let details = details.into();
        self.log_into_uow(
            uow,
            format!("upstream:{provider}"),
            "info",
            format!("{action} {details}"),
        );
    }

    fn log_upstream_response_into_uow(
        &self,
        uow: &mut RuntimeUnitOfWork,
        provider: impl Into<String>,
        action: impl Into<String>,
        status: impl Into<String>,
        details: impl Into<String>,
    ) {
        let provider = provider.into();
        let action = action.into();
        let status = status.into();
        let details = details.into();
        self.log_into_uow(
            uow,
            format!("upstream:{provider}"),
            if status.starts_with('2') {
                "info"
            } else {
                "warn"
            },
            format!("{action} -> {status} {details}"),
        );
    }

    fn push_activity_into_uow(&self, uow: &mut RuntimeUnitOfWork, entry: ActivityEntry) {
        self.append_activity_to_uow(uow, entry);
    }

    fn push_ticket_activity_into_uow(
        &self,
        uow: &mut RuntimeUnitOfWork,
        kind: ActivityKind,
        level: ActivityLevel,
        title: String,
        detail: Option<String>,
        ticket: &TicketRecord,
    ) {
        self.push_activity_into_uow(
            uow,
            self.ticket_activity_entry(kind, level, title, detail, ticket),
        );
    }

    fn push_routing_activity_into_uow(
        &self,
        uow: &mut RuntimeUnitOfWork,
        level: ActivityLevel,
        title: String,
        detail: Option<String>,
        provider: Option<String>,
        service: Option<String>,
        country: Option<String>,
        plan: &RoutingPlan,
        item: &RoutingPlanItem,
        round: u32,
        ticket_id: Option<String>,
    ) {
        self.push_activity_into_uow(
            uow,
            self.routing_activity_entry(
                level, title, detail, provider, service, country, plan, item, round, ticket_id,
            ),
        );
    }

    fn should_refresh_openai_sms_regions(&self) -> bool {
        let cache = self.openai_sms_regions_cache.read();
        match cache.fetched_at {
            Some(fetched_at) => {
                Utc::now() - fetched_at >= Duration::hours(OPENAI_SMS_REGIONS_CACHE_TTL_HOURS)
            }
            None => true,
        }
    }

    async fn fetch_openai_sms_regions_payload(&self) -> Result<OpenAiSmsRegionsPayload, SmsError> {
        let html = self
            .callback_client
            .get(OPENAI_AUTH_BOOTSTRAP_URL)
            .send()
            .await
            .map_err(|err| {
                SmsError::Upstream(format!("fetch openai auth bootstrap failed: {err}"))
            })?
            .text()
            .await
            .map_err(|err| {
                SmsError::Upstream(format!("read openai auth bootstrap failed: {err}"))
            })?;
        let bootstrap_json = extract_bootstrap_json(&html).ok_or_else(|| {
            SmsError::Upstream("openai auth bootstrap payload not found".to_string())
        })?;
        let page: OpenAiBootstrapPage = serde_json::from_str(&bootstrap_json).map_err(|err| {
            SmsError::Config(format!("parse openai bootstrap page failed: {err}"))
        })?;
        let statsig: OpenAiStatsigBootstrap =
            serde_json::from_str(&page.statsig_client_init_data.bootstrap).map_err(|err| {
                SmsError::Config(format!("parse openai statsig bootstrap failed: {err}"))
            })?;
        let config_id = statsig_config_id(OPENAI_SMS_DYNAMIC_CONFIG_KEY);
        statsig
            .dynamic_configs
            .get(&config_id)
            .map(|entry| OpenAiSmsRegionsPayload {
                sms: normalize_region_codes(&entry.value.sms),
                whatsapp: normalize_region_codes(&entry.value.whatsapp),
            })
            .ok_or_else(|| {
                SmsError::Upstream(format!(
                    "openai statsig config `{OPENAI_SMS_DYNAMIC_CONFIG_KEY}` missing"
                ))
            })
    }

    pub async fn refresh_openai_sms_regions_cache(
        &self,
    ) -> Result<OpenAiSmsRegionsCache, SmsError> {
        let payload = self.fetch_openai_sms_regions_payload().await?;
        let sms_regions = payload.sms;
        let whatsapp_regions = payload.whatsapp;
        let sms_only_regions = sms_regions
            .iter()
            .filter(|code| !whatsapp_regions.contains(*code))
            .cloned()
            .collect::<Vec<_>>();
        let mut all_regions = sms_regions.clone();
        for code in &whatsapp_regions {
            if !all_regions.contains(code) {
                all_regions.push(code.clone());
            }
        }
        all_regions.sort();
        let next = OpenAiSmsRegionsCache {
            sms_regions,
            sms_only_regions,
            whatsapp_regions,
            all_regions,
            fetched_at: Some(Utc::now()),
        };
        *self.openai_sms_regions_cache.write() = next.clone();
        let mut uow = RuntimeUnitOfWork::default();
        uow.batch.openai_regions = Some(next.clone());
        self.log_into_uow(
            &mut uow,
            "config",
            "info",
            "openai sms region cache refreshed",
        );
        self.commit_runtime_uow(uow);
        Ok(next)
    }

    fn peek_exact_reuse_from_pool(
        &self,
        provider: &str,
        service: &str,
        country: &str,
    ) -> (Option<ReusePoolEntry>, Option<Vec<ReusePoolEntry>>) {
        let now = Utc::now();
        let mut pool = self.reuse_pool.write();
        let Some(entries) = pool.get_mut(provider) else {
            return (None, None);
        };
        let before_len = entries.len();
        entries.retain(|e| e.expires_at > now && e.reuse_count < e.max_reuse);
        let candidate = entries
            .iter()
            .find(|e| e.service == service && e.country == country)
            .cloned();
        let snapshot = (entries.len() != before_len).then(|| entries.clone());
        (candidate, snapshot)
    }

    fn record_exact_reuse_candidate_in_memory(
        &self,
        ticket: &TicketRecord,
        reused_entry: Option<ReusePoolEntry>,
    ) -> Option<(String, Vec<ReusePoolEntry>)> {
        let reuse_enabled = self
            .registry
            .read()
            .manifest(&ticket.provider)
            .map(|manifest| manifest.defaults.reuse_phone)
            .unwrap_or(true);
        if !reuse_enabled {
            return None;
        }
        self.record_reuse_candidate_with_key_in_memory(
            ticket,
            match ticket.provider.as_str() {
                "herosms" => ticket.upstream_id.clone(),
                "fivesim" => Some(ticket.phone_number.clone()),
                _ => None,
            },
            reused_entry,
        )
    }

    fn record_reuse_candidate_with_key_in_memory(
        &self,
        ticket: &TicketRecord,
        reuse_key: Option<String>,
        reused_entry: Option<ReusePoolEntry>,
    ) -> Option<(String, Vec<ReusePoolEntry>)> {
        let Some(reuse_key) = reuse_key.filter(|value| !value.trim().is_empty()) else {
            return None;
        };
        let now = Utc::now();
        let ttl_hours = self
            .registry
            .read()
            .manifest(&ticket.provider)
            .map(|manifest| manifest.defaults.reuse_ttl_hours.max(1) as i64)
            .unwrap_or(DEFAULT_REUSE_TTL_HOURS);
        let entry = ReusePoolEntry {
            reuse_key: Some(reuse_key),
            phone_number: ticket.phone_number.clone(),
            provider: ticket.provider.clone(),
            service: ticket.service.clone(),
            country: ticket.country.clone(),
            upstream_id: ticket.upstream_id.clone(),
            reuse_count: reused_entry
                .as_ref()
                .map(|entry| entry.reuse_count + 1)
                .unwrap_or(0),
            max_reuse: self
                .registry
                .read()
                .manifest(&ticket.provider)
                .map(|manifest| manifest.defaults.reuse_max)
                .unwrap_or(2),
            last_used_at: now,
            expires_at: now + chrono::Duration::hours(ttl_hours),
        };
        let entries = {
            let mut pool = self.reuse_pool.write();
            let bucket = pool.entry(ticket.provider.clone()).or_default();
            bucket.push(entry);
            bucket.clone()
        };
        Some((ticket.provider.clone(), entries))
    }

    fn prepare_reuse_request(&self, request: &mut AcquireCodeRequest) -> PreparedReuseRequest {
        let reuse_enabled = request
            .reuse_phone
            .or_else(|| {
                self.registry
                    .read()
                    .manifest(&request.provider)
                    .ok()
                    .map(|manifest| manifest.defaults.reuse_phone)
            })
            .unwrap_or(true);
        if !reuse_enabled {
            return PreparedReuseRequest::default();
        }
        let matrix = ProviderCapabilityMatrix::new();
        let service = request.service.as_deref().unwrap_or_default();
        let country = request.country.as_deref().unwrap_or_default();
        if matrix.supports(&request.provider, ReuseCapability::ExactNumberReuse) {
            let (candidate, cleaned_bucket) =
                self.peek_exact_reuse_from_pool(&request.provider, service, country);
            if let Some(candidate) = candidate {
                request.reuse_phone = Some(true);
                request.reuse_key = candidate
                    .reuse_key
                    .clone()
                    .or_else(|| Some(candidate.phone_number.clone()));
                return PreparedReuseRequest {
                    exact_candidate: Some(candidate),
                    cleaned_bucket: cleaned_bucket
                        .map(|entries| (request.provider.clone(), entries)),
                };
            }
            if let Some(entries) = cleaned_bucket {
                return PreparedReuseRequest {
                    exact_candidate: None,
                    cleaned_bucket: Some((request.provider.clone(), entries)),
                };
            }
        }
        if matrix.supports(&request.provider, ReuseCapability::IntentReuse) {
            request.reuse_phone = Some(true);
        }
        PreparedReuseRequest::default()
    }

    fn normalize_acquire_request(mut request: AcquireCodeRequest) -> AcquireCodeRequest {
        if let Some(service) = request.service.as_ref() {
            let canonical = canonical_service_key(service, Some(service));
            request.service = if canonical.is_empty() {
                None
            } else {
                Some(canonical)
            };
        }
        if let Some(country) = request.country.as_ref() {
            let canonical = canonical_country_key(country, Some(country), None);
            request.country = if canonical.is_empty() {
                None
            } else {
                Some(canonical)
            };
        }
        request
    }

    async fn try_same_activation_retry_acquire_effect(
        &self,
        provider_id: &str,
        request: &AcquireCodeRequest,
    ) -> Result<SameActivationRetryRuntimeEffect, SameActivationRetryRuntimeError> {
        let reuse_enabled = request
            .reuse_phone
            .or_else(|| {
                self.registry
                    .read()
                    .manifest(provider_id)
                    .ok()
                    .map(|manifest| manifest.defaults.reuse_phone)
            })
            .unwrap_or(true);
        if !reuse_enabled {
            return Ok(SameActivationRetryRuntimeEffect {
                response: None,
                uow: RuntimeUnitOfWork::default(),
            });
        }
        let matrix = ProviderCapabilityMatrix::new();
        if !matrix.supports(provider_id, ReuseCapability::SameActivationRetry) {
            return Ok(SameActivationRetryRuntimeEffect {
                response: None,
                uow: RuntimeUnitOfWork::default(),
            });
        }
        let Some(candidate) = self.try_same_activation_retry_candidate(
            provider_id,
            request.service.as_deref().unwrap_or_default(),
            request.country.as_deref().unwrap_or_default(),
        ) else {
            return Ok(SameActivationRetryRuntimeEffect {
                response: None,
                uow: RuntimeUnitOfWork::default(),
            });
        };
        let provider = {
            let registry = self.registry.read();
            registry
                .get(provider_id)
                .map_err(|error| SameActivationRetryRuntimeError { error, uow: None })?
        };
        let retry_result = provider
            .release(&candidate, crate::models::ReleaseAction::Retry)
            .await;
        let now = Utc::now();
        match retry_result {
            Ok(message) => {
                let updated = {
                    let mut tickets = self.tickets.write();
                    let Some(ticket) = tickets.get_mut(&candidate.id) else {
                        return Ok(SameActivationRetryRuntimeEffect {
                            response: None,
                            uow: RuntimeUnitOfWork::default(),
                        });
                    };
                    ticket.updated_at = now;
                    ticket.status = TicketStatus::WaitingCode;
                    ticket.code = None;
                    ticket.message = Some(message);
                    ticket.acquire_path = AcquirePath::SameActivationRetry;
                    ticket.reuse_count += 1;
                    ticket.clone()
                };
                let mut uow = RuntimeUnitOfWork::default();
                self.log_into_uow(
                    &mut uow,
                    "reuse_pool",
                    "info",
                    format!(
                        "reuse_pool: retry candidate found provider={} service={} phone={}",
                        provider_id,
                        request.service.as_deref().unwrap_or_default(),
                        candidate.phone_number
                    ),
                );
                uow.batch.upsert_ticket = Some(updated.clone());
                Ok(SameActivationRetryRuntimeEffect {
                    response: Some(AcquireCodeResponse {
                        ticket_id: updated.id.clone(),
                        provider: updated.provider.clone(),
                        service: updated.service.clone(),
                        country: updated.country.clone(),
                        phone_number: updated.phone_number.clone(),
                        upstream_id: updated.upstream_id.clone(),
                        price: updated.price,
                        status: updated.status.clone(),
                        created_at: updated.created_at,
                        acquire_path: updated.acquire_path,
                        routing_plan_id: updated.routing_plan_id.clone(),
                        routing_plan_name: updated.routing_plan_name.clone(),
                        routing_item_id: updated.routing_item_id.clone(),
                        routing_item_index: updated.routing_item_index,
                    }),
                    uow,
                })
            }
            Err(error) => {
                {
                    let mut tickets = self.tickets.write();
                    if let Some(ticket) = tickets.get_mut(&candidate.id) {
                        ticket.same_activation_retry_supported = false;
                        ticket.same_activation_retry_expires_at = Some(now);
                        ticket.updated_at = now;
                    }
                }
                if let Ok(updated) = self.ticket(&candidate.id) {
                    let mut uow = RuntimeUnitOfWork::default();
                    uow.batch.upsert_ticket = Some(updated);
                    self.log_into_uow(
                        &mut uow,
                        "reuse_pool",
                        "warn",
                        format!(
                            "reuse_pool: retry candidate invalidated provider={} ticket={} error={}",
                            provider_id, candidate.id, error
                        ),
                    );
                    return Ok(SameActivationRetryRuntimeEffect {
                        response: None,
                        uow,
                    });
                }
                Ok(SameActivationRetryRuntimeEffect {
                    response: None,
                    uow: RuntimeUnitOfWork::default(),
                })
            }
        }
    }

    async fn acquire_ticket_for_provider_effect(
        &self,
        provider_id: &str,
        request: &AcquireCodeRequest,
    ) -> Result<AcquireTicketRuntimeEffect, AcquireTicketRuntimeError> {
        let cached_options = self
            .provider_option_cache
            .read()
            .entries
            .get(provider_id)
            .cloned();
        let provider = {
            let registry = self.registry.read();
            registry
                .get(provider_id)
                .map_err(|error| AcquireTicketRuntimeError { error, uow: None })?
        };
        if !provider.manifest().enabled {
            return Err(AcquireTicketRuntimeError {
                error: SmsError::ProviderDisabled(provider_id.to_string()),
                uow: None,
            });
        }
        let acquire_details = format!(
            "service={} country={}",
            request.service.clone().unwrap_or_default(),
            request.country.clone().unwrap_or_default()
        );
        let ticket = match provider
            .acquire(&self.translate_acquire_request(
                provider.manifest(),
                request,
                cached_options.as_ref().map(|entry| &entry.options),
            ))
            .await
        {
            Ok(ticket) => ticket,
            Err(error) => {
                let mut uow = RuntimeUnitOfWork::default();
                self.log_upstream_request_into_uow(
                    &mut uow,
                    provider_id,
                    "acquire",
                    acquire_details.clone(),
                );
                self.log_upstream_response_into_uow(
                    &mut uow,
                    provider_id,
                    "acquire",
                    "error",
                    error.to_string(),
                );
                return Err(AcquireTicketRuntimeError {
                    error,
                    uow: Some(uow),
                });
            }
        };
        let mut ticket = normalize_ticket_record(
            provider.manifest(),
            cached_options.as_ref().map(|entry| &entry.options),
            ticket,
        );
        if let Some(operator) = request.metadata.get("operator").cloned() {
            let normalized = normalize_ticket_record(
                provider.manifest(),
                cached_options.as_ref().map(|entry| &entry.options),
                TicketRecord {
                    operator: Some(operator),
                    ..ticket.clone()
                },
            );
            ticket.operator = normalized.operator;
        }
        let capabilities = ProviderCapabilityMatrix::new();
        let reuse_enabled = request
            .reuse_phone
            .or(Some(provider.manifest().defaults.reuse_phone))
            .unwrap_or(false);
        if capabilities.supports(provider_id, ReuseCapability::SameActivationRetry)
            && ticket.same_activation_retry_supported
        {
            if ticket.same_activation_retry_expires_at.is_none() {
                ticket.same_activation_retry_expires_at = Some(
                    ticket.created_at
                        + chrono::Duration::seconds(
                            provider.manifest().defaults.poll_timeout_sec as i64,
                        ),
                );
            }
        }
        ticket.acquire_path = if request.reuse_key.is_some()
            && capabilities.supports(provider_id, ReuseCapability::ExactNumberReuse)
        {
            AcquirePath::ExactReuse
        } else if reuse_enabled && capabilities.supports(provider_id, ReuseCapability::IntentReuse)
        {
            AcquirePath::IntentReuse
        } else {
            AcquirePath::FreshAcquire
        };
        let mut uow = RuntimeUnitOfWork::default();
        self.log_upstream_request_into_uow(&mut uow, provider_id, "acquire", acquire_details);
        self.log_upstream_response_into_uow(
            &mut uow,
            provider_id,
            "acquire",
            "200",
            "ticket acquired",
        );
        Ok(AcquireTicketRuntimeEffect { ticket, uow })
    }

    fn trim_tickets(&self, tickets: &mut BTreeMap<String, TicketRecord>) -> Vec<String> {
        let mut deleted_ids = Vec::new();
        while tickets.len() > self.ticket_buffer {
            let Some(oldest_id) = tickets
                .iter()
                .min_by(|left, right| {
                    left.1
                        .updated_at
                        .cmp(&right.1.updated_at)
                        .then_with(|| left.1.created_at.cmp(&right.1.created_at))
                        .then_with(|| left.0.cmp(right.0))
                })
                .map(|(id, _)| id.clone())
            else {
                break;
            };
            tickets.remove(&oldest_id);
            self.callback_subscriptions.write().remove(&oldest_id);
            deleted_ids.push(oldest_id);
        }
        deleted_ids
    }

    #[cfg(test)]
    fn upsert_ticket(&self, ticket: TicketRecord) {
        let mut uow = RuntimeUnitOfWork::default();
        self.upsert_ticket_into_uow(&mut uow, ticket);
        self.commit_runtime_uow(uow);
    }

    #[cfg(test)]
    fn push_activity(&self, entry: ActivityEntry) {
        let mut uow = RuntimeUnitOfWork::default();
        self.push_activity_into_uow(&mut uow, entry);
        self.commit_runtime_uow(uow);
    }

    fn should_include_in_notification_feed(entry: &LogEntry) -> bool {
        if entry.scope == "http" {
            return false;
        }
        if entry.scope.starts_with("upstream:") {
            return false;
        }
        true
    }

    pub fn log_http_access(
        &self,
        method: impl Into<String>,
        path: impl Into<String>,
        status: impl Into<String>,
    ) {
        let method = method.into();
        let path = path.into();
        let status = status.into();
        self.log("http", "info", format!("{method} {path} -> {status}"));
    }

    pub fn log_upstream_request(
        &self,
        provider: impl Into<String>,
        action: impl Into<String>,
        details: impl Into<String>,
    ) {
        let provider = provider.into();
        let action = action.into();
        let details = details.into();
        self.log(
            format!("upstream:{provider}"),
            "info",
            format!("{action} {details}"),
        );
    }

    pub fn log_upstream_response(
        &self,
        provider: impl Into<String>,
        action: impl Into<String>,
        status: impl Into<String>,
        details: impl Into<String>,
    ) {
        let provider = provider.into();
        let action = action.into();
        let status = status.into();
        let details = details.into();
        self.log(
            format!("upstream:{provider}"),
            if status.starts_with('2') {
                "info"
            } else {
                "warn"
            },
            format!("{action} -> {status} {details}"),
        );
    }

    pub async fn acquire_code(
        &self,
        request: AcquireCodeRequest,
    ) -> Result<AcquireCodeResponse, SmsError> {
        let request = Self::normalize_acquire_request(request);
        if request.routing_plan_id.is_some() || request.routing_plan_name.is_some() {
            return self.acquire_code_by_routing_plan(request).await;
        }
        if request.provider == "auto" {
            return self.acquire_code_by_auto_provider(request).await;
        }
        self.acquire_code_for_provider(request).await
    }

    async fn acquire_code_for_provider_effect(
        &self,
        mut request: AcquireCodeRequest,
    ) -> Result<AcquireCodeRuntimeEffect, AcquireCodeRuntimeError> {
        let same_activation_retry_effect = self
            .try_same_activation_retry_acquire_effect(&request.provider, &request)
            .await
            .map_err(|error| AcquireCodeRuntimeError {
                error: error.error,
                uow: error.uow,
            })?;
        if let Some(response) = same_activation_retry_effect.response {
            return Ok(AcquireCodeRuntimeEffect {
                response,
                uow: same_activation_retry_effect.uow,
            });
        }
        let same_activation_retry_uow = same_activation_retry_effect.uow;
        let prepared_reuse = self.prepare_reuse_request(&mut request);
        let mut effect = match self
            .acquire_ticket_for_provider_effect(&request.provider, &request)
            .await
        {
            Ok(mut effect) => {
                self.merge_runtime_uow(&mut effect.uow, same_activation_retry_uow);
                effect
            }
            Err(error) => {
                let mut uow = same_activation_retry_uow;
                if let Some(current) = error.uow {
                    self.merge_runtime_uow(&mut uow, current);
                }
                if let Some((provider_bucket, entries)) = prepared_reuse.cleaned_bucket.as_ref() {
                    self.replace_reuse_bucket_in_uow(
                        &mut uow,
                        provider_bucket.clone(),
                        entries.clone(),
                    );
                }
                return Err(AcquireCodeRuntimeError {
                    error: error.error,
                    uow: Some(uow),
                });
            }
        };
        let mut ticket = effect.ticket;
        if let Some((provider_bucket, entries)) = prepared_reuse.cleaned_bucket.as_ref() {
            self.replace_reuse_bucket_in_uow(
                &mut effect.uow,
                provider_bucket.clone(),
                entries.clone(),
            );
        }
        if let Some(candidate) = prepared_reuse.exact_candidate.as_ref() {
            self.consume_exact_reuse_candidate(&ticket.provider, candidate);
            let entries = self
                .reuse_pool
                .read()
                .get(&ticket.provider)
                .cloned()
                .unwrap_or_default();
            self.replace_reuse_bucket_in_uow(&mut effect.uow, ticket.provider.clone(), entries);
            self.log_into_uow(
                &mut effect.uow,
                "reuse_pool",
                "info",
                format!(
                    "reuse_pool: candidate found provider={} service={} phone={}",
                    ticket.provider, ticket.service, candidate.phone_number
                ),
            );
            ticket.reuse_count = candidate.reuse_count + 1;
        }
        let response = AcquireCodeResponse {
            ticket_id: ticket.id.clone(),
            provider: ticket.provider.clone(),
            service: ticket.service.clone(),
            country: ticket.country.clone(),
            phone_number: ticket.phone_number.clone(),
            upstream_id: ticket.upstream_id.clone(),
            price: ticket.price,
            status: ticket.status.clone(),
            created_at: ticket.created_at,
            acquire_path: ticket.acquire_path,
            routing_plan_id: ticket.routing_plan_id.clone(),
            routing_plan_name: ticket.routing_plan_name.clone(),
            routing_item_id: ticket.routing_item_id.clone(),
            routing_item_index: ticket.routing_item_index,
        };
        self.log_into_uow(
            &mut effect.uow,
            "system",
            "info",
            format!("ticket {} acquired by {}", ticket.id, ticket.provider),
        );
        self.push_ticket_activity_into_uow(
            &mut effect.uow,
            ActivityKind::TicketEvent,
            ActivityLevel::Info,
            format!("工单 {} 获取成功", ticket.id),
            Some(format!(
                "provider={} service={} country={}",
                ticket.provider, ticket.service, ticket.country
            )),
            &ticket,
        );
        self.append_ticket_stats_event_to_uow(
            &mut effect.uow,
            &ticket,
            TicketStatsOutcome::Acquired,
            ticket.message.clone(),
            None,
        );
        self.upsert_ticket_into_uow(&mut effect.uow, ticket);
        Ok(AcquireCodeRuntimeEffect {
            response,
            uow: effect.uow,
        })
    }

    async fn acquire_code_for_provider(
        &self,
        request: AcquireCodeRequest,
    ) -> Result<AcquireCodeResponse, SmsError> {
        let effect = self
            .acquire_code_for_provider_effect(request)
            .await
            .map_err(|error| {
                if let Some(uow) = error.uow {
                    self.commit_runtime_uow(uow);
                }
                error.error
            })?;
        self.commit_runtime_uow(effect.uow);
        Ok(effect.response)
    }

    async fn acquire_code_by_auto_provider(
        &self,
        request: AcquireCodeRequest,
    ) -> Result<AcquireCodeResponse, SmsError> {
        let providers = {
            let registry = self.registry.read();
            let mut providers = registry
                .list_manifests_by_priority()
                .into_iter()
                .filter(|manifest| {
                    manifest.enabled && manifest.kind != plugin_sdk::ProviderKind::Mock
                })
                .map(|manifest| manifest.id)
                .collect::<Vec<_>>();
            if providers.is_empty() {
                providers = registry
                    .list_manifests_by_priority()
                    .into_iter()
                    .filter(|manifest| manifest.enabled)
                    .map(|manifest| manifest.id)
                    .collect();
            }
            providers
        };

        if providers.is_empty() {
            return Err(SmsError::InvalidRequest(
                "no enabled providers available for auto acquisition".to_string(),
            ));
        }

        let mut last_error = SmsError::InvalidRequest("no auto providers tried".to_string());
        for provider_id in providers {
            let mut routed = request.clone();
            routed.provider = provider_id.clone();
            match self.acquire_code_for_provider_effect(routed).await {
                Ok(effect) => {
                    self.commit_runtime_uow(effect.uow);
                    return Ok(effect.response);
                }
                Err(error) => {
                    let mut uow = error.uow.unwrap_or_default();
                    self.log_into_uow(
                        &mut uow,
                        "router",
                        "warn",
                        format!(
                            "auto provider {} skipped for service {}: {}",
                            provider_id,
                            request.service.as_deref().unwrap_or_default(),
                            error.error
                        ),
                    );
                    self.push_activity_into_uow(
                        &mut uow,
                        ActivityEntry {
                            id: Uuid::now_v7().to_string(),
                            timestamp: Utc::now(),
                            kind: ActivityKind::RoutingEvent,
                            level: ActivityLevel::Warn,
                            title: format!("自动服务商 {} 被跳过", provider_id),
                            detail: Some(format!(
                                "service={}",
                                request.service.as_deref().unwrap_or_default()
                            )),
                            provider: Some(provider_id.clone()),
                            service: request.service.clone(),
                            country: request.country.clone(),
                            routing_plan_id: None,
                            routing_plan_name: None,
                            routing_item_id: None,
                            routing_round: None,
                            ticket_id: None,
                        },
                    );
                    self.commit_runtime_uow(uow);
                    last_error = error.error;
                }
            }
        }
        Err(last_error)
    }

    async fn acquire_code_by_routing_plan(
        &self,
        request: AcquireCodeRequest,
    ) -> Result<AcquireCodeResponse, SmsError> {
        let plan = self.resolve_routing_plan(&request)?;
        let enabled_item_count = plan.items.iter().filter(|item| item.enabled).count();
        if enabled_item_count == 0 {
            return Err(SmsError::InvalidRequest(format!(
                "routing plan `{}` has no enabled items",
                plan.name
            )));
        }

        let mut last_error = SmsError::InvalidRequest("no routing plan items tried".into());
        let mut round = 1_u32;
        let mut attempt_index_offset = 0_usize;
        loop {
            let item_order = self.routing_attempts_for_round(&plan, round, attempt_index_offset);
            for entry in item_order {
                let response = self
                    .try_acquire_from_routing_item_effect(
                        &request,
                        &plan,
                        entry.item,
                        entry.attempt_index,
                        entry.round,
                        &entry.candidate_item_ids,
                    )
                    .await;
                match response {
                    Ok(effect) => {
                        self.commit_runtime_uow(effect.uow);
                        return Ok(effect.response);
                    }
                    Err(error) => {
                        let title =
                            format!("路由候选 {} 在第 {} 轮被跳过", entry.item.id, entry.round);
                        let item_provider = if entry.item.provider.trim().is_empty() {
                            ROUTING_ANY_PROVIDER.to_string()
                        } else {
                            entry.item.provider.clone()
                        };
                        let item_country = if entry.item.country.trim().is_empty() {
                            "any".to_string()
                        } else {
                            entry.item.country.clone()
                        };
                        let detail =
                            Some(format!("{} / {}：候选被跳过", item_provider, item_country));
                        let mut uow = error.uow.unwrap_or_default();
                        self.log_into_uow(
                            &mut uow,
                            "router",
                            "warn",
                            format!(
                                "routing plan {} skipped item {} at round {}: {}",
                                plan.id, entry.item.id, entry.round, error.error
                            ),
                        );
                        self.push_routing_activity_into_uow(
                            &mut uow,
                            ActivityLevel::Warn,
                            title,
                            detail,
                            (!entry.item.provider.trim().is_empty())
                                .then_some(entry.item.provider.clone()),
                            Some(plan.service.clone()),
                            (!entry.item.country.trim().is_empty())
                                .then_some(entry.item.country.clone()),
                            &plan,
                            entry.item,
                            entry.round,
                            None,
                        );
                        self.commit_runtime_uow(uow);
                        last_error = error.error;
                    }
                }
            }
            if !self.can_continue_to_round(&plan, round) {
                break;
            }
            round += 1;
            attempt_index_offset += enabled_item_count;
        }
        Err(last_error)
    }

    async fn try_acquire_from_routing_item_effect(
        &self,
        request: &AcquireCodeRequest,
        plan: &RoutingPlan,
        item: &RoutingPlanItem,
        attempt_index: usize,
        round: u32,
        candidate_item_ids: &[String],
    ) -> Result<RoutingAcquireRuntimeEffect, RoutingAcquireRuntimeError> {
        let provider_ids = self
            .expand_routing_item_providers(item)
            .map_err(|error| RoutingAcquireRuntimeError { error, uow: None })?;
        let mut last_error = None;

        for provider_id in provider_ids {
            let mut routed = request.clone();
            routed.provider = provider_id.clone();
            routed.service = Some(plan.service.clone());
            routed.country = if item.country.is_empty() {
                request.country.clone()
            } else {
                Some(item.country.clone())
            };
            routed.metadata = request.metadata.clone();
            if !item.operator.is_empty() {
                routed
                    .metadata
                    .insert("operator".to_string(), item.operator.clone());
            }
            match item.price_mode {
                crate::models::RoutingPriceMode::Any => {
                    routed.min_price = None;
                    routed.max_price = None;
                }
                crate::models::RoutingPriceMode::Range => {
                    routed.min_price = item.min_price;
                    routed.max_price = item.max_price;
                }
                crate::models::RoutingPriceMode::Fixed => {
                    routed.min_price = item.fixed_price;
                    routed.max_price = item.fixed_price;
                }
            }

            let same_activation_retry_effect = self
                .try_same_activation_retry_acquire_effect(&provider_id, &routed)
                .await
                .map_err(|error| RoutingAcquireRuntimeError {
                    error: error.error,
                    uow: error.uow,
                })?;
            if let Some(response) = same_activation_retry_effect.response {
                return Ok(RoutingAcquireRuntimeEffect {
                    response,
                    uow: same_activation_retry_effect.uow,
                });
            }
            let same_activation_retry_uow = same_activation_retry_effect.uow;
            let prepared_reuse = self.prepare_reuse_request(&mut routed);
            let mut effect = match self
                .acquire_ticket_for_provider_effect(&provider_id, &routed)
                .await
            {
                Ok(mut effect) => {
                    self.merge_runtime_uow(&mut effect.uow, same_activation_retry_uow);
                    effect
                }
                Err(error) => {
                    let mut uow = same_activation_retry_uow;
                    if let Some(current) = error.uow {
                        self.merge_runtime_uow(&mut uow, current);
                    }
                    if let Some((provider_bucket, entries)) = prepared_reuse.cleaned_bucket.as_ref()
                    {
                        self.replace_reuse_bucket_in_uow(
                            &mut uow,
                            provider_bucket.clone(),
                            entries.clone(),
                        );
                    }
                    let auto_disable_log =
                        self.maybe_disable_provider_for_low_balance(&provider_id, &error.error);
                    let detail =
                        format!("provider={} item={} round={}", provider_id, item.id, round);
                    if let Some(message) = auto_disable_log {
                        self.log_into_uow(&mut uow, "balance", "warn", message);
                    }
                    self.log_into_uow(
                        &mut uow,
                        "router",
                        "warn",
                        format!(
                            "routing provider {} failed for item {} at round {}: {}",
                            provider_id, item.id, round, error.error
                        ),
                    );
                    self.push_routing_activity_into_uow(
                        &mut uow,
                        ActivityLevel::Warn,
                        format!("路由候选 {} 的服务商 {} 不可用", item.id, provider_id),
                        Some(detail),
                        Some(provider_id.clone()),
                        Some(plan.service.clone()),
                        routed.country.clone(),
                        plan,
                        item,
                        round,
                        None,
                    );
                    last_error = Some(RoutingAcquireRuntimeError {
                        error: error.error,
                        uow: Some(uow),
                    });
                    continue;
                }
            };
            if let Some((provider_bucket, entries)) = prepared_reuse.cleaned_bucket.as_ref() {
                self.replace_reuse_bucket_in_uow(
                    &mut effect.uow,
                    provider_bucket.clone(),
                    entries.clone(),
                );
            }
            let mut ticket = effect.ticket;
            if let Some(candidate) = prepared_reuse.exact_candidate.as_ref() {
                self.consume_exact_reuse_candidate(&ticket.provider, candidate);
                let entries = self
                    .reuse_pool
                    .read()
                    .get(&ticket.provider)
                    .cloned()
                    .unwrap_or_default();
                self.replace_reuse_bucket_in_uow(&mut effect.uow, ticket.provider.clone(), entries);
                self.log_into_uow(
                    &mut effect.uow,
                    "reuse_pool",
                    "info",
                    format!(
                        "reuse_pool: candidate found provider={} service={} phone={}",
                        ticket.provider, ticket.service, candidate.phone_number
                    ),
                );
                ticket.reuse_count = candidate.reuse_count + 1;
            }
            ticket.routing_plan_id = Some(plan.id.clone());
            ticket.routing_plan_name = Some(plan.name.clone());
            ticket.routing_item_id = Some(item.id.clone());
            ticket.routing_item_index = Some(attempt_index);
            ticket.routing_execution_mode = Some(plan.execution_mode);
            ticket.routing_execution_rounds = Some(plan.execution_rounds);
            ticket.routing_current_round = Some(round);
            ticket.routing_candidate_item_ids = candidate_item_ids.to_vec();
            ticket.routing_attempt_count = (attempt_index + 1) as u32;

            let response = AcquireCodeResponse {
                ticket_id: ticket.id.clone(),
                provider: ticket.provider.clone(),
                service: ticket.service.clone(),
                country: ticket.country.clone(),
                phone_number: ticket.phone_number.clone(),
                upstream_id: ticket.upstream_id.clone(),
                price: ticket.price,
                status: ticket.status.clone(),
                created_at: ticket.created_at,
                acquire_path: ticket.acquire_path,
                routing_plan_id: ticket.routing_plan_id.clone(),
                routing_plan_name: ticket.routing_plan_name.clone(),
                routing_item_id: ticket.routing_item_id.clone(),
                routing_item_index: ticket.routing_item_index,
            };
            self.log_into_uow(
                &mut effect.uow,
                "router",
                "info",
                format!(
                    "routing plan {} matched item {} -> {}",
                    plan.id, item.id, ticket.provider
                ),
            );
            self.push_routing_activity_into_uow(
                &mut effect.uow,
                ActivityLevel::Info,
                format!("路由候选 {} 命中服务商 {}", item.id, ticket.provider),
                Some(format!("plan={} round={}", plan.name, round)),
                Some(ticket.provider.clone()),
                Some(ticket.service.clone()),
                Some(ticket.country.clone()),
                plan,
                item,
                round,
                Some(ticket.id.clone()),
            );
            self.upsert_ticket_into_uow(&mut effect.uow, ticket);
            return Ok(RoutingAcquireRuntimeEffect {
                response,
                uow: effect.uow,
            });
        }

        Err(last_error.unwrap_or_else(|| RoutingAcquireRuntimeError {
            error: SmsError::InvalidRequest(format!(
                "routing item `{}` has no available providers",
                item.id
            )),
            uow: None,
        }))
    }

    pub async fn poll_code(&self, request: PollCodeRequest) -> Result<PollCodeResponse, SmsError> {
        let current = self
            .tickets
            .read()
            .get(&request.ticket_id)
            .cloned()
            .ok_or_else(|| {
                SmsError::InvalidRequest(format!("unknown ticket {}", request.ticket_id))
            })?;
        let provider = {
            let registry = self.registry.read();
            registry.get(&current.provider)?
        };
        let poll_details = format!("ticket_id={}", current.id);
        let response = match provider.poll_code(&current).await {
            Ok(response) => response,
            Err(error) => {
                let mut uow = RuntimeUnitOfWork::default();
                self.log_upstream_request_into_uow(
                    &mut uow,
                    &current.provider,
                    "poll",
                    poll_details.clone(),
                );
                self.log_upstream_response_into_uow(
                    &mut uow,
                    &current.provider,
                    "poll",
                    "error",
                    error.to_string(),
                );
                self.commit_runtime_uow(uow);
                return Err(error);
            }
        };
        let updated = self.update_ticket_in_memory(&current.id, |ticket| {
            ticket.updated_at = Utc::now();
            ticket.status = response.status.clone();
            if response.code.is_some() {
                ticket.code = response.code.clone();
            }
            if response.message.is_some() {
                ticket.message = response.message.clone();
            }
        })?;
        let mut uow = RuntimeUnitOfWork::default();
        uow.batch.upsert_ticket = Some(updated.clone());
        self.log_upstream_request_into_uow(&mut uow, &current.provider, "poll", poll_details);
        self.log_upstream_response_into_uow(
            &mut uow,
            &current.provider,
            "poll",
            "200",
            format!("status={:?}", response.status),
        );
        if matches!(
            updated.status,
            TicketStatus::CodeReceived | TicketStatus::Cancelled | TicketStatus::Failed
        ) {
            self.push_ticket_activity_into_uow(
                &mut uow,
                ActivityKind::TicketEvent,
                if updated.status == TicketStatus::CodeReceived {
                    ActivityLevel::Info
                } else {
                    ActivityLevel::Warn
                },
                format!("工单 {} 状态更新", updated.id),
                updated.message.clone(),
                &updated,
            );
        }
        if let Some(outcome) = stats_outcome_for_status(&updated.status) {
            let receive_started_at = if outcome == TicketStatsOutcome::CodeReceived
                && current.acquire_path == AcquirePath::SameActivationRetry
            {
                Some(current.updated_at)
            } else {
                None
            };
            self.append_ticket_stats_event_to_uow(
                &mut uow,
                &updated,
                outcome,
                updated.message.clone(),
                receive_started_at,
            );
        }
        self.commit_runtime_uow(uow);
        Ok(response)
    }

    async fn release_code_runtime_effect(
        &self,
        request: ReleaseCodeRequest,
    ) -> Result<ReleaseRuntimeEffect, ReleaseRuntimeError> {
        let current = self
            .tickets
            .read()
            .get(&request.ticket_id)
            .cloned()
            .ok_or_else(|| ReleaseRuntimeError {
                error: SmsError::InvalidRequest(format!("unknown ticket {}", request.ticket_id)),
                uow: None,
            })?;
        let provider = {
            let registry = self.registry.read();
            registry
                .get(&current.provider)
                .map_err(|error| ReleaseRuntimeError { error, uow: None })?
        };
        let release_details = format!("ticket_id={}", current.id);
        let is_cancel_like = matches!(
            request.action,
            crate::models::ReleaseAction::Cancel | crate::models::ReleaseAction::Ban
        );
        let message = match provider.release(&current, request.action.clone()).await {
            Ok(message) => message,
            Err(error) => {
                let mut uow = RuntimeUnitOfWork::default();
                self.log_upstream_request_into_uow(
                    &mut uow,
                    &current.provider,
                    "release",
                    release_details.clone(),
                );
                self.log_upstream_response_into_uow(
                    &mut uow,
                    &current.provider,
                    "release",
                    "error",
                    error.to_string(),
                );
                if is_cancel_like
                    && error.to_string().contains("EARLY_CANCEL_DENIED")
                    && let Some(min_activation_time_sec) =
                        parse_min_activation_time_seconds(&error.to_string())
                {
                    let now = Utc::now();
                    let auto_release_at = current.auto_release_at.unwrap_or(
                        current.created_at + Duration::seconds(min_activation_time_sec as i64),
                    );
                    let retry_window_sec =
                        min_activation_time_sec.max(AUTO_RELEASE_RETRY_INTERVAL_SEC as u64);
                    let retry_deadline_at = current
                        .release_retry_deadline_at
                        .unwrap_or(auto_release_at + Duration::seconds(retry_window_sec as i64));
                    let retrying =
                        current.status == TicketStatus::CancelPending && now >= auto_release_at;
                    let next_release_attempt_at = if retrying {
                        now + Duration::seconds(AUTO_RELEASE_RETRY_INTERVAL_SEC)
                    } else {
                        auto_release_at
                    };
                    let next_retry_count = if retrying {
                        current.release_retry_count.saturating_add(1)
                    } else {
                        current.release_retry_count
                    };
                    let message = if retrying {
                        format!(
                            "EARLY_CANCEL_DENIED: auto cancel retry scheduled at {}",
                            next_release_attempt_at.to_rfc3339()
                        )
                    } else {
                        format!(
                            "EARLY_CANCEL_DENIED: auto cancel scheduled at {}",
                            auto_release_at.to_rfc3339()
                        )
                    };
                    let updated = self
                        .update_ticket_in_memory(&current.id, |ticket| {
                            ticket.updated_at = now;
                            ticket.status = TicketStatus::CancelPending;
                            ticket.message = Some(message.clone());
                            ticket.pending_release_action = Some(request.action.clone());
                            ticket.auto_release_at = Some(auto_release_at);
                            ticket.next_release_attempt_at = Some(next_release_attempt_at);
                            ticket.release_retry_deadline_at = Some(retry_deadline_at);
                            ticket.release_retry_count = next_retry_count;
                            ticket.same_activation_retry_supported = false;
                            ticket.same_activation_retry_expires_at = Some(ticket.updated_at);
                        })
                        .map_err(|error| ReleaseRuntimeError { error, uow: None })?;
                    let log_entry = self.log_entry(
                        "system",
                        if retrying { "warn" } else { "info" },
                        format!(
                            "ticket {} scheduled auto cancel after cooldown until {}",
                            current.id,
                            next_release_attempt_at.to_rfc3339()
                        ),
                    );
                    let activity_entry = self.ticket_activity_entry(
                        ActivityKind::ReleaseEvent,
                        if retrying {
                            ActivityLevel::Warn
                        } else {
                            ActivityLevel::Info
                        },
                        "自动取消已安排".to_string(),
                        Some("等待冷却结束后自动执行取消".to_string()),
                        &updated,
                    );
                    let mut uow = RuntimeUnitOfWork::default();
                    uow.batch.upsert_ticket = Some(updated);
                    self.log_upstream_request_into_uow(
                        &mut uow,
                        &current.provider,
                        "release",
                        release_details.clone(),
                    );
                    self.log_upstream_response_into_uow(
                        &mut uow,
                        &current.provider,
                        "release",
                        "error",
                        error.to_string(),
                    );
                    self.append_log_to_uow(&mut uow, log_entry);
                    self.append_activity_to_uow(&mut uow, activity_entry);
                    return Ok(ReleaseRuntimeEffect {
                        response: ReleaseCodeResponse {
                            ticket_id: current.id,
                            provider: current.provider,
                            status: TicketStatus::CancelPending,
                            message: Some(message),
                        },
                        uow,
                    });
                }
                return Err(ReleaseRuntimeError {
                    error,
                    uow: Some(uow),
                });
            }
        };
        let next_status = match request.action {
            crate::models::ReleaseAction::Finish => TicketStatus::Finished,
            crate::models::ReleaseAction::Cancel | crate::models::ReleaseAction::Ban => {
                TicketStatus::Cancelled
            }
            crate::models::ReleaseAction::Retry => TicketStatus::WaitingCode,
        };
        let invalidate_same_activation_retry = is_cancel_like;
        let updated = self
            .update_ticket_in_memory(&current.id, |ticket| {
                ticket.updated_at = Utc::now();
                ticket.status = next_status.clone();
                ticket.message = Some(message.clone());
                ticket.pending_release_action = None;
                ticket.auto_release_at = None;
                ticket.next_release_attempt_at = None;
                ticket.release_retry_deadline_at = None;
                ticket.release_retry_count = 0;
                if invalidate_same_activation_retry {
                    ticket.same_activation_retry_supported = false;
                    ticket.same_activation_retry_expires_at = Some(ticket.updated_at);
                }
            })
            .map_err(|error| ReleaseRuntimeError { error, uow: None })?;
        let reuse_bucket = if next_status == TicketStatus::Finished {
            let reused_entry = if matches!(current.acquire_path, AcquirePath::ExactReuse)
                && current.reuse_count > 0
            {
                self.last_reused_entry_for_ticket(&current)
            } else {
                None
            };
            self.record_exact_reuse_candidate_in_memory(&current, reused_entry)
        } else {
            None
        };
        let activity_level = match next_status {
            TicketStatus::Finished | TicketStatus::Cancelled => ActivityLevel::Info,
            TicketStatus::WaitingCode => ActivityLevel::Warn,
            _ => ActivityLevel::Warn,
        };
        let activity_entry = self.ticket_activity_entry(
            ActivityKind::ReleaseEvent,
            activity_level,
            format!("工单 {} 已执行 {:?}", current.id, request.action),
            Some(format!("status={:?}", next_status)),
            &updated,
        );
        let mut uow = RuntimeUnitOfWork::default();
        self.append_activity_to_uow(&mut uow, activity_entry);
        self.log_upstream_request_into_uow(&mut uow, &current.provider, "release", release_details);
        self.log_upstream_response_into_uow(
            &mut uow,
            &current.provider,
            "release",
            "200",
            &message,
        );
        let reuse_log_entry = reuse_bucket.as_ref().map(|_| {
            self.log_entry(
                "reuse_pool",
                "info",
                format!(
                    "reuse_pool: recorded candidate provider={}",
                    current.provider
                ),
            )
        });
        if let Some(entry) = reuse_log_entry.as_ref() {
            self.append_log_to_uow(&mut uow, entry.clone());
        }
        self.append_ticket_stats_event_to_uow(
            &mut uow,
            &updated,
            match request.action {
                crate::models::ReleaseAction::Finish => TicketStatsOutcome::Finished,
                crate::models::ReleaseAction::Cancel => TicketStatsOutcome::Cancelled,
                crate::models::ReleaseAction::Ban => TicketStatsOutcome::Banned,
                crate::models::ReleaseAction::Retry => TicketStatsOutcome::RetryRequested,
            },
            updated.message.clone(),
            None,
        );
        uow.batch.upsert_ticket = Some(updated);
        uow.batch.reuse_bucket = reuse_bucket;
        Ok(ReleaseRuntimeEffect {
            response: ReleaseCodeResponse {
                ticket_id: current.id,
                provider: current.provider,
                status: next_status,
                message: Some(message),
            },
            uow,
        })
    }

    pub async fn release_code(
        &self,
        request: ReleaseCodeRequest,
    ) -> Result<ReleaseCodeResponse, SmsError> {
        let effect = self
            .release_code_runtime_effect(request)
            .await
            .map_err(|error| {
                if let Some(uow) = error.uow {
                    self.commit_runtime_uow(uow);
                }
                error.error
            })?;
        self.commit_runtime_uow(effect.uow);
        Ok(effect.response)
    }

    pub async fn failover_routing_attempt(
        &self,
        request: RoutingFailoverRequest,
    ) -> Result<AcquireCodeResponse, SmsError> {
        let current = self
            .tickets
            .read()
            .get(&request.ticket_id)
            .cloned()
            .ok_or_else(|| {
                SmsError::InvalidRequest(format!("unknown ticket {}", request.ticket_id))
            })?;
        let plan_id = current.routing_plan_id.clone().ok_or_else(|| {
            SmsError::InvalidRequest("ticket is not associated with a routing plan".to_string())
        })?;
        let plan = self
            .routing_plans
            .read()
            .plans
            .iter()
            .find(|plan| plan.id == plan_id)
            .cloned()
            .ok_or_else(|| {
                SmsError::InvalidRequest(format!("routing plan `{plan_id}` not found"))
            })?;

        let current_item_id = request
            .failed_item_id
            .clone()
            .or(current.routing_item_id.clone());
        let candidates = self.routing_item_order_for_ticket(&plan, &current);
        let current_attempt_index = candidates
            .iter()
            .position(|entry| {
                current_item_id
                    .as_ref()
                    .is_some_and(|item_id| item_id == &entry.item.id)
                    && entry.round == current.routing_current_round.unwrap_or(1)
            })
            .or(current.routing_item_index);

        let mut last_error = SmsError::InvalidRequest(format!(
            "routing plan `{}` has no remaining candidate items",
            plan.name
        ));
        for entry in candidates {
            if current_attempt_index.is_some_and(|index| entry.attempt_index <= index) {
                continue;
            }
            let item = entry.item;
            let provider = if item.provider.is_empty() {
                String::new()
            } else {
                item.provider.clone()
            };
            let provider_for_disable = provider.clone();
            let mut acquire_request = AcquireCodeRequest {
                provider,
                service: Some(plan.service.clone()),
                country: None,
                max_price: None,
                min_price: None,
                auto_pick_country: None,
                reuse_phone: None,
                reuse_key: None,
                metadata: BTreeMap::new(),
                routing_plan_id: Some(plan.id.clone()),
                routing_plan_name: Some(plan.name.clone()),
            };
            if !item.country.is_empty() {
                acquire_request.country = Some(item.country.clone());
            }
            if !item.operator.is_empty() {
                acquire_request
                    .metadata
                    .insert("operator".to_string(), item.operator.clone());
            }
            match item.price_mode {
                crate::models::RoutingPriceMode::Any => {}
                crate::models::RoutingPriceMode::Range => {
                    acquire_request.min_price = item.min_price;
                    acquire_request.max_price = item.max_price;
                }
                crate::models::RoutingPriceMode::Fixed => {
                    acquire_request.min_price = item.fixed_price;
                    acquire_request.max_price = item.fixed_price;
                }
            }
            let response = self
                .try_acquire_from_routing_item_effect(
                    &acquire_request,
                    &plan,
                    item,
                    entry.attempt_index,
                    entry.round,
                    &entry.candidate_item_ids,
                )
                .await;
            match response {
                Ok(mut effect) => {
                    if let Some(reason) = request.reason.as_ref() {
                        self.log_into_uow(
                            &mut effect.uow,
                            "router",
                            "warn",
                            format!(
                                "routing failover for ticket {}: {}",
                                request.ticket_id, reason
                            ),
                        );
                    }
                    self.commit_runtime_uow(effect.uow);
                    return Ok(effect.response);
                }
                Err(error) => {
                    let auto_disable_log = (!provider_for_disable.is_empty())
                        .then_some(provider_for_disable.as_str())
                        .and_then(|provider_id| {
                            self.maybe_disable_provider_for_low_balance(provider_id, &error.error)
                        });
                    let mut uow = error.uow.unwrap_or_default();
                    if let Some(message) = auto_disable_log {
                        self.log_into_uow(&mut uow, "balance", "warn", message);
                    }
                    self.log_into_uow(
                        &mut uow,
                        "router",
                        "warn",
                        format!(
                            "routing failover skipped item {} for ticket {} at round {}: {}",
                            item.id, request.ticket_id, entry.round, error.error
                        ),
                    );
                    self.push_routing_activity_into_uow(
                        &mut uow,
                        ActivityLevel::Warn,
                        format!(
                            "Ticket {} 的下一路由候选 {} 被跳过",
                            request.ticket_id, item.id
                        ),
                        Some(format!(
                            "provider={} round={} error={}",
                            if provider_for_disable.is_empty() {
                                ROUTING_ANY_PROVIDER
                            } else {
                                provider_for_disable.as_str()
                            },
                            entry.round,
                            error.error
                        )),
                        (!provider_for_disable.is_empty()).then_some(provider_for_disable.clone()),
                        Some(plan.service.clone()),
                        acquire_request.country.clone(),
                        &plan,
                        item,
                        entry.round,
                        Some(request.ticket_id.clone()),
                    );
                    self.commit_runtime_uow(uow);
                    last_error = error.error;
                }
            }
        }
        Err(last_error)
    }

    pub async fn replace_routing_attempt(
        &self,
        request: RoutingReplaceRequest,
    ) -> Result<RoutingReplaceResponse, SmsError> {
        let current = self
            .tickets
            .read()
            .get(&request.ticket_id)
            .cloned()
            .ok_or_else(|| {
                SmsError::InvalidRequest(format!("unknown ticket {}", request.ticket_id))
            })?;
        if current.routing_plan_id.is_none() {
            return Err(SmsError::InvalidRequest(
                "ticket is not associated with a routing plan".to_string(),
            ));
        }

        let next_ticket = self
            .failover_routing_attempt(RoutingFailoverRequest {
                ticket_id: request.ticket_id.clone(),
                reason: request.reason.clone(),
                failed_item_id: request
                    .failed_item_id
                    .clone()
                    .or(current.routing_item_id.clone()),
            })
            .await?;

        if next_ticket.ticket_id == current.id {
            return Err(SmsError::InvalidRequest(
                "routing replace resolved to the same ticket; refusing to release current ticket"
                    .to_string(),
            ));
        }

        let current_ticket_release = self
            .release_code(ReleaseCodeRequest {
                ticket_id: current.id.clone(),
                action: request.release_action,
            })
            .await?;

        Ok(RoutingReplaceResponse {
            current_ticket_id: current.id,
            current_ticket_release,
            next_ticket,
        })
    }

    async fn get_balance_runtime_effect(
        &self,
        provider_id: &str,
    ) -> Result<ProviderBalanceRuntimeEffect, ProviderBalanceRuntimeError> {
        let provider = {
            let registry = self.registry.read();
            registry
                .get(provider_id)
                .map_err(|error| ProviderBalanceRuntimeError { error, uow: None })?
        };
        match provider.get_balance().await {
            Ok(balance) => {
                let cache_entry = ProviderBalanceCacheEntry {
                    provider: provider_id.to_string(),
                    amount: balance.amount,
                    currency: balance.currency.clone(),
                    fetched_at: Utc::now(),
                };
                self.provider_balance_cache
                    .write()
                    .insert(provider_id.to_string(), cache_entry.clone());
                let mut uow = RuntimeUnitOfWork::default();
                uow.batch.provider_balance = Some(cache_entry);
                self.log_upstream_request_into_uow(&mut uow, provider_id, "get_balance", "");
                self.log_into_uow(
                    &mut uow,
                    format!("upstream:{provider_id}"),
                    "info",
                    format!(
                        "get_balance -> 200 amount={:.2} {}",
                        balance.amount, balance.currency
                    ),
                );
                Ok(ProviderBalanceRuntimeEffect {
                    response: balance,
                    uow,
                })
            }
            Err(error) => {
                let mut uow = RuntimeUnitOfWork::default();
                self.log_upstream_request_into_uow(&mut uow, provider_id, "get_balance", "");
                self.log_upstream_response_into_uow(
                    &mut uow,
                    provider_id,
                    "get_balance",
                    "error",
                    error.to_string(),
                );
                Err(ProviderBalanceRuntimeError {
                    error,
                    uow: Some(uow),
                })
            }
        }
    }

    pub async fn get_balance(&self, provider_id: &str) -> Result<ProviderBalance, SmsError> {
        let effect = self
            .get_balance_runtime_effect(provider_id)
            .await
            .map_err(|error| {
                if let Some(uow) = error.uow {
                    self.commit_runtime_uow(uow);
                }
                error.error
            })?;
        self.commit_runtime_uow(effect.uow);
        Ok(effect.response)
    }

    async fn get_prices_runtime_effect(
        &self,
        query: ProviderPriceQuery,
    ) -> Result<ProviderPricesRuntimeEffect, ProviderPricesRuntimeError> {
        let request_details = format!(
            "service={} country={} operator={}",
            query.service.clone().unwrap_or_default(),
            query.country.clone().unwrap_or_default(),
            query.operator.clone().unwrap_or_default(),
        );
        let cached_options = self
            .provider_option_cache
            .read()
            .entries
            .get(&query.provider)
            .cloned();
        let provider = {
            let registry = self.registry.read();
            registry
                .get(&query.provider)
                .map_err(|error| ProviderPricesRuntimeError { error, uow: None })?
        };
        let canonical_service = query
            .service
            .as_deref()
            .unwrap_or(provider.manifest().defaults.service.as_str());
        let aliased_service = provider
            .manifest()
            .resolve_service_alias(Some(canonical_service));
        let service = if cached_options
            .as_ref()
            .map(|entry| {
                entry
                    .options
                    .raw_services
                    .iter()
                    .any(|item| item.value.eq_ignore_ascii_case(&aliased_service))
            })
            .unwrap_or(false)
        {
            aliased_service.clone()
        } else {
            resolve_provider_value(
                cached_options.as_ref().map(|entry| &entry.options),
                OptionKind::Service,
                &aliased_service,
            )
        };
        let country = query.country.as_ref().and_then(|value| {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(resolve_provider_value(
                    cached_options.as_ref().map(|entry| &entry.options),
                    OptionKind::Country,
                    trimmed,
                ))
            }
        });
        let operator = query.operator.as_ref().and_then(|value| {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(resolve_provider_operator_value(
                    cached_options.as_ref().map(|entry| &entry.options),
                    trimmed,
                    query.country.as_deref(),
                ))
            }
        });
        let items = match provider
            .get_prices(ProviderPriceQuery {
                provider: query.provider.clone(),
                service: Some(service.clone()),
                country,
                operator,
            })
            .await
        {
            Ok(items) => items,
            Err(error) => {
                let mut uow = RuntimeUnitOfWork::default();
                self.log_upstream_request_into_uow(
                    &mut uow,
                    &query.provider,
                    "get_prices",
                    request_details,
                );
                self.log_upstream_response_into_uow(
                    &mut uow,
                    &query.provider,
                    "get_prices",
                    "error",
                    error.to_string(),
                );
                return Err(ProviderPricesRuntimeError {
                    error,
                    uow: Some(uow),
                });
            }
        };
        let normalized_items =
            normalize_price_items(cached_options.as_ref().map(|entry| &entry.options), items);
        let response = ProviderPriceResponse {
            provider: query.provider.clone(),
            service: canonical_service.to_string(),
            items: normalized_items,
        };
        let mut uow = RuntimeUnitOfWork::default();
        self.log_upstream_request_into_uow(
            &mut uow,
            &query.provider,
            "get_prices",
            request_details,
        );
        self.log_upstream_response_into_uow(
            &mut uow,
            &query.provider,
            "get_prices",
            "200",
            format!("service={service} items={}", response.items.len()),
        );
        Ok(ProviderPricesRuntimeEffect { response, uow })
    }

    pub async fn get_prices(
        &self,
        query: ProviderPriceQuery,
    ) -> Result<ProviderPriceResponse, SmsError> {
        let effect = self
            .get_prices_runtime_effect(query)
            .await
            .map_err(|error| {
                if let Some(uow) = error.uow {
                    self.commit_runtime_uow(uow);
                }
                error.error
            })?;
        self.commit_runtime_uow(effect.uow);
        Ok(effect.response)
    }

    pub async fn list_provider_countries(
        &self,
        provider_id: &str,
    ) -> Result<OptionListResponse, SmsError> {
        let provider = {
            let registry = self.registry.read();
            registry.get(provider_id)?
        };
        if !provider.manifest().has_configured_api_key() {
            return Err(SmsError::InvalidRequest(format!(
                "provider `{provider_id}` requires api_key before resource discovery"
            )));
        }
        let items = provider.list_countries().await?;
        Ok(OptionListResponse {
            provider: provider_id.to_string(),
            items,
        })
    }

    pub async fn list_provider_services(
        &self,
        provider_id: &str,
        mut query: ProviderServicesQuery,
    ) -> Result<OptionListResponse, SmsError> {
        let provider = {
            let registry = self.registry.read();
            registry.get(provider_id)?
        };
        if !provider.manifest().has_configured_api_key() {
            return Err(SmsError::InvalidRequest(format!(
                "provider `{provider_id}` requires api_key before resource discovery"
            )));
        }
        let cached_options = self
            .provider_option_cache
            .read()
            .entries
            .get(provider_id)
            .cloned();
        if let Some(country) = query.country.as_ref().and_then(|value| {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        }) {
            query.country = Some(resolve_provider_value(
                cached_options.as_ref().map(|entry| &entry.options),
                OptionKind::Country,
                &country,
            ));
        }
        let items = provider.list_services(query).await?;
        Ok(OptionListResponse {
            provider: provider_id.to_string(),
            items,
        })
    }

    pub async fn list_provider_operators(
        &self,
        provider_id: &str,
        mut query: ProviderOperatorsQuery,
    ) -> Result<OptionListResponse, SmsError> {
        let provider = {
            let registry = self.registry.read();
            registry.get(provider_id)?
        };
        if !provider.manifest().has_configured_api_key() {
            return Err(SmsError::InvalidRequest(format!(
                "provider `{provider_id}` requires api_key before resource discovery"
            )));
        }
        let cached_options = self
            .provider_option_cache
            .read()
            .entries
            .get(provider_id)
            .cloned();
        let mut canonical_country_key = None;
        if let Some(country) = query.country.as_ref().and_then(|value| {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        }) {
            let country_key = operator_country_cache_key(Some(&country));
            canonical_country_key = country_key.clone();
            let settings = self.runtime_settings();
            if settings.option_cache_enabled {
                if let Some((items, fetched_at)) = cached_options.as_ref().and_then(|entry| {
                    country_key.as_ref().and_then(|key| {
                        entry
                            .options
                            .operators_by_country
                            .get(key)
                            .map(|operators| (operators.operators.clone(), operators.fetched_at))
                    })
                }) {
                    if cache_state(fetched_at, &settings) == OptionCacheState::Fresh {
                        return Ok(OptionListResponse {
                            provider: provider_id.to_string(),
                            items,
                        });
                    }
                }
            }
            query.country = Some(resolve_provider_value(
                cached_options.as_ref().map(|entry| &entry.options),
                OptionKind::Country,
                &country,
            ));
        }
        let raw_items = provider.list_operators(query.clone()).await?;
        let items = normalize_operator_options(raw_items.clone());
        if let Some(country_key) = canonical_country_key {
            let fetched_at = Utc::now();
            let persisted_store = {
                let mut store = self.provider_option_cache.write();
                let mut persisted_store = None;
                if let Some(entry) = store.entries.get_mut(provider_id) {
                    entry.options.operators_by_country.insert(
                        country_key,
                        crate::models::ProviderCountryOperatorOptions {
                            raw_operators: raw_items,
                            operators: items.clone(),
                            fetched_at: Some(fetched_at),
                        },
                    );
                    persisted_store = Some(store.clone());
                }
                persisted_store
            };
            if let Some(store) = persisted_store {
                self.persist_provider_metadata_cache_batch(ProviderMetadataCacheBatch {
                    option_cache: Some(store),
                    ..ProviderMetadataCacheBatch::default()
                });
            }
        }
        Ok(OptionListResponse {
            provider: provider_id.to_string(),
            items,
        })
    }

    pub fn list_tickets(&self) -> TicketListResponse {
        TicketListResponse {
            items: sorted_tickets(self.tickets.read().values().cloned().collect()),
        }
    }

    pub fn ticket(&self, ticket_id: &str) -> Result<TicketRecord, SmsError> {
        self.tickets
            .read()
            .get(ticket_id)
            .cloned()
            .ok_or_else(|| SmsError::InvalidRequest(format!("unknown ticket {ticket_id}")))
    }

    pub fn register_ticket_callback(
        &self,
        ticket_id: &str,
        request: TicketCallbackRegistrationRequest,
    ) -> Result<TicketCallbackSubscription, SmsError> {
        if !self.tickets.read().contains_key(ticket_id) {
            return Err(SmsError::InvalidRequest(format!(
                "unknown ticket {ticket_id}"
            )));
        }
        let parsed_url = Url::parse(&request.url)
            .map_err(|error| SmsError::InvalidRequest(format!("invalid callback url: {error}")))?;
        if !matches!(parsed_url.scheme(), "http" | "https") {
            return Err(SmsError::InvalidRequest(
                "callback url must use http or https".to_string(),
            ));
        }
        let subscription = TicketCallbackSubscription {
            id: Uuid::now_v7().to_string(),
            ticket_id: ticket_id.to_string(),
            url: request.url,
            secret: request.secret,
            created_at: Utc::now(),
        };
        self.callback_subscriptions
            .write()
            .entry(ticket_id.to_string())
            .or_default()
            .push(subscription.clone());
        Ok(subscription)
    }

    pub fn list_ticket_callbacks(
        &self,
        ticket_id: &str,
    ) -> Result<TicketCallbackListResponse, SmsError> {
        if !self.tickets.read().contains_key(ticket_id) {
            return Err(SmsError::InvalidRequest(format!(
                "unknown ticket {ticket_id}"
            )));
        }
        Ok(TicketCallbackListResponse {
            items: self
                .callback_subscriptions
                .read()
                .get(ticket_id)
                .cloned()
                .unwrap_or_default(),
        })
    }

    pub async fn maybe_dispatch_ticket_callbacks(&self) {
        let pending = self
            .callback_subscriptions
            .read()
            .iter()
            .filter(|(_, items)| !items.is_empty())
            .map(|(ticket_id, _)| ticket_id.clone())
            .collect::<Vec<_>>();

        for ticket_id in pending {
            let ticket = match self.ticket(&ticket_id) {
                Ok(ticket) => ticket,
                Err(_) => continue,
            };

            if ticket.status == TicketStatus::CancelPending {
                continue;
            }

            let latest = if ticket.code.is_some() {
                ticket
            } else {
                match self
                    .poll_code(PollCodeRequest {
                        ticket_id: ticket_id.clone(),
                    })
                    .await
                {
                    Ok(_) => match self.ticket(&ticket_id) {
                        Ok(updated) => updated,
                        Err(_) => continue,
                    },
                    Err(_) => continue,
                }
            };

            if latest.code.is_none() {
                continue;
            }

            let callbacks = self
                .callback_subscriptions
                .read()
                .get(&ticket_id)
                .cloned()
                .unwrap_or_default();
            let mut delivered_ids = Vec::new();
            let mut uow = RuntimeUnitOfWork::default();
            for callback in &callbacks {
                let payload = TicketCodeCallbackPayload {
                    ticket_id: latest.id.clone(),
                    provider: latest.provider.clone(),
                    service: latest.service.clone(),
                    country: latest.country.clone(),
                    phone_number: latest.phone_number.clone(),
                    code: latest.code.clone(),
                    message: latest.message.clone(),
                    received_at: Utc::now(),
                };
                let result = self
                    .callback_client
                    .post(&callback.url)
                    .json(&payload)
                    .send()
                    .await;
                match result {
                    Ok(response) if response.status().is_success() => {
                        delivered_ids.push(callback.id.clone());
                        self.log_into_uow(
                            &mut uow,
                            "callback",
                            "info",
                            format!("delivered callback for ticket `{ticket_id}`"),
                        );
                    }
                    Ok(response) => {
                        self.log_into_uow(
                            &mut uow,
                            "callback",
                            "warn",
                            format!(
                                "callback failed for ticket `{ticket_id}`: {}",
                                response.status()
                            ),
                        );
                    }
                    Err(error) => {
                        self.log_into_uow(
                            &mut uow,
                            "callback",
                            "warn",
                            format!("callback delivery error for ticket `{ticket_id}`: {error}"),
                        );
                    }
                }
            }
            self.commit_runtime_uow(uow);

            if delivered_ids.is_empty() {
                continue;
            }

            let delivered_ids = delivered_ids
                .into_iter()
                .collect::<std::collections::BTreeSet<_>>();
            let mut subscriptions = self.callback_subscriptions.write();
            let Some(entries) = subscriptions.get_mut(&ticket_id) else {
                continue;
            };
            entries.retain(|entry| !delivered_ids.contains(&entry.id));
            if entries.is_empty() {
                subscriptions.remove(&ticket_id);
            }
        }
    }

    pub async fn maybe_process_pending_releases(&self) {
        let now = Utc::now();
        let owner_id = format!("{}-{}", std::process::id(), Uuid::now_v7());
        if !self
            .release_coordination_repository
            .try_acquire_release_owner(&owner_id, now, AUTO_RELEASE_OWNER_LEASE_SEC)
        {
            return;
        }
        let pending = self
            .release_coordination_repository
            .pending_release_claims_or_empty(now);

        for claim in pending {
            let ticket_id = claim.ticket_id.clone();
            let action = claim.action.clone();
            let auto_release_at = claim.auto_release_at;
            let retry_deadline_at = claim.retry_deadline_at;
            let retry_count = claim.retry_count;
            let current = match self.ticket(&ticket_id) {
                Ok(ticket) => ticket,
                Err(_) => continue,
            };
            let provider = {
                let registry = self.registry.read();
                match registry.get(&current.provider) {
                    Ok(provider) => provider,
                    Err(_) => continue,
                }
            };

            if current.status == TicketStatus::CancelPending
                && matches!(
                    action,
                    crate::models::ReleaseAction::Cancel | crate::models::ReleaseAction::Ban
                )
            {
                let poll_details = format!("ticket_id={ticket_id}");
                match provider.poll_code(&current).await {
                    Ok(response)
                        if response.status == TicketStatus::Failed
                            && response
                                .message
                                .as_deref()
                                .is_some_and(is_terminal_cancel_status) =>
                    {
                        let upstream_message = response.message.unwrap_or_else(|| {
                            "provider reported activation already cancelled".to_string()
                        });
                        let updated = self.update_ticket_in_memory(&ticket_id, |ticket| {
                            ticket.updated_at = Utc::now();
                            ticket.status = TicketStatus::Cancelled;
                            ticket.message = Some(upstream_message.clone());
                            ticket.pending_release_action = None;
                            ticket.auto_release_at = None;
                            ticket.next_release_attempt_at = None;
                            ticket.release_retry_deadline_at = None;
                            ticket.release_retry_count = 0;
                            ticket.same_activation_retry_supported = false;
                            ticket.same_activation_retry_expires_at = Some(ticket.updated_at);
                        });
                        if let Ok(ticket) = updated {
                            let mut uow = RuntimeUnitOfWork::default();
                            uow.batch.upsert_ticket = Some(ticket.clone());
                            self.log_upstream_request_into_uow(
                                &mut uow,
                                &current.provider,
                                "poll",
                                poll_details,
                            );
                            self.log_upstream_response_into_uow(
                                &mut uow,
                                &current.provider,
                                "poll",
                                "200",
                                &upstream_message,
                            );
                            self.log_into_uow(
                                &mut uow,
                                "system",
                                "info",
                                format!(
                                    "ticket {} reconciled to cancelled from provider status",
                                    ticket_id
                                ),
                            );
                            self.push_ticket_activity_into_uow(
                                &mut uow,
                                ActivityKind::ReleaseEvent,
                                ActivityLevel::Info,
                                "自动取消已与服务商状态收敛".to_string(),
                                Some("服务商侧已无激活，工单直接标记为已取消".to_string()),
                                &ticket,
                            );
                            self.commit_runtime_uow(uow);
                        }
                        continue;
                    }
                    Ok(_) => {}
                    Err(error) => {
                        let mut uow = RuntimeUnitOfWork::default();
                        self.log_upstream_request_into_uow(
                            &mut uow,
                            &current.provider,
                            "poll",
                            poll_details,
                        );
                        self.log_upstream_response_into_uow(
                            &mut uow,
                            &current.provider,
                            "poll",
                            "error",
                            error.to_string(),
                        );
                        self.commit_runtime_uow(uow);
                    }
                }
            }

            if retry_deadline_at.is_some_and(|deadline| now > deadline) {
                let updated = self.update_ticket_in_memory(&ticket_id, |ticket| {
                    ticket.updated_at = Utc::now();
                    ticket.status = TicketStatus::WaitingCode;
                    ticket.message = Some("auto cancel retry window expired".to_string());
                    ticket.pending_release_action = None;
                    ticket.auto_release_at = None;
                    ticket.next_release_attempt_at = None;
                    ticket.release_retry_deadline_at = None;
                    ticket.release_retry_count = retry_count;
                });
                if let Ok(ticket) = updated {
                    let log_entry = self.log_entry(
                        "system",
                        "error",
                        format!("ticket {} auto cancel expired", ticket_id),
                    );
                    let activity_entry = self.ticket_activity_entry(
                        ActivityKind::ReleaseEvent,
                        ActivityLevel::Error,
                        "自动取消重试窗口已过期".to_string(),
                        Some("服务商侧取消未完成，工单恢复为等待短信状态".to_string()),
                        &ticket,
                    );
                    let mut uow = RuntimeUnitOfWork::default();
                    uow.batch.upsert_ticket = Some(ticket);
                    self.append_log_to_uow(&mut uow, log_entry);
                    self.append_activity_to_uow(&mut uow, activity_entry);
                    self.commit_runtime_uow(uow);
                }
                continue;
            }

            if let Some(auto_release_at) = auto_release_at {
                let retry_limit = auto_release_retry_limit(
                    (retry_deadline_at.unwrap_or(auto_release_at) - auto_release_at)
                        .num_seconds()
                        .max(0) as u64,
                );
                if retry_count >= retry_limit {
                    let updated = self.update_ticket_in_memory(&ticket_id, |ticket| {
                        ticket.updated_at = Utc::now();
                        ticket.status = TicketStatus::WaitingCode;
                        ticket.message = Some("auto cancel retry limit reached".to_string());
                        ticket.pending_release_action = None;
                        ticket.auto_release_at = None;
                        ticket.next_release_attempt_at = None;
                        ticket.release_retry_deadline_at = None;
                    });
                    if let Ok(ticket) = updated {
                        let log_entry = self.log_entry(
                            "system",
                            "error",
                            format!("ticket {} auto cancel retry limit reached", ticket_id),
                        );
                        let activity_entry = self.ticket_activity_entry(
                            ActivityKind::ReleaseEvent,
                            ActivityLevel::Error,
                            "自动取消已达到重试上限".to_string(),
                            Some("服务商侧取消未完成，工单恢复为等待短信状态".to_string()),
                            &ticket,
                        );
                        let mut uow = RuntimeUnitOfWork::default();
                        uow.batch.upsert_ticket = Some(ticket);
                        self.append_log_to_uow(&mut uow, log_entry);
                        self.append_activity_to_uow(&mut uow, activity_entry);
                        self.commit_runtime_uow(uow);
                    }
                    continue;
                }
            }

            match self
                .release_code_runtime_effect(ReleaseCodeRequest {
                    ticket_id: ticket_id.clone(),
                    action,
                })
                .await
            {
                Ok(mut effect) => {
                    if effect.response.status == TicketStatus::CancelPending {
                        self.log_into_uow(
                            &mut effect.uow,
                            "system",
                            "warn",
                            format!("ticket {} auto cancel retry scheduled", ticket_id),
                        );
                    } else {
                        self.log_into_uow(
                            &mut effect.uow,
                            "system",
                            "info",
                            format!("ticket {} auto cancel completed", ticket_id),
                        );
                    }
                    self.commit_runtime_uow(effect.uow);
                }
                Err(error) => {
                    let message = error.error.to_string();
                    let updated = self.update_ticket_in_memory(&ticket_id, |ticket| {
                        ticket.updated_at = Utc::now();
                        ticket.status = TicketStatus::CancelPending;
                        ticket.message = Some(format!("auto cancel retry failed: {}", message));
                        ticket.next_release_attempt_at =
                            Some(Utc::now() + Duration::seconds(AUTO_RELEASE_RETRY_INTERVAL_SEC));
                        ticket.release_retry_count = retry_count + 1;
                    });
                    if let Ok(ticket) = updated {
                        let log_entry = self.log_entry(
                            "system",
                            "warn",
                            format!(
                                "ticket {} auto cancel retry failed: {}",
                                ticket_id, error.error
                            ),
                        );
                        let activity_entry = self.ticket_activity_entry(
                            ActivityKind::ReleaseEvent,
                            ActivityLevel::Warn,
                            "自动取消重试失败".to_string(),
                            None,
                            &ticket,
                        );
                        let mut uow = error.uow.unwrap_or_default();
                        uow.batch.upsert_ticket = Some(ticket);
                        self.append_log_to_uow(&mut uow, log_entry);
                        self.append_activity_to_uow(&mut uow, activity_entry);
                        self.commit_runtime_uow(uow);
                    }
                }
            }
        }
        self.release_coordination_repository
            .release_release_owner_quietly(&owner_id);
    }

    pub fn list_provider_manifests(&self) -> ProviderManifestList {
        let manifests = self.registry.read().list_manifests();
        ProviderManifestList { manifests }
    }

    pub async fn provider_dynamic_options(
        &self,
        provider_id: &str,
    ) -> Result<ProviderDynamicOptions, SmsError> {
        let settings = self.runtime_settings();
        let cached = self
            .provider_option_cache
            .read()
            .entries
            .get(provider_id)
            .cloned();
        if let Some(entry) = cached.clone() {
            let state = cache_state(Some(entry.fetched_at), &settings);
            if !settings.option_cache_enabled || state == OptionCacheState::Fresh {
                return Ok(with_cache_state(entry.options, &settings));
            }
        }
        match self
            .refresh_provider_options_runtime_effect(provider_id)
            .await
        {
            Ok(effect) => {
                self.commit_runtime_uow(effect.uow);
                Ok(effect.response)
            }
            Err(error) => {
                if let Some(uow) = error.uow {
                    self.commit_runtime_uow(uow);
                }
                if let Some(entry) = cached {
                    Ok(with_cache_state(entry.options, &settings))
                } else {
                    Err(error.error)
                }
            }
        }
    }

    pub fn provider_cached_options(
        &self,
        provider_id: &str,
    ) -> Result<ProviderDynamicOptions, SmsError> {
        let settings = self.runtime_settings();
        let entry = self
            .provider_option_cache
            .read()
            .entries
            .get(provider_id)
            .cloned()
            .ok_or_else(|| {
                SmsError::InvalidRequest(format!(
                    "provider `{provider_id}` has no cached options yet"
                ))
            })?;
        Ok(with_cache_state(entry.options, &settings))
    }

    async fn refresh_provider_options_runtime_effect(
        &self,
        provider_id: &str,
    ) -> Result<ProviderOptionsRuntimeEffect, ProviderOptionsRuntimeError> {
        let manifest = {
            let registry = self.registry.read();
            registry
                .manifest(provider_id)
                .map_err(|error| ProviderOptionsRuntimeError { error, uow: None })?
        };
        let mut uow = RuntimeUnitOfWork::default();
        self.log_upstream_request_into_uow(&mut uow, provider_id, "discover_options", "");
        let raw_options = match self.discover_provider_options(provider_id, &mut uow).await {
            Ok(options) => {
                self.log_upstream_response_into_uow(
                    &mut uow,
                    provider_id,
                    "discover_options",
                    "200",
                    "options refreshed",
                );
                options
            }
            Err(error) => {
                self.log_upstream_response_into_uow(
                    &mut uow,
                    provider_id,
                    "discover_options",
                    "error",
                    error.to_string(),
                );
                return Err(ProviderOptionsRuntimeError {
                    error,
                    uow: Some(uow),
                });
            }
        };
        let fetched_at = Utc::now();
        let persisted_raw_store = {
            let mut raw_store = self.provider_raw_option_audit.write();
            raw_store.entries.insert(
                provider_id.to_string(),
                ProviderRawOptionAuditEntry {
                    provider: provider_id.to_string(),
                    fetched_at,
                    raw_services: raw_options.services.clone(),
                    raw_countries: raw_options.countries.clone(),
                    raw_operators: raw_options.operators.clone(),
                },
            );
            raw_store.clone()
        };
        let normalized = normalize_provider_options(&manifest, raw_options, fetched_at);
        let persisted_option_store = {
            let mut store = self.provider_option_cache.write();
            store.entries.insert(
                provider_id.to_string(),
                ProviderOptionCacheEntry {
                    provider: provider_id.to_string(),
                    fetched_at,
                    options: normalized.clone(),
                },
            );
            store.clone()
        };
        self.persist_provider_metadata_cache_batch(ProviderMetadataCacheBatch {
            option_cache: Some(persisted_option_store),
            raw_option_audit: Some(persisted_raw_store),
        });
        Ok(ProviderOptionsRuntimeEffect {
            response: with_cache_state(normalized, &self.runtime_settings()),
            uow,
        })
    }

    pub async fn refresh_provider_options(
        &self,
        provider_id: &str,
    ) -> Result<ProviderDynamicOptions, SmsError> {
        let effect = self
            .refresh_provider_options_runtime_effect(provider_id)
            .await
            .map_err(|error| {
                if let Some(uow) = error.uow {
                    self.commit_runtime_uow(uow);
                }
                error.error
            })?;
        self.commit_runtime_uow(effect.uow);
        Ok(effect.response)
    }

    async fn discover_provider_options(
        &self,
        provider_id: &str,
        uow: &mut RuntimeUnitOfWork,
    ) -> Result<ProviderDynamicOptions, SmsError> {
        let (manifest, provider) = {
            let registry = self.registry.read();
            (registry.manifest(provider_id)?, registry.get(provider_id)?)
        };
        if !manifest.has_configured_api_key() {
            return Err(SmsError::InvalidRequest(format!(
                "provider `{provider_id}` requires api_key before resource discovery"
            )));
        }

        let countries = provider.list_countries().await?;
        let country_seed = countries
            .iter()
            .find_map(option_request_value)
            .or_else(|| non_empty_value(&manifest.defaults.country));
        let operators = provider
            .list_operators(ProviderOperatorsQuery {
                country: country_seed.clone(),
            })
            .await?;

        let services = if matches!(manifest.kind, plugin_sdk::ProviderKind::FiveSim) {
            match country_seed.as_ref() {
                Some(country) => {
                    let operator_seeds = {
                        let seeds = operators
                            .iter()
                            .filter_map(option_request_value)
                            .collect::<Vec<_>>();
                        if seeds.is_empty() {
                            option_request_value(&default_operator_option(&manifest))
                                .into_iter()
                                .collect::<Vec<_>>()
                        } else {
                            seeds
                        }
                    };
                    let mut merged = Vec::new();
                    for operator in operator_seeds {
                        match provider
                            .list_services(ProviderServicesQuery {
                                country: Some(country.clone()),
                                operator: Some(operator.clone()),
                            })
                            .await
                        {
                            Ok(mut items) => merged.append(&mut items),
                            Err(error) => self.log_into_uow(
                                uow,
                                "cache",
                                "warn",
                                format!(
                                    "provider `{provider_id}` service discovery failed for country `{country}` operator `{operator}`: {error}"
                                ),
                            ),
                        }
                    }
                    merged
                }
                None => Vec::new(),
            }
        } else {
            provider
                .list_services(ProviderServicesQuery::default())
                .await?
        };
        let default_operators = if operators.is_empty() {
            vec![default_operator_option(&manifest)]
        } else {
            operators.clone()
        };

        Ok(ProviderDynamicOptions {
            provider: provider_id.to_string(),
            raw_services: Vec::new(),
            raw_countries: Vec::new(),
            raw_operators: Vec::new(),
            services: if services.is_empty() {
                vec![default_service_option(&manifest)]
            } else {
                services
            },
            countries: if countries.is_empty() {
                vec![default_country_option(&manifest)]
            } else {
                countries
            },
            operators: default_operators.clone(),
            operators_by_country: country_seed
                .as_ref()
                .and_then(|country| {
                    operator_country_cache_key(Some(country)).map(|key| (country, key))
                })
                .map(|(_, key)| {
                    BTreeMap::from([(
                        key,
                        crate::models::ProviderCountryOperatorOptions {
                            raw_operators: default_operators.clone(),
                            operators: Vec::new(),
                            fetched_at: None,
                        },
                    )])
                })
                .unwrap_or_default(),
            cache_state: OptionCacheState::Fresh,
            fetched_at: None,
        })
    }

    pub fn provider_manifest(&self, provider_id: &str) -> Result<ProviderManifest, SmsError> {
        self.registry.read().manifest(provider_id)
    }

    pub async fn save_provider_manifest(
        &self,
        provider_id: &str,
        manifest: ProviderManifest,
    ) -> Result<ProviderManifestSaveResponse, SmsError> {
        if manifest.enabled && !self.can_enable_manifest(provider_id) {
            return Err(SmsError::InvalidRequest(
                "provider cannot be enabled before a fresh option cache is available".to_string(),
            ));
        }
        let saved = self.registry.write().save_manifest(provider_id, manifest)?;
        let cache_refresh = self.refresh_provider_options(provider_id).await;
        self.log(
            "config",
            "info",
            format!("provider manifest `{provider_id}` saved and reloaded"),
        );
        let (option_cache_state, option_cache_fetched_at, cache_refresh_error) = match cache_refresh
        {
            Ok(options) => (options.cache_state, options.fetched_at, None),
            Err(error) => (
                self.provider_option_cache_state(provider_id),
                self.provider_option_cache_fetched_at(provider_id),
                Some(error.to_string()),
            ),
        };
        Ok(ProviderManifestSaveResponse {
            manifest: saved,
            option_cache_state,
            option_cache_fetched_at,
            cache_refresh_error,
        })
    }

    pub fn reload_provider_registry(&self) -> Result<ProviderManifestList, SmsError> {
        self.registry.write().reload()?;
        self.log("config", "info", "provider registry reloaded");
        Ok(self.list_provider_manifests())
    }

    pub fn list_routing_plans(&self) -> RoutingPlanList {
        RoutingPlanList {
            plans: self.routing_plans.read().plans.clone(),
        }
    }

    pub fn routing_plan(&self, plan_id: &str) -> Result<RoutingPlan, SmsError> {
        self.routing_plans
            .read()
            .plans
            .iter()
            .find(|plan| plan.id == plan_id)
            .cloned()
            .ok_or_else(|| SmsError::InvalidRequest(format!("routing plan `{plan_id}` not found")))
    }

    pub fn save_routing_plan(&self, mut plan: RoutingPlan) -> Result<RoutingPlan, SmsError> {
        if plan.id.trim().is_empty() {
            plan.id = generate_routing_plan_id();
        }
        if plan.execution_rounds != 0 {
            plan.execution_rounds = plan.execution_rounds.max(1);
        }
        normalize_routing_plan_service(&mut plan);
        for item in &mut plan.items {
            normalize_routing_plan_item(item);
        }
        if plan.name.trim().is_empty() {
            return Err(SmsError::InvalidRequest(
                "routing plan name is required".to_string(),
            ));
        }
        if plan.service.trim().is_empty() {
            return Err(SmsError::InvalidRequest(
                "routing plan service is required".to_string(),
            ));
        }
        if plan.items.is_empty() {
            return Err(SmsError::InvalidRequest(
                "routing plan must contain at least one item".to_string(),
            ));
        }
        if plan.enabled && !plan.items.iter().any(|item| item.enabled) {
            return Err(SmsError::InvalidRequest(
                "enabled routing plan must contain at least one enabled item".to_string(),
            ));
        }
        for (index, item) in plan.items.iter_mut().enumerate() {
            if item.id.trim().is_empty() {
                item.id = format!("{}-item-{}", plan.id, index + 1);
            }
        }

        let persisted_store = {
            let current = self.routing_plans.read();
            let mut next = current.clone();
            if let Some(existing) = next
                .plans
                .iter_mut()
                .find(|existing| existing.id == plan.id)
            {
                *existing = plan.clone();
            } else {
                next.plans.push(plan.clone());
            }
            next
        };
        self.runtime_config_repository
            .save_routing_plans(&persisted_store)?;
        *self.routing_plans.write() = persisted_store;
        self.log(
            "config",
            "info",
            format!("routing plan `{}` saved", plan.id),
        );
        Ok(plan)
    }

    pub fn delete_routing_plan(&self, plan_id: &str) -> Result<RoutingPlanList, SmsError> {
        let persisted_store = {
            let current = self.routing_plans.read();
            let mut next = current.clone();
            let before = next.plans.len();
            next.plans.retain(|plan| plan.id != plan_id);
            if before == next.plans.len() {
                return Err(SmsError::InvalidRequest(format!(
                    "routing plan `{plan_id}` not found"
                )));
            }
            next
        };
        self.runtime_config_repository
            .save_routing_plans(&persisted_store)?;
        *self.routing_plans.write() = persisted_store.clone();
        self.log(
            "config",
            "info",
            format!("routing plan `{plan_id}` deleted"),
        );
        Ok(RoutingPlanList {
            plans: persisted_store.plans,
        })
    }

    pub fn reorder_providers(
        &self,
        req: ProviderReorderRequest,
    ) -> Result<ProviderManifestList, SmsError> {
        let pairs: Vec<(String, u32)> = req.order.into_iter().map(|e| (e.id, e.priority)).collect();
        self.registry.write().set_priorities(&pairs)?;
        self.log("config", "info", "provider priority order saved");
        Ok(self.list_provider_manifests())
    }

    pub fn notification_feed(&self) -> NotificationFeed {
        NotificationFeed {
            items: self
                .logs
                .read()
                .iter()
                .rev()
                .filter(|entry| Self::should_include_in_notification_feed(entry))
                .take(DEFAULT_NOTIFICATION_FEED_LIMIT)
                .cloned()
                .collect(),
        }
    }

    pub fn activity_feed(&self) -> ActivityFeed {
        ActivityFeed {
            items: self
                .activity
                .read()
                .iter()
                .rev()
                .take(SNAPSHOT_ACTIVITY_LIMIT)
                .cloned()
                .collect(),
        }
    }

    pub fn clear_logs(&self) {
        self.logs.write().clear();
        self.persist_runtime_batch(RuntimeStoreBatch {
            clear_logs: true,
            ..RuntimeStoreBatch::default()
        });
    }

    pub fn runtime_settings(&self) -> RuntimeSettings {
        self.runtime_settings.read().clone()
    }

    pub fn runtime_access_info(&self, overridden_secret: Option<&str>) -> RuntimeAccessInfo {
        let settings = self.runtime_settings();
        RuntimeAccessInfo {
            http_port: settings.http_port,
            http_secret_overridden: overridden_secret.is_some(),
            requires_http_login: true,
        }
    }

    pub fn update_runtime_settings(
        &self,
        update: RuntimeSettingsUpdate,
    ) -> Result<RuntimeSettings, SmsError> {
        let updated = {
            let current = self.runtime_settings.read();
            let mut next = current.clone();
            next.routing_strategy = update.routing_strategy;
            next.auto_fallback = update.auto_fallback;
            next.option_cache_enabled = update.option_cache_enabled;
            next.option_cache_poll_interval_minutes =
                update.option_cache_poll_interval_minutes.max(1);
            next.only_show_openai_sms_countries = update.only_show_openai_sms_countries;
            next.check_updates_on_launch = update.check_updates_on_launch;
            next.http_port = update.http_port.max(1);
            next.stats_sync_enabled = update.stats_sync_enabled;
            next.stats_sync_base_url = update.stats_sync_base_url.trim().to_string();
            next.stats_sync_api_token = update.stats_sync_api_token.trim().to_string();
            next
        };
        self.runtime_config_repository.save_settings(&updated)?;
        *self.runtime_settings.write() = updated.clone();
        self.log("config", "info", "runtime routing settings updated");
        Ok(updated)
    }

    pub fn regenerate_http_secret(&self) -> Result<RuntimeSettings, SmsError> {
        let updated = {
            let current = self.runtime_settings.read();
            let mut next = current.clone();
            next.http_secret = generate_runtime_secret();
            next
        };
        self.runtime_config_repository.save_settings(&updated)?;
        *self.runtime_settings.write() = updated.clone();
        self.log("config", "info", "http secret regenerated");
        Ok(updated)
    }

    pub fn effective_http_secret(&self, overridden_secret: Option<&str>) -> String {
        overridden_secret
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| self.runtime_settings().http_secret)
    }

    pub fn runtime_snapshot(&self) -> RuntimeSnapshot {
        let registry = self.registry.read();
        let settings = self.runtime_settings();
        let balance_cache = self.provider_balance_cache.read().clone();
        let providers = registry
            .manifests()
            .map(|manifest| ProviderSummary {
                id: manifest.id.clone(),
                name: manifest.name.clone(),
                enabled: manifest.enabled,
                kind: format!("{:?}", manifest.kind).to_ascii_lowercase(),
                protocol: manifest.protocol_name().to_string(),
                protocol_label: Some(manifest.protocol_display_name()),
                primary_endpoint: manifest.primary_endpoint(),
                default_service: manifest.defaults.service.clone(),
                default_country: manifest.defaults.country.clone(),
                homepage: manifest.homepage.clone(),
                description: manifest.description.clone(),
                priority: manifest.priority,
                icon_url: manifest.provider_icon_url(),
                badge_label: Some(manifest.provider_badge_label()),
                cancel_cooldown_sec: manifest.behavior.cancel_cooldown_sec,
                operator_selectable: manifest.behavior.operator_selectable,
                option_cache_state: self
                    .provider_option_cache_state_with_settings(&manifest.id, &settings),
                option_cache_fetched_at: self.provider_option_cache_fetched_at(&manifest.id),
                balance: balance_cache.get(&manifest.id).map(|entry| entry.amount),
                balance_currency: balance_cache
                    .get(&manifest.id)
                    .map(|entry| entry.currency.clone()),
                balance_fetched_at: balance_cache
                    .get(&manifest.id)
                    .map(|entry| entry.fetched_at),
                can_enable: matches!(manifest.kind, plugin_sdk::ProviderKind::Mock)
                    || !settings.option_cache_enabled
                    || self.provider_option_cache_state_with_settings(&manifest.id, &settings)
                        == OptionCacheState::Fresh,
                reuse_capabilities: ProviderCapabilityMatrix::new()
                    .capabilities_for(&manifest.id)
                    .iter()
                    .map(|cap| match cap {
                        ReuseCapability::ExactNumberReuse => "exact_reuse".to_string(),
                        ReuseCapability::IntentReuse => "intent_reuse".to_string(),
                        ReuseCapability::SameActivationRetry => "same_activation_retry".to_string(),
                        ReuseCapability::Unsupported => "unsupported".to_string(),
                    })
                    .collect(),
            })
            .collect();
        let tickets = sorted_tickets(self.tickets.read().values().cloned().collect());
        let logs = self.logs.read().iter().cloned().collect();
        let activity = self
            .activity
            .read()
            .iter()
            .rev()
            .take(SNAPSHOT_ACTIVITY_LIMIT)
            .cloned()
            .collect();
        let reuse_pool = self
            .reuse_pool
            .read()
            .iter()
            .flat_map(|(provider, entries)| {
                let mut grouped: HashMap<(String, String), ReusePoolSummary> = HashMap::new();
                for entry in entries {
                    let summary = grouped
                        .entry((entry.service.clone(), entry.country.clone()))
                        .or_insert_with(|| ReusePoolSummary {
                            provider: provider.clone(),
                            service: entry.service.clone(),
                            country: entry.country.clone(),
                            active_count: 0,
                            max_reuse: 0,
                            last_used_at: None,
                            expires_at: None,
                        });
                    summary.active_count += 1;
                    summary.max_reuse = summary.max_reuse.max(entry.max_reuse);
                    summary.last_used_at = match summary.last_used_at {
                        Some(current) if current >= entry.last_used_at => Some(current),
                        _ => Some(entry.last_used_at),
                    };
                    summary.expires_at = match summary.expires_at {
                        Some(current) if current >= entry.expires_at => Some(current),
                        _ => Some(entry.expires_at),
                    };
                }
                grouped.into_values().collect::<Vec<_>>()
            })
            .collect();
        RuntimeSnapshot {
            providers,
            tickets,
            logs,
            reuse_pool,
            activity,
            stats_sync_status: Some(self.stats_sync_status.read().clone()),
        }
    }

    pub fn stats_sync_status(&self) -> StatsSyncStatus {
        self.stats_sync_status.read().clone()
    }

    pub async fn sync_ticket_stats(&self) -> Result<StatsSyncResult, SmsError> {
        let settings = self.runtime_settings();
        if !settings.stats_sync_enabled {
            return Ok(StatsSyncResult {
                uploaded: 0,
                remaining: self.stats_sync_status().pending_events,
                status: self.stats_sync_status(),
            });
        }
        if settings.stats_sync_base_url.trim().is_empty() {
            return Err(SmsError::InvalidRequest(
                "stats sync base URL is not configured".to_string(),
            ));
        }
        if settings.stats_sync_api_token.trim().is_empty() {
            return Err(SmsError::InvalidRequest(
                "stats sync API token is not configured".to_string(),
            ));
        }

        let events = self
            .ticket_stats_events
            .read()
            .iter()
            .filter(|event| event.synced_at.is_none())
            .cloned()
            .collect::<Vec<_>>();
        if events.is_empty() {
            return Ok(StatsSyncResult {
                uploaded: 0,
                remaining: 0,
                status: self.stats_sync_status(),
            });
        }

        let base_url = settings.stats_sync_base_url.trim().trim_end_matches('/');
        let payload = serde_json::json!({
            "app_instance_id": settings.stats_sync_instance_id,
            "app_version": env!("CARGO_PKG_VERSION"),
            "events": events,
        });
        let now = Utc::now();
        let response = self
            .callback_client
            .post(format!("{base_url}/v1/events"))
            .bearer_auth(settings.stats_sync_api_token.trim())
            .json(&payload)
            .send()
            .await
            .map_err(|err| {
                let message = format!("stats sync request failed: {err}");
                let mut status = self.stats_sync_status.write();
                status.last_attempt_at = Some(now);
                status.last_error = Some(message.clone());
                self.persist_runtime_batch(RuntimeStoreBatch {
                    stats_sync_status: Some(status.clone()),
                    ..RuntimeStoreBatch::default()
                });
                SmsError::Upstream(message)
            })?;
        if !response.status().is_success() {
            let body = response
                .text()
                .await
                .unwrap_or_else(|_| "stats sync failed".to_string());
            let mut status = self.stats_sync_status.write();
            status.last_attempt_at = Some(now);
            status.last_error = Some(body.clone());
            self.persist_runtime_batch(RuntimeStoreBatch {
                stats_sync_status: Some(status.clone()),
                ..RuntimeStoreBatch::default()
            });
            return Err(SmsError::Upstream(body));
        }

        {
            let mut stored = self.ticket_stats_events.write();
            for stored_event in stored.iter_mut() {
                if stored_event.synced_at.is_none() {
                    stored_event.synced_at = Some(now);
                }
            }
        }
        let remaining = self
            .ticket_stats_events
            .read()
            .iter()
            .filter(|event| event.synced_at.is_none())
            .count() as u32;
        let status = {
            let mut status = self.stats_sync_status.write();
            status.pending_events = remaining;
            status.last_attempt_at = Some(now);
            status.last_success_at = Some(now);
            status.last_error = None;
            status.clone()
        };
        self.persist_runtime_batch(RuntimeStoreBatch {
            mark_stats_events_synced: events.iter().map(|event| (event.id.clone(), now)).collect(),
            stats_sync_status: Some(status.clone()),
            ..RuntimeStoreBatch::default()
        });
        Ok(StatsSyncResult {
            uploaded: events.len() as u32,
            remaining,
            status,
        })
    }

    pub async fn fetch_remote_stats_summary(
        &self,
        query: RemoteStatsSummaryQuery,
    ) -> Result<RemoteStatsSummaryResponse, SmsError> {
        let settings = self.runtime_settings();
        let base_url = settings.stats_sync_base_url.trim();
        if base_url.is_empty() {
            return Err(SmsError::InvalidRequest(
                "stats sync base URL is not configured".to_string(),
            ));
        }

        let lookback_hours = normalize_stats_summary_snapshot_lookback(query.lookback_hours)
            .ok_or_else(|| {
                SmsError::InvalidRequest(
                    "stats summary snapshots only support lookback_hours 24, 72, or 168"
                        .to_string(),
                )
            })?;
        let mut url = Url::parse(&format!("{}/v1/summary", base_url.trim_end_matches('/')))
            .map_err(|err| SmsError::Config(format!("invalid stats summary URL: {err}")))?;
        {
            let mut params = url.query_pairs_mut();
            params.append_pair("lookback_hours", &lookback_hours.to_string());
        }

        let response = self
            .callback_client
            .get(url)
            .send()
            .await
            .map_err(|err| SmsError::Upstream(format!("fetch remote stats failed: {err}")))?;
        if !response.status().is_success() {
            return Err(SmsError::Upstream(
                response
                    .text()
                    .await
                    .unwrap_or_else(|_| "fetch remote stats failed".to_string()),
            ));
        }
        let snapshot = response
            .json::<RemoteStatsSummaryResponse>()
            .await
            .map_err(|err| SmsError::Config(format!("decode remote stats failed: {err}")))?;
        Ok(filter_remote_stats_summary_snapshot(snapshot, &query))
    }

    fn try_same_activation_retry_candidate(
        &self,
        provider: &str,
        service: &str,
        country: &str,
    ) -> Option<TicketRecord> {
        let now = Utc::now();
        let max_reuse = self
            .registry
            .read()
            .manifest(provider)
            .map(|manifest| manifest.defaults.reuse_max)
            .unwrap_or(2);
        self.tickets
            .read()
            .values()
            .filter(|ticket| {
                ticket.provider == provider
                    && ticket.service == service
                    && ticket.country == country
                    && ticket.same_activation_retry_supported
                    && ticket
                        .same_activation_retry_expires_at
                        .is_none_or(|expires_at| expires_at > now)
                    && ticket.reuse_count < max_reuse
                    && matches!(
                        ticket.status,
                        TicketStatus::WaitingCode | TicketStatus::CodeReceived
                    )
            })
            .max_by_key(|ticket| ticket.updated_at)
            .cloned()
    }

    pub fn clear_provider_reuse_pool(
        &self,
        provider_id: &str,
    ) -> Result<crate::models::ReusePoolClearResponse, SmsError> {
        self.registry.read().manifest(provider_id)?;
        let removed = {
            let mut pool = self.reuse_pool.write();
            pool.remove(provider_id)
                .map(|entries| entries.len() as u32)
                .unwrap_or(0)
        };
        let mut uow = RuntimeUnitOfWork::default();
        self.replace_reuse_bucket_in_uow(&mut uow, provider_id.to_string(), Vec::new());
        self.log_into_uow(
            &mut uow,
            "reuse_pool",
            "info",
            format!(
                "reuse_pool: cleared provider={} removed={}",
                provider_id, removed
            ),
        );
        self.commit_runtime_uow(uow);
        Ok(crate::models::ReusePoolClearResponse {
            provider: provider_id.to_string(),
            removed,
        })
    }

    fn consume_exact_reuse_candidate(&self, provider: &str, candidate: &ReusePoolEntry) {
        let mut pool = self.reuse_pool.write();
        let Some(entries) = pool.get_mut(provider) else {
            return;
        };
        if let Some(pos) = entries.iter().position(|entry| {
            entry.phone_number == candidate.phone_number
                && entry.service == candidate.service
                && entry.country == candidate.country
                && entry.reuse_key == candidate.reuse_key
        }) {
            entries.remove(pos);
        }
    }

    fn last_reused_entry_for_ticket(&self, ticket: &TicketRecord) -> Option<ReusePoolEntry> {
        Some(ReusePoolEntry {
            reuse_key: match ticket.provider.as_str() {
                "herosms" => ticket.upstream_id.clone(),
                "fivesim" => Some(ticket.phone_number.clone()),
                _ => None,
            },
            phone_number: ticket.phone_number.clone(),
            provider: ticket.provider.clone(),
            service: ticket.service.clone(),
            country: ticket.country.clone(),
            upstream_id: ticket.upstream_id.clone(),
            reuse_count: ticket.reuse_count,
            max_reuse: self
                .registry
                .read()
                .manifest(&ticket.provider)
                .map(|manifest| manifest.defaults.reuse_max)
                .unwrap_or(2),
            last_used_at: ticket.updated_at,
            expires_at: ticket.updated_at,
        })
    }

    pub fn option_cache_overview(&self) -> OptionCacheOverview {
        let manifests = self.registry.read().list_manifests();
        let settings = self.runtime_settings();
        let store = self.provider_option_cache.read().clone();
        build_cache_overview(&manifests, &store, &settings)
    }

    pub async fn refresh_all_provider_options(&self) -> OptionCacheOverview {
        let provider_ids = {
            let registry = self.registry.read();
            registry
                .list_manifests()
                .into_iter()
                .filter(|manifest| manifest.kind != plugin_sdk::ProviderKind::Mock)
                .map(|manifest| manifest.id)
                .collect::<Vec<_>>()
        };

        for provider_id in provider_ids {
            match self
                .refresh_provider_options_runtime_effect(&provider_id)
                .await
            {
                Ok(mut effect) => {
                    self.log_into_uow(
                        &mut effect.uow,
                        "cache",
                        "info",
                        format!("provider option cache refreshed for `{provider_id}`"),
                    );
                    self.commit_runtime_uow(effect.uow);
                }
                Err(error) => {
                    let mut uow = error.uow.unwrap_or_default();
                    self.log_into_uow(
                        &mut uow,
                        "cache",
                        "warn",
                        format!(
                            "provider option cache refresh failed for `{provider_id}`: {}",
                            error.error
                        ),
                    );
                    self.commit_runtime_uow(uow);
                }
            }
        }

        self.option_cache_overview()
    }

    pub async fn refresh_all_provider_balances(&self) {
        let manifests = {
            let registry = self.registry.read();
            registry.list_manifests()
        };

        for manifest in manifests {
            if matches!(manifest.kind, plugin_sdk::ProviderKind::Mock) {
                continue;
            }
            if !manifest.enabled || !manifest.has_configured_api_key() {
                continue;
            }

            match self.get_balance_runtime_effect(&manifest.id).await {
                Ok(mut effect) => {
                    self.log_into_uow(
                        &mut effect.uow,
                        "balance",
                        "info",
                        format!("provider balance refreshed for `{}`", manifest.id),
                    );
                    self.commit_runtime_uow(effect.uow);
                }
                Err(error) => {
                    let auto_disable_log =
                        self.maybe_disable_provider_for_low_balance(&manifest.id, &error.error);
                    let mut uow = error.uow.unwrap_or_default();
                    if let Some(message) = auto_disable_log {
                        self.log_into_uow(&mut uow, "balance", "warn", message);
                    }
                    self.log_into_uow(
                        &mut uow,
                        "balance",
                        "warn",
                        format!(
                            "provider balance refresh failed for `{}`: {}",
                            manifest.id, error.error
                        ),
                    );
                    self.commit_runtime_uow(uow);
                }
            }
        }
    }

    fn maybe_disable_provider_for_low_balance(
        &self,
        provider_id: &str,
        error: &SmsError,
    ) -> Option<String> {
        if !Self::is_low_balance_error(error) {
            return None;
        }
        let manifest = match self.registry.read().manifest(provider_id) {
            Ok(manifest) => manifest,
            Err(_) => return None,
        };
        if !manifest.enabled {
            return None;
        }

        let mut next_manifest = manifest.clone();
        next_manifest.enabled = false;
        if self
            .registry
            .write()
            .save_manifest(provider_id, next_manifest)
            .is_ok()
        {
            return Some(format!(
                "provider `{provider_id}` auto-disabled after low balance error: {error}"
            ));
        }
        None
    }

    fn is_low_balance_error(error: &SmsError) -> bool {
        let normalized = error.to_string().to_ascii_lowercase();
        LOW_BALANCE_PATTERNS
            .iter()
            .any(|pattern| normalized.contains(pattern))
    }

    pub async fn maybe_poll_provider_options(&self) -> OptionCacheOverview {
        let settings = self.runtime_settings();
        let overview = self.option_cache_overview();
        if !settings.option_cache_enabled {
            return overview;
        }

        let ttl_minutes = settings.option_cache_poll_interval_minutes.max(1) as i64;
        let should_refresh = overview.missing_providers > 0
            || overview.stale_providers > 0
            || overview
                .last_refresh_at
                .map(|timestamp| Utc::now() - timestamp >= chrono::Duration::minutes(ttl_minutes))
                .unwrap_or(true);

        if should_refresh {
            self.refresh_all_provider_options().await
        } else {
            overview
        }
    }

    fn provider_option_cache_fetched_at(&self, provider_id: &str) -> Option<chrono::DateTime<Utc>> {
        self.provider_option_cache
            .read()
            .entries
            .get(provider_id)
            .map(|entry| entry.fetched_at)
    }

    fn provider_option_cache_state(&self, provider_id: &str) -> OptionCacheState {
        self.provider_option_cache_state_with_settings(provider_id, &self.runtime_settings())
    }

    fn provider_option_cache_state_with_settings(
        &self,
        provider_id: &str,
        settings: &RuntimeSettings,
    ) -> OptionCacheState {
        let fetched_at = self.provider_option_cache_fetched_at(provider_id);
        cache_state(fetched_at, settings)
    }

    fn can_enable_manifest(&self, provider_id: &str) -> bool {
        let settings = self.runtime_settings();
        !settings.option_cache_enabled
            || self.provider_option_cache_state_with_settings(provider_id, &settings)
                == OptionCacheState::Fresh
    }

    fn resolve_routing_plan(&self, request: &AcquireCodeRequest) -> Result<RoutingPlan, SmsError> {
        let store = self.routing_plans.read();
        if let Some(plan_id) = request.routing_plan_id.as_ref() {
            return store
                .plans
                .iter()
                .find(|plan| &plan.id == plan_id)
                .cloned()
                .ok_or_else(|| {
                    SmsError::InvalidRequest(format!("routing plan `{plan_id}` not found"))
                })
                .and_then(ensure_routing_plan_enabled);
        }
        if let Some(plan_name) = request.routing_plan_name.as_ref() {
            return store
                .plans
                .iter()
                .find(|plan| plan.name == *plan_name)
                .cloned()
                .ok_or_else(|| {
                    SmsError::InvalidRequest(format!("routing plan `{plan_name}` not found"))
                })
                .and_then(ensure_routing_plan_enabled);
        }
        Err(SmsError::InvalidRequest(
            "routing plan id or name is required".to_string(),
        ))
    }

    fn routing_attempts_for_round<'a>(
        &self,
        plan: &'a RoutingPlan,
        round: u32,
        attempt_index_offset: usize,
    ) -> Vec<RoutingAttemptEntry<'a>> {
        let enabled_items = plan
            .items
            .iter()
            .filter(|item| item.enabled)
            .collect::<Vec<_>>();
        if enabled_items.is_empty() {
            return Vec::new();
        }

        let ordered_items = self.routing_items_for_round(plan, round, &enabled_items);
        let candidate_item_ids = ordered_items
            .iter()
            .map(|item| item.id.clone())
            .collect::<Vec<_>>();
        let mut attempts = Vec::new();
        for (index, item) in ordered_items.into_iter().enumerate() {
            attempts.push(RoutingAttemptEntry {
                item,
                round,
                attempt_index: attempt_index_offset + index,
                candidate_item_ids: candidate_item_ids.clone(),
            });
        }
        attempts
    }

    fn can_continue_to_round(&self, plan: &RoutingPlan, current_round: u32) -> bool {
        plan.execution_rounds == 0 || current_round < plan.execution_rounds
    }

    fn routing_items_for_round<'a>(
        &self,
        plan: &'a RoutingPlan,
        round: u32,
        enabled_items: &[&'a RoutingPlanItem],
    ) -> Vec<&'a RoutingPlanItem> {
        let mut items = enabled_items.to_vec();
        if plan.execution_mode == RoutingExecutionMode::Random {
            items.sort_by(|left, right| left.id.cmp(&right.id));
            if !items.is_empty() {
                let rotate_by = ((round.saturating_sub(1)) as usize) % items.len();
                items.rotate_left(rotate_by);
            }
        }
        items
    }

    fn expand_routing_item_providers(
        &self,
        item: &RoutingPlanItem,
    ) -> Result<Vec<String>, SmsError> {
        if item.provider.trim().is_empty() {
            return Err(SmsError::InvalidRequest(format!(
                "routing item `{}` provider is required",
                item.id
            )));
        }
        if item.provider != ROUTING_ANY_PROVIDER {
            return Ok(vec![item.provider.clone()]);
        }

        let registry = self.registry.read();
        let mut providers = registry
            .list_manifests_by_priority()
            .into_iter()
            .filter(|manifest| manifest.enabled && manifest.kind != plugin_sdk::ProviderKind::Mock)
            .map(|manifest| manifest.id)
            .collect::<Vec<_>>();
        if providers.is_empty() {
            providers = registry
                .list_manifests_by_priority()
                .into_iter()
                .filter(|manifest| manifest.enabled)
                .map(|manifest| manifest.id)
                .collect();
        }
        if providers.is_empty() {
            return Err(SmsError::InvalidRequest(
                "no enabled providers available for routing item".to_string(),
            ));
        }
        Ok(providers)
    }

    fn routing_item_order_for_ticket<'a>(
        &self,
        plan: &'a RoutingPlan,
        ticket: &TicketRecord,
    ) -> Vec<RoutingAttemptEntry<'a>> {
        let start_round = ticket.routing_current_round.unwrap_or(1);
        let mut attempts = self.routing_attempts_for_round(plan, start_round, 0);
        if ticket.routing_candidate_item_ids.is_empty() {
            if self.can_continue_to_round(plan, start_round) {
                let base_attempt_index = attempts.len();
                attempts.extend(self.routing_attempts_for_round(
                    plan,
                    start_round + 1,
                    base_attempt_index,
                ));
            }
            return attempts;
        }

        let first_round = start_round;
        let first_round_ids = attempts
            .iter()
            .filter(|entry| entry.round == first_round)
            .map(|entry| entry.item.id.clone())
            .collect::<Vec<_>>();
        if first_round_ids != ticket.routing_candidate_item_ids {
            for entry in attempts
                .iter_mut()
                .filter(|entry| entry.round == first_round)
            {
                entry.candidate_item_ids = ticket.routing_candidate_item_ids.clone();
            }
            attempts.sort_by_key(|entry| {
                if entry.round != first_round {
                    return (entry.round, entry.attempt_index);
                }
                let index = ticket
                    .routing_candidate_item_ids
                    .iter()
                    .position(|item_id| item_id == &entry.item.id)
                    .unwrap_or(usize::MAX / 2);
                (entry.round, index)
            });
            for (index, entry) in attempts.iter_mut().enumerate() {
                entry.attempt_index = index;
            }
        }
        if self.can_continue_to_round(plan, start_round) {
            let base_attempt_index = attempts.len();
            attempts.extend(self.routing_attempts_for_round(
                plan,
                start_round + 1,
                base_attempt_index,
            ));
        }
        attempts
    }

    fn translate_acquire_request(
        &self,
        manifest: &ProviderManifest,
        request: &AcquireCodeRequest,
        options: Option<&ProviderDynamicOptions>,
    ) -> AcquireCodeRequest {
        let mut translated = request.clone();
        if let Some(service) = translated.service.as_ref() {
            let aliased = manifest.resolve_service_alias(Some(service));
            let resolved = resolve_provider_value(options, OptionKind::Service, &aliased);
            translated.service = Some(
                if options
                    .map(|entry| {
                        entry
                            .raw_services
                            .iter()
                            .any(|item| item.value.eq_ignore_ascii_case(&aliased))
                    })
                    .unwrap_or(false)
                {
                    aliased
                } else {
                    resolved
                },
            );
        }
        if let Some(country) = translated.country.as_ref() {
            translated.country = Some(resolve_provider_value(
                options,
                OptionKind::Country,
                country,
            ));
        } else if !manifest.defaults.country.trim().is_empty() {
            translated.country = Some(resolve_provider_value(
                options,
                OptionKind::Country,
                &manifest.defaults.country,
            ));
        }
        if let Some(operator) = translated.metadata.get("operator").cloned() {
            let resolved =
                resolve_provider_operator_value(options, &operator, translated.country.as_deref());
            translated.metadata.insert("operator".to_string(), resolved);
        }
        translated
    }

    pub fn log(
        &self,
        scope: impl Into<String>,
        level: impl Into<String>,
        message: impl Into<String>,
    ) {
        let timestamp = Utc::now();
        let scope = scope.into();
        let level = level.into();
        let message = message.into();
        let entry = LogEntry {
            timestamp,
            scope,
            level,
            message,
        };
        let mut logs = self.logs.write();
        logs.push_back(entry.clone());
        while logs.len() > self.log_buffer {
            logs.pop_front();
        }
        drop(logs);
        self.persist_runtime_batch(RuntimeStoreBatch {
            log_entries: vec![entry],
            ..RuntimeStoreBatch::default()
        });
    }
}

fn generate_runtime_secret() -> String {
    Uuid::now_v7().simple().to_string()
}

fn extract_bootstrap_json(html: &str) -> Option<String> {
    let marker = "<script id=\"bootstrap-inert-script\" type=\"application/json\">";
    let start = html.find(marker)? + marker.len();
    let end = html[start..].find("</script>")? + start;
    Some(html[start..end].trim().to_string())
}

fn statsig_config_id(key: &str) -> String {
    let mut hash: i32 = 0;
    for byte in key.bytes() {
        hash = ((hash << 5).wrapping_sub(hash)).wrapping_add(byte as i32);
    }
    (hash as u32).to_string()
}

fn normalize_region_codes(values: &[String]) -> Vec<String> {
    let mut deduped = Vec::new();
    for value in values {
        let normalized = value.trim().to_ascii_uppercase();
        if normalized.len() == 2
            && normalized.chars().all(|char| char.is_ascii_alphabetic())
            && !deduped.contains(&normalized)
        {
            deduped.push(normalized);
        }
    }
    deduped
}

fn normalize_runtime_ticket(mut ticket: TicketRecord) -> (TicketRecord, bool) {
    let canonical_service = canonical_service_key(&ticket.service, Some(&ticket.service));
    let canonical_country = canonical_country_key(&ticket.country, Some(&ticket.country), None);
    let changed = ticket.service != canonical_service || ticket.country != canonical_country;
    ticket.service = canonical_service;
    ticket.country = canonical_country;
    (ticket, changed)
}

fn normalize_reuse_pool_entry(mut entry: ReusePoolEntry) -> (ReusePoolEntry, bool) {
    let canonical_service = canonical_service_key(&entry.service, Some(&entry.service));
    let canonical_country = canonical_country_key(&entry.country, Some(&entry.country), None);
    let changed = entry.service != canonical_service || entry.country != canonical_country;
    entry.service = canonical_service;
    entry.country = canonical_country;
    (entry, changed)
}

fn normalize_runtime_state(
    tickets: Vec<TicketRecord>,
    reuse_pool: HashMap<String, Vec<ReusePoolEntry>>,
) -> (
    BTreeMap<String, TicketRecord>,
    HashMap<String, Vec<ReusePoolEntry>>,
    bool,
) {
    let mut changed = false;
    let runtime_tickets = normalize_runtime_tickets(tickets, &mut changed);
    let mut normalized_reuse_pool = HashMap::new();
    for (provider, entries) in reuse_pool {
        let mut normalized_entries = Vec::with_capacity(entries.len());
        for entry in entries {
            let (entry, entry_changed) = normalize_reuse_pool_entry(entry);
            changed |= entry_changed;
            normalized_entries.push(entry);
        }
        normalized_reuse_pool.insert(provider, normalized_entries);
    }
    (runtime_tickets, normalized_reuse_pool, changed)
}

fn normalize_runtime_tickets(
    tickets: Vec<TicketRecord>,
    changed: &mut bool,
) -> BTreeMap<String, TicketRecord> {
    let mut sorted = sorted_tickets(tickets);
    if sorted.len() > DEFAULT_TICKET_BUFFER {
        sorted.truncate(DEFAULT_TICKET_BUFFER);
    }
    sorted
        .into_iter()
        .map(|ticket| {
            let (ticket, ticket_changed) = normalize_runtime_ticket(ticket);
            *changed |= ticket_changed;
            (ticket.id.clone(), ticket)
        })
        .collect()
}

fn normalize_runtime_logs(logs: Vec<LogEntry>, log_buffer: usize) -> VecDeque<LogEntry> {
    let mut normalized = VecDeque::with_capacity(log_buffer);
    let start = logs.len().saturating_sub(log_buffer);
    for entry in logs.into_iter().skip(start) {
        normalized.push_back(entry);
    }
    normalized
}

fn normalize_runtime_activity(
    mut activity: Vec<ActivityEntry>,
    activity_buffer: usize,
) -> VecDeque<ActivityEntry> {
    activity.sort_by(|left, right| {
        right
            .timestamp
            .cmp(&left.timestamp)
            .then_with(|| right.id.cmp(&left.id))
    });
    if activity.len() > activity_buffer {
        activity.truncate(activity_buffer);
    }
    let mut normalized = VecDeque::with_capacity(activity_buffer);
    for entry in activity.into_iter().rev() {
        normalized.push_back(entry);
    }
    normalized
}

fn sorted_tickets(mut tickets: Vec<TicketRecord>) -> Vec<TicketRecord> {
    tickets.sort_by(|left, right| {
        right
            .updated_at
            .cmp(&left.updated_at)
            .then_with(|| right.created_at.cmp(&left.created_at))
            .then_with(|| right.id.cmp(&left.id))
    });
    tickets
}

fn option_request_value(item: &OptionItem) -> Option<String> {
    item.provider_value
        .as_ref()
        .and_then(|value| non_empty_value(value))
        .or_else(|| non_empty_value(&item.value))
}

fn non_empty_value(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn default_service_option(manifest: &ProviderManifest) -> OptionItem {
    OptionItem {
        value: manifest.defaults.service.clone(),
        label: manifest.defaults.service.clone(),
        hint: manifest.defaults.service.clone(),
        provider_value: Some(manifest.defaults.service.clone()),
        icon_url: None,
        provider_icon_url: None,
    }
}

fn default_country_option(manifest: &ProviderManifest) -> OptionItem {
    OptionItem {
        value: manifest.defaults.country.clone(),
        label: manifest.defaults.country.clone(),
        hint: manifest.defaults.country.clone(),
        provider_value: Some(manifest.defaults.country.clone()),
        icon_url: None,
        provider_icon_url: None,
    }
}

fn default_operator_option(manifest: &ProviderManifest) -> OptionItem {
    let value = match manifest.kind {
        plugin_sdk::ProviderKind::Mock => "mock".to_string(),
        plugin_sdk::ProviderKind::FiveSim => manifest
            .five_sim
            .as_ref()
            .map(|config| config.buy_operator.clone())
            .unwrap_or_else(|| "any".to_string()),
        plugin_sdk::ProviderKind::HandlerApi => "any".to_string(),
    };
    let label = if value == "any" {
        "Any Operator".to_string()
    } else if value == "mock" {
        "Mock".to_string()
    } else {
        value.clone()
    };
    OptionItem {
        value: value.clone(),
        label,
        hint: value.clone(),
        provider_value: Some(value),
        icon_url: None,
        provider_icon_url: None,
    }
}

fn generate_routing_plan_id() -> String {
    format!("plan-{}", Uuid::now_v7().simple())
}

fn ensure_routing_plan_enabled(plan: RoutingPlan) -> Result<RoutingPlan, SmsError> {
    if !plan.enabled {
        return Err(SmsError::InvalidRequest(format!(
            "routing plan `{}` is disabled",
            plan.name
        )));
    }
    Ok(plan)
}

#[derive(Clone)]
struct RoutingAttemptEntry<'a> {
    item: &'a RoutingPlanItem,
    round: u32,
    attempt_index: usize,
    candidate_item_ids: Vec<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{
        OptionItem, ProviderDynamicOptions, ProviderOptionCacheEntry, ReleaseAction,
        RoutingExecutionMode, RoutingFailoverRequest, RoutingPlan, RoutingPlanItem,
        RoutingPriceMode,
    };
    use crate::options::ProviderRawOptionAuditStore;
    use crate::registry::ProviderRegistry;
    use crate::runtime_store::{ReleaseOwnerLease, RuntimeStore};
    use axum::extract::{Query, State};
    use axum::http::{HeaderMap, StatusCode};
    use axum::routing::{get, post};
    use axum::{Json, Router};
    use parking_lot::Mutex;
    use rusqlite::Connection;
    use serde_json::Value;
    use std::fs;
    use std::net::SocketAddr;
    use std::path::Path;
    use std::path::PathBuf;
    use std::sync::Arc;
    use tokio::net::TcpListener;
    use uuid::Uuid;

    fn repo_root() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .canonicalize()
            .unwrap()
    }

    fn fixture_provider_dir() -> PathBuf {
        let base = std::env::temp_dir().join(format!("madao-sms-test-{}", Uuid::now_v7()));
        fs::create_dir_all(&base).unwrap();
        for name in ["mock.toml", "herosms.toml", "smsbower.toml", "fivesim.toml"] {
            fs::copy(
                repo_root().join("plugins/providers").join(name),
                base.join(name),
            )
            .unwrap();
        }
        base
    }

    fn make_service() -> SmsService {
        let provider_dir = fixture_provider_dir();
        let registry = ProviderRegistry::load_from_dir(provider_dir).unwrap();
        SmsService::new(registry, 32)
    }

    fn make_service_with_provider_overrides(
        overrides: &[(&str, &dyn Fn(&mut ProviderManifest))],
    ) -> SmsService {
        let provider_dir = fixture_provider_dir();
        for (name, update) in overrides {
            let path = provider_dir.join(format!("{name}.toml"));
            let content = fs::read_to_string(&path).unwrap();
            let mut manifest: ProviderManifest = toml::from_str(&content).unwrap();
            update(&mut manifest);
            fs::write(&path, toml::to_string_pretty(&manifest).unwrap()).unwrap();
        }
        let registry = ProviderRegistry::load_from_dir(provider_dir).unwrap();
        SmsService::new(registry, 32)
    }

    fn make_mock_preferred_service() -> SmsService {
        let provider_dir = fixture_provider_dir();
        for name in ["herosms.toml", "smsbower.toml", "fivesim.toml"] {
            let path = provider_dir.join(name);
            let content = fs::read_to_string(&path).unwrap();
            let mut manifest: ProviderManifest = toml::from_str(&content).unwrap();
            manifest.enabled = false;
            fs::write(&path, toml::to_string_pretty(&manifest).unwrap()).unwrap();
        }
        let registry = ProviderRegistry::load_from_dir(provider_dir).unwrap();
        SmsService::new(registry, 32)
    }

    fn make_persistent_service(base: &Path) -> SmsService {
        let provider_dir = fixture_provider_dir();
        let registry = ProviderRegistry::load_from_dir(provider_dir).unwrap();
        SmsService::with_persistence_paths(
            registry,
            32,
            Some(base.join("runtime-settings.json")),
            Some(base.join("runtime.db")),
            Some(base.join("provider-options-cache.json")),
            Some(base.join("provider-options-raw.json")),
            Some(base.join("routing-plans.json")),
        )
    }

    fn runtime_settings_fixture() -> RuntimeSettings {
        RuntimeSettings {
            routing_strategy: "ordered_priority".to_string(),
            auto_fallback: true,
            option_cache_enabled: true,
            option_cache_poll_interval_minutes: 30,
            only_show_openai_sms_countries: false,
            check_updates_on_launch: true,
            http_port: 7822,
            http_secret: "secret-token".to_string(),
            stats_sync_instance_id: "instance-1".to_string(),
            stats_sync_enabled: false,
            stats_sync_base_url: "https://custom.example.workers.dev/proxy".to_string(),
            stats_sync_api_token: "custom-token".to_string(),
        }
    }

    #[test]
    fn statsig_config_id_matches_openai_sms_region_key() {
        assert_eq!(
            statsig_config_id("phone-verification-sms-regions-by-verification-channel"),
            "2516824722"
        );
    }

    #[test]
    fn extract_bootstrap_json_reads_embedded_script_payload() {
        let html = r#"
        <html>
          <body>
            <script id="bootstrap-inert-script" type="application/json">
              {"statsigClientInitData":{"bootstrap":"{\"dynamic_configs\":{}}"}}
            </script>
          </body>
        </html>
        "#;
        let payload = extract_bootstrap_json(html).unwrap();
        assert!(payload.contains("statsigClientInitData"));
    }

    #[test]
    fn file_runtime_config_repository_round_trips_state() {
        let base = std::env::temp_dir().join(format!("madao-config-repo-{}", Uuid::now_v7()));
        fs::create_dir_all(&base).unwrap();
        let repo = FileRuntimeConfigRepository::new(
            Some(base.join("runtime-settings.json")),
            Some(base.join("routing-plans.json")),
        );
        let settings = RuntimeSettings {
            routing_strategy: "ordered_priority".to_string(),
            auto_fallback: false,
            option_cache_enabled: false,
            option_cache_poll_interval_minutes: 5,
            only_show_openai_sms_countries: true,
            check_updates_on_launch: false,
            http_port: 9900,
            http_secret: "secret-token".to_string(),
            stats_sync_instance_id: "instance-1".to_string(),
            stats_sync_enabled: false,
            stats_sync_base_url: String::new(),
            stats_sync_api_token: String::new(),
        };
        let plans = RoutingPlanStore {
            plans: vec![routing_plan()],
        };

        repo.save_settings(&settings).unwrap();
        repo.save_routing_plans(&plans).unwrap();

        let loaded = repo.load_state().unwrap();
        assert_eq!(loaded.settings.http_port, 9900);
        assert_eq!(loaded.settings.http_secret, "secret-token");
        assert_eq!(loaded.routing_plans.plans.len(), 1);
        assert_eq!(loaded.routing_plans.plans[0].id, "openai-plan");
    }

    #[test]
    fn repair_runtime_settings_migrates_legacy_stats_defaults() {
        let mut settings = runtime_settings_fixture();
        settings.http_secret = String::new();
        settings.stats_sync_instance_id = String::new();
        settings.stats_sync_base_url = "https://madao-stats.example.workers.dev".to_string();
        settings.stats_sync_api_token = "replace-me".to_string();

        let repaired = repair_runtime_settings_with_defaults(
            &mut settings,
            "https://madao-stats.nznd.org",
            "compiled-token",
        );

        assert!(repaired);
        assert!(!settings.http_secret.trim().is_empty());
        assert!(!settings.stats_sync_instance_id.trim().is_empty());
        assert_eq!(settings.stats_sync_base_url, "https://madao-stats.nznd.org");
        assert_eq!(settings.stats_sync_api_token, "compiled-token");
    }

    #[test]
    fn repair_runtime_settings_keeps_custom_stats_sync_values() {
        let mut settings = runtime_settings_fixture();

        let repaired = repair_runtime_settings_with_defaults(
            &mut settings,
            "https://madao-stats.nznd.org",
            "compiled-token",
        );

        assert!(!repaired);
        assert_eq!(
            settings.stats_sync_base_url,
            "https://custom.example.workers.dev/proxy"
        );
        assert_eq!(settings.stats_sync_api_token, "custom-token");
    }

    #[test]
    fn persistent_service_recanoicalizes_legacy_cached_countries_on_load() {
        let base = std::env::temp_dir().join(format!("madao-cache-migrate-{}", Uuid::now_v7()));
        fs::create_dir_all(&base).unwrap();

        let legacy_cache = r#"{
  "entries": {
    "smsbower": {
      "provider": "smsbower",
      "fetched_at": "2026-05-09T05:43:15.596832Z",
      "options": {
        "provider": "smsbower",
        "raw_services": [],
        "raw_countries": [],
        "raw_operators": [],
        "services": [],
        "countries": [
          {
            "value": "1",
            "label": "Ukraine",
            "hint": "380",
            "provider_value": "1",
            "icon_url": null,
            "provider_icon_url": null
          }
        ],
        "operators": [],
        "cache_state": "fresh",
        "fetched_at": "2026-05-09T05:43:15.596832Z"
      }
    }
  }
}"#;
        fs::write(base.join("provider-options-cache.json"), legacy_cache).unwrap();

        let service = make_persistent_service(&base);
        let cached = service.provider_cached_options("smsbower").unwrap();
        assert_eq!(cached.countries[0].value, "UA");
        assert_eq!(cached.countries[0].label, "Ukraine");
        assert_eq!(cached.countries[0].provider_value.as_deref(), Some("1"));

        let persisted = fs::read_to_string(base.join("provider-options-cache.json")).unwrap();
        assert!(persisted.contains(r#""value": "UA""#));
        assert!(persisted.contains(r#""provider_value": "1""#));
    }

    fn routing_plan() -> RoutingPlan {
        RoutingPlan {
            id: "openai-plan".to_string(),
            name: "OpenAI Plan".to_string(),
            service: "openai".to_string(),
            description: Some("test routing plan".to_string()),
            enabled: true,
            execution_mode: RoutingExecutionMode::Sequential,
            execution_rounds: 1,
            items: vec![
                RoutingPlanItem {
                    id: "mock-first".to_string(),
                    provider: "mock".to_string(),
                    country: "US".to_string(),
                    operator: String::new(),
                    enabled: true,
                    price_mode: RoutingPriceMode::Fixed,
                    min_price: Some(0.1),
                    max_price: Some(0.1),
                    fixed_price: Some(0.1),
                },
                RoutingPlanItem {
                    id: "mock-second".to_string(),
                    provider: "mock".to_string(),
                    country: "CA".to_string(),
                    operator: String::new(),
                    enabled: true,
                    price_mode: RoutingPriceMode::Any,
                    min_price: None,
                    max_price: None,
                    fixed_price: None,
                },
            ],
        }
    }

    fn any_provider_routing_plan() -> RoutingPlan {
        RoutingPlan {
            id: "any-provider-plan".to_string(),
            name: "Any Provider Plan".to_string(),
            service: "openai".to_string(),
            description: Some("test any provider routing plan".to_string()),
            enabled: true,
            execution_mode: RoutingExecutionMode::Sequential,
            execution_rounds: 1,
            items: vec![RoutingPlanItem {
                id: "any-provider-item".to_string(),
                provider: ROUTING_ANY_PROVIDER.to_string(),
                country: String::new(),
                operator: String::new(),
                enabled: true,
                price_mode: RoutingPriceMode::Any,
                min_price: None,
                max_price: None,
                fixed_price: None,
            }],
        }
    }

    #[tokio::test]
    async fn mock_provider_can_acquire_and_poll() {
        let service = make_service();
        let acquire = service
            .acquire_code(AcquireCodeRequest {
                provider: "mock".to_string(),
                service: Some("openai".to_string()),
                country: None,
                max_price: None,
                min_price: None,
                auto_pick_country: None,
                reuse_phone: None,
                reuse_key: None,
                metadata: BTreeMap::new(),
                routing_plan_id: None,
                routing_plan_name: None,
            })
            .await
            .unwrap();
        assert_eq!(acquire.provider, "mock");
        let poll = service
            .poll_code(PollCodeRequest {
                ticket_id: acquire.ticket_id,
            })
            .await
            .unwrap();
        assert_eq!(poll.status, TicketStatus::CodeReceived);
        assert_eq!(poll.code.as_deref(), Some("123456"));
    }

    #[tokio::test]
    async fn same_activation_retry_stats_duration_starts_at_retry_time() {
        async fn handler(Query(query): Query<HashMap<String, String>>) -> String {
            match query.get("action").map(String::as_str) {
                Some("setStatus") if query.get("status").map(String::as_str) == Some("3") => {
                    "ACCESS_RETRY_GET".to_string()
                }
                Some("getStatus") => "STATUS_OK:123456".to_string(),
                _ => "ACCESS_OK".to_string(),
            }
        }

        let router = Router::new().route("/", get(handler));
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr: SocketAddr = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let _ = axum::serve(listener, router).await;
        });
        let service = make_service_with_provider_overrides(&[(
            "smsbower",
            &|manifest: &mut ProviderManifest| {
                manifest.handler_api.as_mut().unwrap().base_url = format!("http://{addr}/");
                manifest.handler_api.as_mut().unwrap().api_key = "test-key".to_string();
            },
        )]);
        let mut ticket = TicketRecord::new(
            "smsbower".to_string(),
            "telegram".to_string(),
            "RU".to_string(),
            "+10000000000".to_string(),
            Some("smsbower-activation".to_string()),
            Some(0.12),
        );
        let now = Utc::now();
        ticket.status = TicketStatus::CodeReceived;
        ticket.created_at = now - Duration::seconds(600);
        ticket.updated_at = now - Duration::seconds(3);
        ticket.acquire_path = AcquirePath::SameActivationRetry;
        ticket.same_activation_retry_supported = true;
        ticket.same_activation_retry_expires_at = Some(now + Duration::minutes(5));
        service.upsert_ticket(ticket.clone());

        let retry = service
            .acquire_code(AcquireCodeRequest {
                provider: "smsbower".to_string(),
                service: Some("telegram".to_string()),
                country: Some("RU".to_string()),
                max_price: None,
                min_price: None,
                auto_pick_country: None,
                reuse_phone: Some(true),
                reuse_key: None,
                metadata: BTreeMap::new(),
                routing_plan_id: None,
                routing_plan_name: None,
            })
            .await
            .unwrap();
        assert_eq!(retry.ticket_id, ticket.id);
        assert_eq!(retry.acquire_path, AcquirePath::SameActivationRetry);
        let retry_started_at = service.ticket(&ticket.id).unwrap().updated_at;

        service
            .poll_code(PollCodeRequest {
                ticket_id: ticket.id.clone(),
            })
            .await
            .unwrap();

        let event = service
            .ticket_stats_events
            .read()
            .iter()
            .rev()
            .find(|event| event.outcome == TicketStatsOutcome::CodeReceived)
            .cloned()
            .unwrap();
        let receive_duration = event.receive_duration_secs.unwrap();
        let retry_elapsed_secs =
            (event.occurred_at - retry_started_at).num_milliseconds() as f64 / 1000.0;
        let original_elapsed_secs =
            (event.occurred_at - ticket.created_at).num_milliseconds() as f64 / 1000.0;

        assert!((receive_duration - retry_elapsed_secs).abs() < 0.25);
        assert!(original_elapsed_secs > 500.0);
        assert!(receive_duration < 5.0);

        server.abort();
    }

    #[tokio::test]
    async fn manifest_can_be_saved_and_reloaded() {
        let service = make_service();
        let mut manifest = service.provider_manifest("mock").unwrap();
        service.refresh_provider_options("mock").await.unwrap();
        manifest.description = Some("updated manifest".to_string());
        let saved = service
            .save_provider_manifest("mock", manifest)
            .await
            .unwrap();
        assert_eq!(
            saved.manifest.description.as_deref(),
            Some("updated manifest")
        );
        let reloaded = service.provider_manifest("mock").unwrap();
        assert_eq!(reloaded.description.as_deref(), Some("updated manifest"));
    }

    #[tokio::test]
    async fn refresh_provider_options_writes_raw_audit_file() {
        let base = std::env::temp_dir().join(format!("madao-raw-audit-test-{}", Uuid::now_v7()));
        fs::create_dir_all(&base).unwrap();
        let service = make_persistent_service(&base);

        service.refresh_provider_options("mock").await.unwrap();

        let raw_path = base.join("provider-options-raw.json");
        assert!(raw_path.exists());
        let content = fs::read_to_string(raw_path).unwrap();
        let store: ProviderRawOptionAuditStore = serde_json::from_str(&content).unwrap();
        let entry = store.entries.get("mock").unwrap();
        assert_eq!(entry.provider, "mock");
        assert!(!entry.raw_services.is_empty());
        assert!(!entry.raw_countries.is_empty());
        assert!(!entry.raw_operators.is_empty());
    }

    #[tokio::test]
    async fn invalid_manifest_save_rolls_back_previous_content() {
        let service = make_service();
        let before = service.provider_manifest("herosms").unwrap();
        let mut broken = before.clone();
        broken.handler_api = None;

        let result = service.save_provider_manifest("herosms", broken).await;
        assert!(result.is_err());

        let after = service.provider_manifest("herosms").unwrap();
        assert_eq!(
            after.handler_api.as_ref().map(|cfg| cfg.base_url.clone()),
            before.handler_api.as_ref().map(|cfg| cfg.base_url.clone())
        );
    }

    #[test]
    fn routing_plan_can_be_saved_and_listed() {
        let service = make_service();
        let saved = service.save_routing_plan(routing_plan()).unwrap();
        assert_eq!(saved.id, "openai-plan");
        let plans = service.list_routing_plans();
        assert_eq!(plans.plans.len(), 1);
        assert_eq!(plans.plans[0].service, "openai");
    }

    #[test]
    fn ensure_runtime_settings_persisted_writes_default_settings() {
        let base = std::env::temp_dir().join(format!("madao-settings-persist-{}", Uuid::now_v7()));
        fs::create_dir_all(&base).unwrap();
        let service = make_persistent_service(&base);

        service.ensure_runtime_settings_persisted();

        let content = fs::read_to_string(base.join("runtime-settings.json")).unwrap();
        let settings: RuntimeSettings = serde_json::from_str(&content).unwrap();
        assert_eq!(settings.http_port, 7822);
        assert!(!settings.http_secret.trim().is_empty());
    }

    #[test]
    fn update_runtime_settings_keeps_in_memory_state_when_persist_fails() {
        let base = std::env::temp_dir().join(format!("madao-settings-fail-{}", Uuid::now_v7()));
        fs::create_dir_all(&base).unwrap();
        let registry = ProviderRegistry::load_from_dir(fixture_provider_dir()).unwrap();
        let service = SmsService::with_persistence_paths(
            registry,
            32,
            Some(base.join("missing").join("runtime-settings.json")),
            None,
            None,
            None,
            Some(base.join("routing-plans.json")),
        );
        let before = service.runtime_settings();
        fs::write(base.join("missing"), "not-a-dir").unwrap();

        let result = service.update_runtime_settings(RuntimeSettingsUpdate {
            routing_strategy: "ordered_priority".to_string(),
            auto_fallback: false,
            option_cache_enabled: false,
            option_cache_poll_interval_minutes: 7,
            only_show_openai_sms_countries: true,
            check_updates_on_launch: false,
            http_port: 9001,
            stats_sync_enabled: before.stats_sync_enabled,
            stats_sync_base_url: before.stats_sync_base_url.clone(),
            stats_sync_api_token: before.stats_sync_api_token.clone(),
        });

        assert!(result.is_err());
        let after = service.runtime_settings();
        assert_eq!(after.http_port, before.http_port);
        assert_eq!(after.option_cache_enabled, before.option_cache_enabled);
        assert_eq!(
            after.only_show_openai_sms_countries,
            before.only_show_openai_sms_countries
        );
    }

    #[test]
    fn save_routing_plan_keeps_in_memory_state_when_persist_fails() {
        let base = std::env::temp_dir().join(format!("madao-routing-fail-{}", Uuid::now_v7()));
        fs::create_dir_all(&base).unwrap();
        let registry = ProviderRegistry::load_from_dir(fixture_provider_dir()).unwrap();
        let service = SmsService::with_persistence_paths(
            registry,
            32,
            Some(base.join("runtime-settings.json")),
            None,
            None,
            None,
            Some(base.join("blocked").join("routing-plans.json")),
        );
        fs::write(base.join("blocked"), "not-a-dir").unwrap();

        let result = service.save_routing_plan(routing_plan());

        assert!(result.is_err());
        assert!(service.list_routing_plans().plans.is_empty());
    }

    #[test]
    fn delete_routing_plan_keeps_in_memory_state_when_persist_fails() {
        let base =
            std::env::temp_dir().join(format!("madao-routing-delete-fail-{}", Uuid::now_v7()));
        fs::create_dir_all(&base).unwrap();
        let blocked_dir = base.join("blocked");
        let routing_path = blocked_dir.join("routing-plans.json");
        fs::create_dir_all(&blocked_dir).unwrap();
        fs::write(
            &routing_path,
            serde_json::to_string_pretty(&RoutingPlanStore {
                plans: vec![routing_plan()],
            })
            .unwrap(),
        )
        .unwrap();
        let registry = ProviderRegistry::load_from_dir(fixture_provider_dir()).unwrap();
        let service = SmsService::with_persistence_paths(
            registry,
            32,
            Some(base.join("runtime-settings.json")),
            None,
            None,
            None,
            Some(routing_path.clone()),
        );
        fs::remove_file(&routing_path).unwrap();
        fs::remove_dir(&blocked_dir).unwrap();
        fs::write(&blocked_dir, "not-a-dir").unwrap();

        let result = service.delete_routing_plan("openai-plan");

        assert!(result.is_err());
        assert_eq!(service.list_routing_plans().plans.len(), 1);
    }

    #[test]
    fn routing_plan_save_canonicalizes_legacy_service_aliases() {
        let service = make_service();
        let aliases = ["dr", "chatgpt", "gpt", "codex"];

        for alias in aliases {
            let mut plan = routing_plan();
            plan.id = format!("{alias}-plan");
            plan.name = format!("{alias} plan");
            plan.service = alias.to_string();

            let saved = service.save_routing_plan(plan).unwrap();

            assert_eq!(saved.service, "openai");
        }
    }

    #[test]
    fn persistent_service_recanonicalizes_legacy_routing_plan_services_on_load() {
        let base = std::env::temp_dir().join(format!("madao-routing-migrate-{}", Uuid::now_v7()));
        fs::create_dir_all(&base).unwrap();
        fs::write(
            base.join("routing-plans.json"),
            r#"{
  "plans": [
    {
      "id": "legacy-openai-plan",
      "name": "Legacy OpenAI Plan",
      "service": "dr",
      "description": "legacy alias",
      "enabled": true,
      "execution_mode": "sequential",
      "execution_rounds": 1,
      "items": [
        {
          "id": "legacy-item-1",
          "provider": "mock",
          "country": "US",
          "operator": "",
          "enabled": true,
          "price_mode": "any",
          "min_price": null,
          "max_price": null,
          "fixed_price": null
        }
      ]
    }
  ]
}"#,
        )
        .unwrap();

        let service = make_persistent_service(&base);
        let plans = service.list_routing_plans();
        assert_eq!(plans.plans.len(), 1);
        assert_eq!(plans.plans[0].service, "openai");

        let persisted = fs::read_to_string(base.join("routing-plans.json")).unwrap();
        assert!(persisted.contains(r#""service": "openai""#));
        assert!(!persisted.contains(r#""service": "dr""#));
        assert!(persisted.contains(r#""country": "US""#));
    }

    #[test]
    fn routing_plan_without_id_gets_random_generated_id() {
        let service = make_service();
        let mut plan = routing_plan();
        plan.id.clear();
        plan.name = "Human Friendly Name".to_string();

        let saved = service.save_routing_plan(plan).unwrap();

        assert!(saved.id.starts_with("plan-"));
        assert_ne!(saved.id, "human-friendly-name");
    }

    #[tokio::test]
    async fn routing_plan_can_acquire_ticket() {
        let service = make_service();
        service.save_routing_plan(routing_plan()).unwrap();

        let acquire = service
            .acquire_code(AcquireCodeRequest {
                provider: "auto".to_string(),
                service: None,
                country: None,
                max_price: None,
                min_price: None,
                auto_pick_country: None,
                reuse_phone: None,
                reuse_key: None,
                metadata: BTreeMap::new(),
                routing_plan_id: Some("openai-plan".to_string()),
                routing_plan_name: None,
            })
            .await
            .unwrap();

        assert_eq!(acquire.provider, "mock");
        assert_eq!(acquire.service, "openai");
        assert_eq!(acquire.routing_plan_id.as_deref(), Some("openai-plan"));
        assert_eq!(acquire.routing_item_id.as_deref(), Some("mock-first"));
        assert_eq!(acquire.routing_item_index, Some(0));
    }

    #[tokio::test]
    async fn any_provider_routing_item_expands_to_enabled_provider() {
        let service = make_mock_preferred_service();
        service
            .save_routing_plan(any_provider_routing_plan())
            .unwrap();

        let acquire = service
            .acquire_code(AcquireCodeRequest {
                provider: "auto".to_string(),
                service: None,
                country: None,
                max_price: None,
                min_price: None,
                auto_pick_country: None,
                reuse_phone: None,
                reuse_key: None,
                metadata: BTreeMap::new(),
                routing_plan_id: Some("any-provider-plan".to_string()),
                routing_plan_name: None,
            })
            .await
            .unwrap();

        assert_ne!(acquire.provider, ROUTING_ANY_PROVIDER);
        assert_eq!(acquire.provider, "mock");
        assert_eq!(
            acquire.routing_item_id.as_deref(),
            Some("any-provider-item")
        );
    }

    #[tokio::test]
    async fn auto_provider_without_routing_plan_uses_enabled_provider() {
        let service = make_mock_preferred_service();

        let acquire = service
            .acquire_code(AcquireCodeRequest {
                provider: "auto".to_string(),
                service: Some("openai".to_string()),
                country: None,
                max_price: None,
                min_price: None,
                auto_pick_country: None,
                reuse_phone: None,
                reuse_key: None,
                metadata: BTreeMap::new(),
                routing_plan_id: None,
                routing_plan_name: None,
            })
            .await
            .unwrap();

        assert_eq!(acquire.provider, "mock");
    }

    #[tokio::test]
    async fn routing_failover_moves_to_next_item() {
        let service = make_service();
        service.save_routing_plan(routing_plan()).unwrap();

        let acquire = service
            .acquire_code(AcquireCodeRequest {
                provider: "auto".to_string(),
                service: None,
                country: None,
                max_price: None,
                min_price: None,
                auto_pick_country: None,
                reuse_phone: None,
                reuse_key: None,
                metadata: BTreeMap::new(),
                routing_plan_id: Some("openai-plan".to_string()),
                routing_plan_name: None,
            })
            .await
            .unwrap();

        let failover = service
            .failover_routing_attempt(RoutingFailoverRequest {
                ticket_id: acquire.ticket_id,
                reason: Some("upstream reject".to_string()),
                failed_item_id: Some("mock-first".to_string()),
            })
            .await
            .unwrap();

        assert_eq!(failover.routing_item_id.as_deref(), Some("mock-second"));
        assert_eq!(failover.routing_item_index, Some(1));
        assert_eq!(failover.country, "CA");

        let logs = service.runtime_snapshot().logs;
        assert!(logs.iter().any(|entry| {
            entry.scope == "upstream:mock"
                && entry.message.contains("acquire service=openai country=CA")
        }));
    }

    #[tokio::test]
    async fn routing_failover_preserves_ticket_candidate_order() {
        let service = make_service();
        let mut plan = routing_plan();
        plan.execution_mode = RoutingExecutionMode::Random;
        service.save_routing_plan(plan).unwrap();

        let acquire = service
            .acquire_code(AcquireCodeRequest {
                provider: "auto".to_string(),
                service: None,
                country: None,
                max_price: None,
                min_price: None,
                auto_pick_country: None,
                reuse_phone: None,
                reuse_key: None,
                metadata: BTreeMap::new(),
                routing_plan_id: Some("openai-plan".to_string()),
                routing_plan_name: None,
            })
            .await
            .unwrap();

        let first_item_id = acquire.routing_item_id.clone().unwrap();
        let current_ticket = service
            .tickets
            .read()
            .get(&acquire.ticket_id)
            .cloned()
            .unwrap();
        let candidate_ids = current_ticket.routing_candidate_item_ids.clone();
        assert_eq!(candidate_ids.len(), 2);
        assert_eq!(candidate_ids[0], first_item_id);

        let failover = service
            .failover_routing_attempt(RoutingFailoverRequest {
                ticket_id: acquire.ticket_id,
                reason: Some("ordered failover".to_string()),
                failed_item_id: Some(first_item_id.clone()),
            })
            .await
            .unwrap();

        assert_eq!(
            failover.routing_item_id.as_deref(),
            Some(candidate_ids[1].as_str())
        );
    }

    #[tokio::test]
    async fn routing_plan_exact_reuse_consumes_pool_in_single_commit() {
        let base =
            std::env::temp_dir().join(format!("madao-routing-exact-reuse-{}", Uuid::now_v7()));
        fs::create_dir_all(&base).unwrap();
        let provider_dir = fixture_provider_dir();
        fs::write(
            provider_dir.join("fivesim.toml"),
            r#"
id = "fivesim"
name = "5SIM Mock"
kind = "mock"
enabled = true
priority = 10

[defaults]
service = "openai"
country = "US"
auto_pick_country = false
verify_on_register = false
reuse_phone = true
max_price = 0.0
min_price = 0.0
min_balance = 0.0
max_tries = 1
poll_timeout_sec = 15
reuse_max = 2
reuse_ttl_hours = 24

[mock]
balance = 100.0
phone_number = "+15550001234"
codes = ["123456"]
"#,
        )
        .unwrap();
        let registry = ProviderRegistry::load_from_dir(provider_dir).unwrap();
        let service = SmsService::with_persistence_paths(
            registry,
            32,
            Some(base.join("runtime-settings.json")),
            Some(base.join("runtime.db")),
            Some(base.join("provider-options-cache.json")),
            Some(base.join("provider-options-raw.json")),
            Some(base.join("routing-plans.json")),
        );
        let request = AcquireCodeRequest {
            provider: "fivesim".to_string(),
            service: Some("openai".to_string()),
            country: Some("US".to_string()),
            max_price: None,
            min_price: None,
            auto_pick_country: None,
            reuse_phone: Some(true),
            reuse_key: None,
            metadata: BTreeMap::new(),
            routing_plan_id: None,
            routing_plan_name: None,
        };
        let acquired = service.acquire_code(request).await.unwrap();
        service
            .release_code(ReleaseCodeRequest {
                ticket_id: acquired.ticket_id,
                action: ReleaseAction::Finish,
            })
            .await
            .unwrap();

        let mut plan = routing_plan();
        plan.items.truncate(1);
        plan.items[0].provider = "fivesim".to_string();
        plan.items[0].country = "US".to_string();
        service.save_routing_plan(plan).unwrap();

        let reused = service
            .acquire_code(AcquireCodeRequest {
                provider: "auto".to_string(),
                service: None,
                country: None,
                max_price: None,
                min_price: None,
                auto_pick_country: None,
                reuse_phone: Some(true),
                reuse_key: None,
                metadata: BTreeMap::new(),
                routing_plan_id: Some("openai-plan".to_string()),
                routing_plan_name: None,
            })
            .await
            .unwrap();

        assert_eq!(reused.provider, "fivesim");
        assert_eq!(reused.acquire_path, AcquirePath::ExactReuse);
        let ticket = service.ticket(&reused.ticket_id).unwrap();
        assert_eq!(ticket.reuse_count, 1);
        let persisted = RuntimeStore::open(base.join("runtime.db"))
            .unwrap()
            .load_state()
            .unwrap();
        assert!(
            persisted
                .reuse_pool
                .get("fivesim")
                .map(|entries| entries.is_empty())
                .unwrap_or(true),
            "exact reuse candidate should be consumed from persisted pool"
        );
    }

    #[tokio::test]
    async fn same_activation_retry_failure_persists_ticket_invalidation_before_fresh_acquire() {
        async fn handler(Query(query): Query<HashMap<String, String>>) -> String {
            match query.get("action").map(String::as_str) {
                Some("reactivate") => "BAD_STATUS".to_string(),
                Some("getNumberV2") => r#"{"activationId":"fresh-activation","phoneNumber":"79005550000","activationCost":"0.06","canGetAnotherSms":true}"#.to_string(),
                _ => "ACCESS_OK".to_string(),
            }
        }

        let router = Router::new().route("/", get(handler));
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr: SocketAddr = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let _ = axum::serve(listener, router).await;
        });

        let base = std::env::temp_dir().join(format!("madao-retry-fallback-{}", Uuid::now_v7()));
        fs::create_dir_all(&base).unwrap();
        let provider_dir = fixture_provider_dir();
        let smsbower_path = provider_dir.join("smsbower.toml");
        let content = fs::read_to_string(&smsbower_path).unwrap();
        let mut manifest: ProviderManifest = toml::from_str(&content).unwrap();
        manifest.handler_api.as_mut().unwrap().base_url = format!("http://{addr}/");
        manifest.handler_api.as_mut().unwrap().api_key = "test-key".to_string();
        fs::write(&smsbower_path, toml::to_string_pretty(&manifest).unwrap()).unwrap();
        let registry = ProviderRegistry::load_from_dir(provider_dir).unwrap();

        let runtime_db = base.join("runtime.db");
        let service = SmsService::with_persistence_paths(
            registry,
            32,
            Some(base.join("runtime-settings.json")),
            Some(runtime_db.clone()),
            Some(base.join("provider-options-cache.json")),
            Some(base.join("provider-options-raw.json")),
            Some(base.join("routing-plans.json")),
        );

        let mut ticket = TicketRecord::new(
            "smsbower".to_string(),
            "telegram".to_string(),
            "RU".to_string(),
            "+79001234567".to_string(),
            Some("retry-smsbower-fail".to_string()),
            Some(0.06),
        );
        ticket.status = TicketStatus::WaitingCode;
        ticket.same_activation_retry_supported = true;
        ticket.same_activation_retry_expires_at = Some(Utc::now() + Duration::minutes(5));
        let ticket_id = ticket.id.clone();
        service.upsert_ticket(ticket);

        let response = service
            .acquire_code(AcquireCodeRequest {
                provider: "smsbower".to_string(),
                service: Some("telegram".to_string()),
                country: Some("RU".to_string()),
                max_price: None,
                min_price: None,
                auto_pick_country: None,
                reuse_phone: None,
                reuse_key: None,
                metadata: BTreeMap::new(),
                routing_plan_id: None,
                routing_plan_name: None,
            })
            .await
            .unwrap();

        assert_ne!(response.ticket_id, ticket_id);
        assert_eq!(response.acquire_path, AcquirePath::FreshAcquire);
        let persisted = RuntimeStore::open(runtime_db)
            .unwrap()
            .load_state()
            .unwrap();
        let original = persisted
            .tickets
            .iter()
            .find(|entry| entry.id == ticket_id)
            .unwrap();
        assert!(!original.same_activation_retry_supported);
        assert!(original.same_activation_retry_expires_at.is_some());

        server.abort();
    }

    #[tokio::test]
    async fn upstream_actions_are_written_to_logs() {
        let service = make_service();
        let _ = service.get_balance("mock").await.unwrap();
        let _ = service
            .get_prices(ProviderPriceQuery {
                provider: "mock".to_string(),
                service: Some("openai".to_string()),
                country: None,
                operator: None,
            })
            .await
            .unwrap();

        let logs = service.runtime_snapshot().logs;
        assert!(
            logs.iter().any(
                |entry| entry.scope == "upstream:mock" && entry.message.contains("get_balance")
            )
        );
        assert!(logs.iter().any(|entry| entry.scope == "upstream:mock" && entry.message.contains("get_prices")));
    }

    #[tokio::test]
    async fn smsbower_prices_use_raw_service_code_when_cached_provider_value_is_numeric() {
        #[derive(Clone, Default)]
        struct PriceQueryState {
            queries: Arc<parking_lot::Mutex<Vec<String>>>,
        }

        async fn get_prices_v3(
            State(state): State<PriceQueryState>,
            Query(query): Query<std::collections::HashMap<String, String>>,
        ) -> Json<serde_json::Value> {
            let service = query.get("service").cloned().unwrap_or_default();
            state.queries.lock().push(service.clone());
            Json(serde_json::json!({
                "31": {
                    "dr": {
                        "247": {
                            "price": "0.12",
                            "count": "9"
                        }
                    }
                }
            }))
        }

        let price_state = PriceQueryState::default();
        let router = Router::new()
            .route("/stubs/handler_api.php", get(get_prices_v3))
            .with_state(price_state.clone());
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr: SocketAddr = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let _ = axum::serve(listener, router).await;
        });

        let base_url = format!("http://{addr}/stubs/handler_api.php");
        let service = make_service_with_provider_overrides(&[(
            "smsbower",
            &move |manifest: &mut ProviderManifest| {
                if let Some(config) = manifest.handler_api.as_mut() {
                    config.base_url = base_url.clone();
                }
            },
        )]);
        {
            let mut cache = service.provider_option_cache.write();
            cache.entries.insert(
                "smsbower".to_string(),
                ProviderOptionCacheEntry {
                    provider: "smsbower".to_string(),
                    fetched_at: Utc::now(),
                    options: ProviderDynamicOptions {
                        provider: "smsbower".to_string(),
                        raw_services: vec![OptionItem {
                            value: "dr".to_string(),
                            label: "OpenAI (ChatGPT)".to_string(),
                            hint: "dr".to_string(),
                            provider_value: Some("247".to_string()),
                            icon_url: Some("https://smsbower.app/img/services/247.svg".to_string()),
                            provider_icon_url: Some(
                                "https://smsbower.app/img/services/247.svg".to_string(),
                            ),
                        }],
                        raw_countries: Vec::new(),
                        raw_operators: Vec::new(),
                        services: vec![OptionItem {
                            value: "openai".to_string(),
                            label: "OpenAI (GPT)".to_string(),
                            hint: "dr".to_string(),
                            provider_value: Some("247".to_string()),
                            icon_url: Some("https://smsbower.app/img/services/247.svg".to_string()),
                            provider_icon_url: Some(
                                "https://smsbower.app/img/services/247.svg".to_string(),
                            ),
                        }],
                        countries: Vec::new(),
                        operators: Vec::new(),
                        operators_by_country: BTreeMap::new(),
                        cache_state: crate::models::OptionCacheState::Fresh,
                        fetched_at: Some(Utc::now()),
                    },
                },
            );
        }

        let response = service
            .get_prices(ProviderPriceQuery {
                provider: "smsbower".to_string(),
                service: Some("openai".to_string()),
                country: None,
                operator: None,
            })
            .await
            .unwrap();

        assert_eq!(response.service, "openai");
        assert_eq!(response.items.len(), 1);
        assert_eq!(price_state.queries.lock().as_slice(), ["dr"]);

        let logs = service.runtime_snapshot().logs;
        assert!(logs.iter().any(|entry| {
            entry.scope == "upstream:smsbower"
                && entry.message.contains("get_prices")
                && entry.message.contains("service=dr")
        }));

        server.abort();
    }

    #[tokio::test]
    async fn list_provider_operators_prefers_fresh_country_cache() {
        let service = make_service();
        {
            let mut cache = service.provider_option_cache.write();
            cache.entries.insert(
                "mock".to_string(),
                ProviderOptionCacheEntry {
                    provider: "mock".to_string(),
                    fetched_at: Utc::now(),
                    options: ProviderDynamicOptions {
                        provider: "mock".to_string(),
                        raw_services: Vec::new(),
                        raw_countries: Vec::new(),
                        raw_operators: Vec::new(),
                        services: Vec::new(),
                        countries: vec![OptionItem {
                            value: "usa".to_string(),
                            label: "United States".to_string(),
                            hint: "50".to_string(),
                            provider_value: Some("usa".to_string()),
                            icon_url: None,
                            provider_icon_url: None,
                        }],
                        operators: vec![OptionItem {
                            value: "fallback".to_string(),
                            label: "Fallback".to_string(),
                            hint: String::new(),
                            provider_value: Some("fallback".to_string()),
                            icon_url: None,
                            provider_icon_url: None,
                        }],
                        operators_by_country: BTreeMap::from([(
                            "us".to_string(),
                            crate::models::ProviderCountryOperatorOptions {
                                raw_operators: vec![OptionItem {
                                    value: "cached-carrier".to_string(),
                                    label: "Cached Carrier".to_string(),
                                    hint: String::new(),
                                    provider_value: Some("cached-carrier".to_string()),
                                    icon_url: None,
                                    provider_icon_url: None,
                                }],
                                operators: vec![OptionItem {
                                    value: "cached carrier".to_string(),
                                    label: "Cached Carrier".to_string(),
                                    hint: String::new(),
                                    provider_value: Some("cached-carrier".to_string()),
                                    icon_url: None,
                                    provider_icon_url: None,
                                }],
                                fetched_at: Some(Utc::now()),
                            },
                        )]),
                        cache_state: crate::models::OptionCacheState::Fresh,
                        fetched_at: Some(Utc::now()),
                    },
                },
            );
        }

        let response = service
            .list_provider_operators(
                "mock",
                ProviderOperatorsQuery {
                    country: Some("US".to_string()),
                },
            )
            .await
            .unwrap();

        assert_eq!(response.items.len(), 1);
        assert_eq!(response.items[0].value, "cached carrier");
        assert_eq!(
            response.items[0].provider_value.as_deref(),
            Some("cached-carrier")
        );
    }

    #[test]
    fn runtime_snapshot_exposes_cached_provider_balance() {
        let service = make_service();
        service.provider_balance_cache.write().insert(
            "fivesim".to_string(),
            ProviderBalanceCacheEntry {
                provider: "fivesim".to_string(),
                amount: 12.34,
                currency: "USD".to_string(),
                fetched_at: Utc::now(),
            },
        );

        let snapshot = service.runtime_snapshot();
        let provider = snapshot
            .providers
            .iter()
            .find(|item| item.id == "fivesim")
            .unwrap();

        assert_eq!(provider.balance, Some(12.34));
        assert_eq!(provider.balance_currency.as_deref(), Some("USD"));
        assert!(provider.balance_fetched_at.is_some());
        assert!(provider.operator_selectable);

        let hero = snapshot
            .providers
            .iter()
            .find(|item| item.id == "herosms")
            .unwrap();
        assert!(!hero.operator_selectable);
    }

    #[tokio::test]
    async fn refresh_all_provider_balances_skips_provider_without_api_key() {
        let provider_dir = fixture_provider_dir();
        let fivesim_path = provider_dir.join("fivesim.toml");
        let content = fs::read_to_string(&fivesim_path).unwrap();
        fs::write(
            &fivesim_path,
            content
                .replace("api_key = \"", "api_key = \"disabled-")
                .replacen("disabled-", "", 1),
        )
        .unwrap();
        let content = fs::read_to_string(&fivesim_path).unwrap();
        let updated = content
            .lines()
            .map(|line| {
                if line.trim_start().starts_with("api_key = ") {
                    "api_key = \"\"".to_string()
                } else {
                    line.to_string()
                }
            })
            .collect::<Vec<_>>()
            .join("\n");
        fs::write(&fivesim_path, updated).unwrap();

        let registry = ProviderRegistry::load_from_dir(provider_dir).unwrap();
        let service = SmsService::new(registry, 32);

        service.refresh_all_provider_balances().await;

        let snapshot = service.runtime_snapshot();
        let provider = snapshot
            .providers
            .iter()
            .find(|item| item.id == "fivesim")
            .unwrap();
        assert!(provider.balance.is_none());

        let logs = snapshot.logs;
        assert!(!logs.iter().any(|entry| {
            entry.scope == "upstream:fivesim" && entry.message.contains("get_balance")
        }));
    }

    #[test]
    fn low_balance_error_auto_disables_provider() {
        let service = make_service();

        let message = service.maybe_disable_provider_for_low_balance(
            "fivesim",
            &SmsError::Upstream("insufficient balance for provider".to_string()),
        );
        if let Some(message) = message {
            service.log("balance", "warn", message);
        }

        let manifest = service.provider_manifest("fivesim").unwrap();
        assert!(!manifest.enabled);

        let logs = service.runtime_snapshot().logs;
        assert!(logs.iter().any(|entry| {
            entry.scope == "balance"
                && entry.message.contains("auto-disabled")
                && entry.message.contains("fivesim")
        }));
    }

    #[test]
    fn notification_feed_returns_latest_entries_first() {
        let service = make_service();
        service.log("system", "info", "entry-1");
        service.log("system", "info", "entry-2");
        service.log("system", "info", "entry-3");

        let feed = service.notification_feed();

        assert_eq!(
            feed.items.first().map(|entry| entry.message.as_str()),
            Some("entry-3")
        );
        assert_eq!(
            feed.items.get(1).map(|entry| entry.message.as_str()),
            Some("entry-2")
        );
    }

    #[test]
    fn runtime_state_persists_logs_and_tickets() {
        let base = std::env::temp_dir().join(format!("madao-runtime-state-{}", Uuid::now_v7()));
        fs::create_dir_all(&base).unwrap();
        let service = make_persistent_service(&base);

        service.log("system", "info", "persisted-log");
        let ticket = TicketRecord::new(
            "mock".to_string(),
            "openai".to_string(),
            "usa".to_string(),
            "+10000000000".to_string(),
            Some("upstream-1".to_string()),
            Some(0.1),
        );
        service.upsert_ticket(ticket.clone());

        let reloaded = make_persistent_service(&base);
        let snapshot = reloaded.runtime_snapshot();

        assert!(
            snapshot
                .logs
                .iter()
                .any(|entry| entry.message == "persisted-log")
        );
        assert!(snapshot.tickets.iter().any(|entry| entry.id == ticket.id));
    }

    #[test]
    fn runtime_state_persisted_logs_respect_buffer_limit_after_reload() {
        let base = std::env::temp_dir().join(format!("madao-runtime-logs-{}", Uuid::now_v7()));
        fs::create_dir_all(&base).unwrap();
        let service = make_persistent_service(&base);

        for index in 0..40 {
            service.log("system", "info", format!("entry-{index}"));
        }

        let reloaded = make_persistent_service(&base);
        let logs = reloaded.runtime_snapshot().logs;

        assert_eq!(logs.len(), 32);
        assert_eq!(
            logs.first().map(|entry| entry.message.as_str()),
            Some("entry-8")
        );
        assert_eq!(
            logs.last().map(|entry| entry.message.as_str()),
            Some("entry-39")
        );
    }

    #[test]
    fn runtime_state_persisted_ticket_limit_survives_reload() {
        let base = std::env::temp_dir().join(format!("madao-runtime-tickets-{}", Uuid::now_v7()));
        fs::create_dir_all(&base).unwrap();
        let service = make_persistent_service(&base);

        for index in 0..520_u32 {
            service.upsert_ticket(TicketRecord {
                id: format!("persisted-ticket-{index:04}"),
                provider: "mock".to_string(),
                service: "openai".to_string(),
                country: "usa".to_string(),
                operator: None,
                phone_number: format!("+100100{index:04}"),
                upstream_id: None,
                price: None,
                status: TicketStatus::Pending,
                created_at: Utc::now(),
                updated_at: Utc::now() + chrono::Duration::seconds(index as i64),
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
            });
        }

        let reloaded = make_persistent_service(&base);
        let tickets = reloaded.list_tickets().items;

        assert_eq!(tickets.len(), DEFAULT_TICKET_BUFFER);
        assert!(
            !tickets
                .iter()
                .any(|ticket| ticket.id == "persisted-ticket-0000")
        );
        assert!(
            tickets
                .iter()
                .any(|ticket| ticket.id == "persisted-ticket-0519")
        );
    }

    #[tokio::test]
    async fn runtime_state_limits_ticket_growth() {
        let provider_dir = fixture_provider_dir();
        let registry = ProviderRegistry::load_from_dir(provider_dir).unwrap();
        let service =
            SmsService::with_persistence_paths(registry, 32, None, None, None, None, None);

        for index in 0..520_u32 {
            service.upsert_ticket(TicketRecord {
                id: format!("ticket-{index:04}"),
                provider: "mock".to_string(),
                service: "openai".to_string(),
                country: "usa".to_string(),
                operator: None,
                phone_number: format!("+100000{index:04}"),
                upstream_id: None,
                price: None,
                status: TicketStatus::Pending,
                created_at: Utc::now(),
                updated_at: Utc::now() + chrono::Duration::seconds(index as i64),
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
            });
        }

        let tickets = service.list_tickets().items;
        assert_eq!(tickets.len(), DEFAULT_TICKET_BUFFER);
        assert!(!tickets.iter().any(|ticket| ticket.id == "ticket-0000"));
        assert!(tickets.iter().any(|ticket| ticket.id == "ticket-0519"));
    }

    #[tokio::test]
    async fn routing_failover_can_continue_into_next_round() {
        let service = make_service();
        let mut plan = routing_plan();
        plan.execution_rounds = 2;
        service.save_routing_plan(plan).unwrap();

        let acquire = service
            .acquire_code(AcquireCodeRequest {
                provider: "auto".to_string(),
                service: None,
                country: None,
                max_price: None,
                min_price: None,
                auto_pick_country: None,
                reuse_phone: None,
                reuse_key: None,
                metadata: BTreeMap::new(),
                routing_plan_id: Some("openai-plan".to_string()),
                routing_plan_name: None,
            })
            .await
            .unwrap();

        let first_failover = service
            .failover_routing_attempt(RoutingFailoverRequest {
                ticket_id: acquire.ticket_id.clone(),
                reason: Some("round-1 next".to_string()),
                failed_item_id: acquire.routing_item_id.clone(),
            })
            .await
            .unwrap();
        assert_eq!(
            first_failover.routing_item_id.as_deref(),
            Some("mock-second")
        );

        let second_failover = service
            .failover_routing_attempt(RoutingFailoverRequest {
                ticket_id: first_failover.ticket_id.clone(),
                reason: Some("round-2 restart".to_string()),
                failed_item_id: first_failover.routing_item_id.clone(),
            })
            .await
            .unwrap();
        assert_eq!(
            second_failover.routing_item_id.as_deref(),
            Some("mock-first")
        );

        let ticket = service.ticket(&second_failover.ticket_id).unwrap();
        assert_eq!(ticket.routing_current_round, Some(2));
        assert_eq!(ticket.routing_execution_rounds, Some(2));
    }

    #[tokio::test]
    async fn routing_failover_supports_unlimited_rounds() {
        let service = make_service();
        let mut plan = routing_plan();
        plan.execution_rounds = 0;
        plan.items.truncate(1);
        service.save_routing_plan(plan).unwrap();

        service.upsert_ticket(TicketRecord {
            id: "ticket-unlimited-rounds".to_string(),
            provider: "mock".to_string(),
            service: "openai".to_string(),
            country: "usa".to_string(),
            operator: None,
            phone_number: "+10000000099".to_string(),
            upstream_id: None,
            price: None,
            status: TicketStatus::WaitingCode,
            created_at: Utc::now(),
            updated_at: Utc::now(),
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
            routing_plan_id: Some("openai-plan".to_string()),
            routing_plan_name: Some("OpenAI Plan".to_string()),
            routing_item_id: Some("mock-first".to_string()),
            routing_item_index: Some(40),
            routing_execution_mode: Some(RoutingExecutionMode::Sequential),
            routing_execution_rounds: Some(0),
            routing_current_round: Some(41),
            routing_candidate_item_ids: vec!["mock-first".to_string()],
            routing_attempt_count: 41,
            reuse_count: 0,
        });

        let next = service
            .failover_routing_attempt(RoutingFailoverRequest {
                ticket_id: "ticket-unlimited-rounds".to_string(),
                reason: Some("keep cycling".to_string()),
                failed_item_id: Some("mock-first".to_string()),
            })
            .await
            .unwrap();

        let ticket = service.ticket(&next.ticket_id).unwrap();
        assert_eq!(ticket.routing_current_round, Some(42));
        assert_eq!(ticket.routing_execution_rounds, Some(0));
        assert_eq!(next.routing_item_id.as_deref(), Some("mock-first"));
    }

    #[tokio::test]
    async fn callback_subscription_dispatches_after_code_is_available() {
        #[derive(Clone, Default)]
        struct CallbackState {
            payloads: Arc<parking_lot::Mutex<Vec<TicketCodeCallbackPayload>>>,
        }

        async fn receive_callback(
            State(state): State<CallbackState>,
            Json(payload): Json<TicketCodeCallbackPayload>,
        ) -> Json<serde_json::Value> {
            state.payloads.lock().push(payload);
            Json(serde_json::json!({ "status": "ok" }))
        }

        let callback_state = CallbackState::default();
        let router = Router::new()
            .route("/callback", post(receive_callback))
            .with_state(callback_state.clone());
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr: SocketAddr = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let _ = axum::serve(listener, router).await;
        });

        let service = make_service();
        let acquire = service
            .acquire_code(AcquireCodeRequest {
                provider: "mock".to_string(),
                service: Some("openai".to_string()),
                country: Some("local".to_string()),
                max_price: None,
                min_price: None,
                auto_pick_country: None,
                reuse_phone: None,
                reuse_key: None,
                metadata: BTreeMap::new(),
                routing_plan_id: None,
                routing_plan_name: None,
            })
            .await
            .unwrap();

        service
            .register_ticket_callback(
                &acquire.ticket_id,
                TicketCallbackRegistrationRequest {
                    url: format!("http://{addr}/callback"),
                    secret: Some("demo".to_string()),
                },
            )
            .unwrap();

        service.maybe_dispatch_ticket_callbacks().await;

        let payloads = callback_state.payloads.lock().clone();
        assert_eq!(payloads.len(), 1);
        assert_eq!(payloads[0].ticket_id, acquire.ticket_id);
        assert_eq!(payloads[0].code.as_deref(), Some("123456"));

        server.abort();
    }

    #[tokio::test]
    async fn callback_subscription_is_retained_after_delivery_failure() {
        let service = make_service();
        let acquire = service
            .acquire_code(AcquireCodeRequest {
                provider: "mock".to_string(),
                service: Some("openai".to_string()),
                country: Some("local".to_string()),
                max_price: None,
                min_price: None,
                auto_pick_country: None,
                reuse_phone: None,
                reuse_key: None,
                metadata: BTreeMap::new(),
                routing_plan_id: None,
                routing_plan_name: None,
            })
            .await
            .unwrap();

        service
            .register_ticket_callback(
                &acquire.ticket_id,
                TicketCallbackRegistrationRequest {
                    url: "http://127.0.0.1:9/callback".to_string(),
                    secret: Some("demo".to_string()),
                },
            )
            .unwrap();

        service.maybe_dispatch_ticket_callbacks().await;

        let callbacks = service.list_ticket_callbacks(&acquire.ticket_id).unwrap();
        assert_eq!(callbacks.items.len(), 1);
        assert_eq!(callbacks.items[0].url, "http://127.0.0.1:9/callback");
    }

    #[tokio::test]
    async fn callback_subscription_rejects_non_http_scheme() {
        let service = make_service();
        let acquire = service
            .acquire_code(AcquireCodeRequest {
                provider: "mock".to_string(),
                service: Some("openai".to_string()),
                country: Some("local".to_string()),
                max_price: None,
                min_price: None,
                auto_pick_country: None,
                reuse_phone: None,
                reuse_key: None,
                metadata: BTreeMap::new(),
                routing_plan_id: None,
                routing_plan_name: None,
            })
            .await
            .unwrap();

        let error = service
            .register_ticket_callback(
                &acquire.ticket_id,
                TicketCallbackRegistrationRequest {
                    url: "file:///tmp/callback".to_string(),
                    secret: None,
                },
            )
            .unwrap_err();

        assert!(
            error
                .to_string()
                .contains("callback url must use http or https")
        );
    }

    #[test]
    fn clear_logs_resets_notification_feed() {
        let service = make_service();
        service.log("system", "info", "entry-1");
        service.log("system", "warn", "entry-2");

        assert!(!service.notification_feed().items.is_empty());

        service.clear_logs();

        let feed = service.notification_feed();
        assert!(feed.items.is_empty());
    }

    #[test]
    fn activity_feed_is_capped_and_recent_first() {
        let service = make_service();
        for index in 0..80 {
            service.push_activity(ActivityEntry {
                id: format!("activity-{index}"),
                timestamp: Utc::now(),
                kind: ActivityKind::TicketEvent,
                level: ActivityLevel::Info,
                title: format!("event-{index}"),
                detail: None,
                provider: Some("mock".to_string()),
                service: Some("openai".to_string()),
                country: Some("usa".to_string()),
                routing_plan_id: None,
                routing_plan_name: None,
                routing_item_id: None,
                routing_round: None,
                ticket_id: Some(format!("ticket-{index}")),
            });
        }

        let feed = service.activity_feed();
        assert_eq!(feed.items.len(), SNAPSHOT_ACTIVITY_LIMIT);
        assert_eq!(
            feed.items.first().map(|entry| entry.id.as_str()),
            Some("activity-79")
        );
    }

    #[tokio::test]
    async fn routing_failover_returns_last_provider_error() {
        let service = make_service();
        let mut plan = routing_plan();
        for item in &mut plan.items {
            item.provider = "missing-provider".to_string();
        }
        service.save_routing_plan(plan).unwrap();

        let mut tickets = service.tickets.write();
        tickets.insert(
            "ticket-routing-failed".to_string(),
            TicketRecord {
                id: "ticket-routing-failed".to_string(),
                provider: "mock".to_string(),
                service: "openai".to_string(),
                country: "usa".to_string(),
                operator: None,
                phone_number: "+10000000000".to_string(),
                status: TicketStatus::Cancelled,
                created_at: Utc::now(),
                updated_at: Utc::now(),
                acquire_path: AcquirePath::FreshAcquire,
                price: None,
                code: None,
                message: None,
                same_activation_retry_supported: false,
                same_activation_retry_expires_at: None,
                pending_release_action: None,
                auto_release_at: None,
                next_release_attempt_at: None,
                release_retry_deadline_at: None,
                release_retry_count: 0,
                upstream_id: None,
                routing_plan_id: Some("openai-plan".to_string()),
                routing_plan_name: Some("OpenAI Plan".to_string()),
                routing_item_id: Some("mock-first".to_string()),
                routing_item_index: Some(0),
                routing_execution_mode: Some(RoutingExecutionMode::Sequential),
                routing_execution_rounds: Some(1),
                routing_current_round: Some(1),
                routing_candidate_item_ids: vec![
                    "mock-first".to_string(),
                    "mock-second".to_string(),
                ],
                routing_attempt_count: 1,
                reuse_count: 0,
            },
        );
        drop(tickets);

        let error = service
            .failover_routing_attempt(RoutingFailoverRequest {
                ticket_id: "ticket-routing-failed".to_string(),
                reason: Some("force failover".to_string()),
                failed_item_id: Some("mock-first".to_string()),
            })
            .await
            .unwrap_err();

        assert!(
            error
                .to_string()
                .contains("provider `missing-provider` not found")
        );
        let logs = service.runtime_snapshot().logs;
        assert!(logs.iter().any(|entry| {
            entry.scope == "router"
                && entry
                    .message
                    .contains("routing failover skipped item mock-second")
        }));
    }

    #[tokio::test]
    async fn cancel_during_cooldown_enters_cancel_pending() {
        #[derive(Clone, Default)]
        struct ReleaseState {
            calls: Arc<parking_lot::Mutex<u32>>,
        }

        async fn handler(
            State(state): State<ReleaseState>,
            Query(query): Query<HashMap<String, String>>,
        ) -> String {
            match query.get("action").map(String::as_str) {
                Some("setStatus") => {
                    let mut calls = state.calls.lock();
                    *calls += 1;
                    r#"{"title":"EARLY_CANCEL_DENIED","details":"Activation cannot be cancelled at this time. Minimum activation period must pass.","info":{"minActivationTime":120}}"#.to_string()
                }
                Some("getNumberV2") => r#"{"activationId":"activation-1","phoneNumber":"79001234567","activationCost":"0.06","canGetAnotherSms":true}"#.to_string(),
                _ => "ACCESS_OK".to_string(),
            }
        }

        let state = ReleaseState::default();
        let router = Router::new()
            .route("/", get(handler))
            .with_state(state.clone());
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr: SocketAddr = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let _ = axum::serve(listener, router).await;
        });

        let service = make_service_with_provider_overrides(&[(
            "herosms",
            &|manifest: &mut ProviderManifest| {
                manifest.handler_api.as_mut().unwrap().base_url = format!("http://{addr}/");
            },
        )]);

        let acquire = service
            .acquire_code(AcquireCodeRequest {
                provider: "herosms".to_string(),
                service: Some("telegram".to_string()),
                country: Some("US".to_string()),
                max_price: None,
                min_price: None,
                auto_pick_country: None,
                reuse_phone: Some(true),
                reuse_key: None,
                metadata: BTreeMap::new(),
                routing_plan_id: None,
                routing_plan_name: None,
            })
            .await
            .unwrap();

        let release = service
            .release_code(ReleaseCodeRequest {
                ticket_id: acquire.ticket_id.clone(),
                action: crate::models::ReleaseAction::Cancel,
            })
            .await
            .unwrap();

        assert_eq!(release.status, TicketStatus::CancelPending);
        let ticket = service.ticket(&acquire.ticket_id).unwrap();
        assert_eq!(ticket.status, TicketStatus::CancelPending);
        assert_eq!(
            ticket.pending_release_action,
            Some(crate::models::ReleaseAction::Cancel)
        );
        assert!(ticket.auto_release_at.is_some());
        assert_eq!(ticket.next_release_attempt_at, ticket.auto_release_at);
        assert!(ticket.release_retry_deadline_at.is_some());
        assert_eq!(ticket.release_retry_count, 0);
        assert!(!ticket.same_activation_retry_supported);
        let activity = service.activity_feed();
        assert!(activity.items.iter().any(|entry| {
            entry.kind == ActivityKind::ReleaseEvent && entry.title.contains("自动取消已安排")
        }));

        server.abort();
    }

    #[tokio::test]
    async fn pending_cancel_is_auto_released_after_cooldown() {
        #[derive(Clone, Default)]
        struct ReleaseState {
            calls: Arc<parking_lot::Mutex<u32>>,
        }

        async fn handler(
            State(state): State<ReleaseState>,
            Query(query): Query<HashMap<String, String>>,
        ) -> String {
            match query.get("action").map(String::as_str) {
                Some("setStatus") => {
                    let mut calls = state.calls.lock();
                    *calls += 1;
                    if *calls == 1 {
                        r#"{"title":"EARLY_CANCEL_DENIED","details":"Activation cannot be cancelled at this time. Minimum activation period must pass.","info":{"minActivationTime":0}}"#.to_string()
                    } else {
                        "ACCESS_CANCEL".to_string()
                    }
                }
                Some("getNumberV2") => r#"{"activationId":"activation-1","phoneNumber":"79001234567","activationCost":"0.06","canGetAnotherSms":true}"#.to_string(),
                _ => "ACCESS_OK".to_string(),
            }
        }

        let state = ReleaseState::default();
        let router = Router::new()
            .route("/", get(handler))
            .with_state(state.clone());
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr: SocketAddr = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let _ = axum::serve(listener, router).await;
        });

        let service = make_service_with_provider_overrides(&[(
            "herosms",
            &|manifest: &mut ProviderManifest| {
                manifest.handler_api.as_mut().unwrap().base_url = format!("http://{addr}/");
            },
        )]);

        let acquire = service
            .acquire_code(AcquireCodeRequest {
                provider: "herosms".to_string(),
                service: Some("telegram".to_string()),
                country: Some("US".to_string()),
                max_price: None,
                min_price: None,
                auto_pick_country: None,
                reuse_phone: Some(true),
                reuse_key: None,
                metadata: BTreeMap::new(),
                routing_plan_id: None,
                routing_plan_name: None,
            })
            .await
            .unwrap();

        let _ = service
            .release_code(ReleaseCodeRequest {
                ticket_id: acquire.ticket_id.clone(),
                action: crate::models::ReleaseAction::Cancel,
            })
            .await
            .unwrap();

        service.maybe_process_pending_releases().await;

        let ticket = service.ticket(&acquire.ticket_id).unwrap();
        assert_eq!(ticket.status, TicketStatus::Cancelled);
        assert_eq!(ticket.pending_release_action, None);
        assert_eq!(ticket.auto_release_at, None);
        assert_eq!(ticket.next_release_attempt_at, None);
        assert_eq!(ticket.release_retry_deadline_at, None);
        assert_eq!(ticket.release_retry_count, 0);
        let logs = service.runtime_snapshot().logs;
        assert!(
            logs.iter()
                .any(|entry| entry.message.contains("auto cancel completed"))
        );

        server.abort();
    }

    #[tokio::test]
    async fn pending_cancel_failure_schedules_five_second_retry() {
        #[derive(Clone, Default)]
        struct ReleaseState {
            calls: Arc<parking_lot::Mutex<u32>>,
        }

        async fn handler(
            State(state): State<ReleaseState>,
            Query(query): Query<HashMap<String, String>>,
        ) -> String {
            match query.get("action").map(String::as_str) {
                Some("setStatus") => {
                    let mut calls = state.calls.lock();
                    *calls += 1;
                    r#"{"title":"EARLY_CANCEL_DENIED","details":"Activation cannot be cancelled at this time. Minimum activation period must pass.","info":{"minActivationTime":0}}"#.to_string()
                }
                Some("getNumberV2") => r#"{"activationId":"activation-1","phoneNumber":"79001234567","activationCost":"0.06","canGetAnotherSms":true}"#.to_string(),
                _ => "ACCESS_OK".to_string(),
            }
        }

        let state = ReleaseState::default();
        let router = Router::new()
            .route("/", get(handler))
            .with_state(state.clone());
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr: SocketAddr = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let _ = axum::serve(listener, router).await;
        });

        let service = make_service_with_provider_overrides(&[(
            "herosms",
            &|manifest: &mut ProviderManifest| {
                manifest.handler_api.as_mut().unwrap().base_url = format!("http://{addr}/");
            },
        )]);

        let acquire = service
            .acquire_code(AcquireCodeRequest {
                provider: "herosms".to_string(),
                service: Some("telegram".to_string()),
                country: Some("US".to_string()),
                max_price: None,
                min_price: None,
                auto_pick_country: None,
                reuse_phone: Some(true),
                reuse_key: None,
                metadata: BTreeMap::new(),
                routing_plan_id: None,
                routing_plan_name: None,
            })
            .await
            .unwrap();

        let _ = service
            .release_code(ReleaseCodeRequest {
                ticket_id: acquire.ticket_id.clone(),
                action: crate::models::ReleaseAction::Cancel,
            })
            .await
            .unwrap();

        service.maybe_process_pending_releases().await;

        let ticket = service.ticket(&acquire.ticket_id).unwrap();
        assert_eq!(ticket.status, TicketStatus::CancelPending);
        assert_eq!(ticket.release_retry_count, 1);
        assert!(ticket.next_release_attempt_at.is_some());
        let logs = service.runtime_snapshot().logs;
        assert!(
            logs.iter()
                .any(|entry| entry.message.contains("auto cancel retry scheduled"))
        );

        server.abort();
    }

    #[tokio::test]
    async fn pending_cancel_reconciles_when_provider_already_cancelled() {
        async fn handler(Query(query): Query<HashMap<String, String>>) -> String {
            match query.get("action").map(String::as_str) {
                Some("setStatus") => {
                    r#"{"title":"EARLY_CANCEL_DENIED","details":"Activation cannot be cancelled at this time. Minimum activation period must pass.","info":{"minActivationTime":0}}"#.to_string()
                }
                Some("getStatus") => "STATUS_CANCEL".to_string(),
                Some("getNumberV2") => r#"{"activationId":"activation-1","phoneNumber":"79001234567","activationCost":"0.06","canGetAnotherSms":true}"#.to_string(),
                _ => "ACCESS_OK".to_string(),
            }
        }

        let router = Router::new().route("/", get(handler));
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr: SocketAddr = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let _ = axum::serve(listener, router).await;
        });

        let service = make_service_with_provider_overrides(&[(
            "herosms",
            &|manifest: &mut ProviderManifest| {
                manifest.handler_api.as_mut().unwrap().base_url = format!("http://{addr}/");
            },
        )]);

        let acquire = service
            .acquire_code(AcquireCodeRequest {
                provider: "herosms".to_string(),
                service: Some("telegram".to_string()),
                country: Some("US".to_string()),
                max_price: None,
                min_price: None,
                auto_pick_country: None,
                reuse_phone: Some(true),
                reuse_key: None,
                metadata: BTreeMap::new(),
                routing_plan_id: None,
                routing_plan_name: None,
            })
            .await
            .unwrap();

        let _ = service
            .release_code(ReleaseCodeRequest {
                ticket_id: acquire.ticket_id.clone(),
                action: crate::models::ReleaseAction::Cancel,
            })
            .await
            .unwrap();

        service.maybe_process_pending_releases().await;

        let ticket = service.ticket(&acquire.ticket_id).unwrap();
        assert_eq!(ticket.status, TicketStatus::Cancelled);
        assert_eq!(ticket.pending_release_action, None);
        assert_eq!(ticket.auto_release_at, None);
        assert_eq!(ticket.next_release_attempt_at, None);
        assert_eq!(ticket.release_retry_deadline_at, None);
        assert_eq!(ticket.release_retry_count, 0);
        assert_eq!(ticket.message.as_deref(), Some("STATUS_CANCEL"));
        let logs = service.runtime_snapshot().logs;
        assert!(logs.iter().any(|entry| {
            entry
                .message
                .contains("reconciled to cancelled from provider status")
        }));

        server.abort();
    }

    #[derive(Clone, Default)]
    struct StatsUploadState {
        payloads: Arc<Mutex<Vec<Value>>>,
        auth_headers: Arc<Mutex<Vec<Option<String>>>>,
    }

    #[tokio::test]
    async fn sync_ticket_stats_marks_events_synced_and_updates_status() {
        async fn upload_stats(
            State(state): State<StatsUploadState>,
            headers: HeaderMap,
            Json(payload): Json<Value>,
        ) -> Json<Value> {
            state.auth_headers.lock().push(
                headers
                    .get("authorization")
                    .and_then(|value| value.to_str().ok())
                    .map(str::to_string),
            );
            state.payloads.lock().push(payload);
            Json(serde_json::json!({ "accepted": 1 }))
        }

        let upload_state = StatsUploadState::default();
        let router = Router::new()
            .route("/v1/events", post(upload_stats))
            .with_state(upload_state.clone());
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr: SocketAddr = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let _ = axum::serve(listener, router).await;
        });

        let base = std::env::temp_dir().join(format!("madao-stats-sync-{}", Uuid::now_v7()));
        fs::create_dir_all(&base).unwrap();
        let provider_dir = fixture_provider_dir();
        let registry = ProviderRegistry::load_from_dir(provider_dir).unwrap();
        let service = SmsService::with_persistence_paths(
            registry,
            32,
            Some(base.join("runtime-settings.json")),
            Some(base.join("runtime.db")),
            Some(base.join("provider-options-cache.json")),
            Some(base.join("provider-options-raw.json")),
            Some(base.join("routing-plans.json")),
        );

        let settings = service
            .update_runtime_settings(RuntimeSettingsUpdate {
                routing_strategy: "ordered_priority".to_string(),
                auto_fallback: true,
                option_cache_enabled: true,
                option_cache_poll_interval_minutes: 30,
                only_show_openai_sms_countries: false,
                check_updates_on_launch: true,
                http_port: 7822,
                stats_sync_enabled: true,
                stats_sync_base_url: format!("http://{addr}"),
                stats_sync_api_token: "test-token".to_string(),
            })
            .unwrap();
        assert!(settings.stats_sync_enabled);

        let acquire = service
            .acquire_code(AcquireCodeRequest {
                provider: "mock".to_string(),
                service: Some("openai".to_string()),
                country: Some("local".to_string()),
                max_price: None,
                min_price: None,
                auto_pick_country: None,
                reuse_phone: None,
                reuse_key: None,
                metadata: BTreeMap::new(),
                routing_plan_id: None,
                routing_plan_name: None,
            })
            .await
            .unwrap();
        service
            .release_code(ReleaseCodeRequest {
                ticket_id: acquire.ticket_id.clone(),
                action: ReleaseAction::Finish,
            })
            .await
            .unwrap();

        let before = service.runtime_snapshot();
        assert!(
            before
                .stats_sync_status
                .as_ref()
                .map(|status| status.pending_events >= 2)
                .unwrap_or(false)
        );

        let result = service.sync_ticket_stats().await.unwrap();
        assert!(result.uploaded >= 2);
        assert_eq!(result.remaining, 0);
        assert!(result.status.last_success_at.is_some());
        assert!(result.status.last_error.is_none());

        let state = RuntimeStore::open(base.join("runtime.db"))
            .unwrap()
            .load_state()
            .unwrap();
        assert!(
            state
                .ticket_stats_events
                .iter()
                .all(|event| event.synced_at.is_some())
        );
        assert_eq!(state.stats_sync_status.pending_events, 0);
        assert!(state.stats_sync_status.last_success_at.is_some());

        let payloads = upload_state.payloads.lock().clone();
        assert_eq!(payloads.len(), 1);
        assert_eq!(
            upload_state.auth_headers.lock().as_slice(),
            [Some("Bearer test-token".to_string())]
        );
        let events = payloads[0]
            .get("events")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        assert!(events.len() >= 2);

        server.abort();
    }

    #[tokio::test]
    async fn fetch_remote_stats_summary_uses_public_snapshot_for_unfiltered_query() {
        #[derive(Clone, Default)]
        struct SummaryCallState {
            public_calls: Arc<Mutex<Vec<String>>>,
            admin_calls: Arc<Mutex<u32>>,
        }

        async fn public_summary(
            State(state): State<SummaryCallState>,
            headers: HeaderMap,
        ) -> Json<Value> {
            state.public_calls.lock().push(
                headers
                    .get("authorization")
                    .and_then(|value| value.to_str().ok())
                    .map(str::to_string)
                    .unwrap_or_default(),
            );
            Json(serde_json::json!({
                "lookback_hours": 24,
                "items": [
                    {
                        "provider": "mock",
                        "service": "openai",
                        "country": "local",
                        "operator": "any",
                        "total": 3,
                        "success_count": 2,
                        "success_rate": 0.6666666667,
                        "cancelled_count": 1,
                        "banned_count": 0,
                        "failed_count": 0
                    }
                ]
            }))
        }

        async fn admin_summary(State(state): State<SummaryCallState>) -> Json<Value> {
            *state.admin_calls.lock() += 1;
            Json(serde_json::json!({ "lookback_hours": 24, "items": [] }))
        }

        let state = SummaryCallState::default();
        let router = Router::new()
            .route("/v1/summary", get(public_summary))
            .route("/v1/admin/summary", get(admin_summary))
            .with_state(state.clone());
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr: SocketAddr = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let _ = axum::serve(listener, router).await;
        });

        let service = make_service();
        service
            .update_runtime_settings(RuntimeSettingsUpdate {
                routing_strategy: "ordered_priority".to_string(),
                auto_fallback: true,
                option_cache_enabled: true,
                option_cache_poll_interval_minutes: 30,
                only_show_openai_sms_countries: false,
                check_updates_on_launch: true,
                http_port: 7822,
                stats_sync_enabled: true,
                stats_sync_base_url: format!("http://{addr}"),
                stats_sync_api_token: "summary-token".to_string(),
            })
            .unwrap();

        let summary = service
            .fetch_remote_stats_summary(RemoteStatsSummaryQuery {
                provider: None,
                service: None,
                country: None,
                operator: None,
                lookback_hours: Some(24),
            })
            .await
            .unwrap();

        assert_eq!(summary.lookback_hours, 24);
        assert_eq!(summary.items.len(), 1);
        assert_eq!(summary.items[0].provider, "mock");
        assert_eq!(summary.items[0].success_count, 2);
        assert_eq!(state.public_calls.lock().as_slice(), [""]);
        assert_eq!(*state.admin_calls.lock(), 0);

        server.abort();
    }

    #[tokio::test]
    async fn fetch_remote_stats_summary_filters_snapshot_locally() {
        #[derive(Clone, Default)]
        struct SummaryCallState {
            public_calls: Arc<Mutex<Vec<String>>>,
            admin_calls: Arc<Mutex<u32>>,
        }

        async fn public_summary(
            State(state): State<SummaryCallState>,
            headers: HeaderMap,
        ) -> Json<Value> {
            state.public_calls.lock().push(
                headers
                    .get("authorization")
                    .and_then(|value| value.to_str().ok())
                    .map(str::to_string)
                    .unwrap_or_default(),
            );
            Json(serde_json::json!({
                "lookback_hours": 24,
                "items": [
                    {
                        "provider": "mock",
                        "service": "openai",
                        "country": "local",
                        "operator": "any",
                        "total": 3,
                        "success_count": 2,
                        "success_rate": 0.6666666667,
                        "cancelled_count": 1,
                        "banned_count": 0,
                        "failed_count": 0
                    },
                    {
                        "provider": "other",
                        "service": "openai",
                        "country": "local",
                        "operator": "any",
                        "total": 10,
                        "success_count": 4,
                        "success_rate": 0.4,
                        "cancelled_count": 0,
                        "banned_count": 0,
                        "failed_count": 6
                    }
                ]
            }))
        }

        async fn admin_summary(State(state): State<SummaryCallState>) -> StatusCode {
            *state.admin_calls.lock() += 1;
            StatusCode::IM_A_TEAPOT
        }

        let state = SummaryCallState::default();
        let router = Router::new()
            .route("/v1/summary", get(public_summary))
            .route("/v1/admin/summary", get(admin_summary))
            .with_state(state.clone());
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr: SocketAddr = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let _ = axum::serve(listener, router).await;
        });

        let service = make_service();
        service
            .update_runtime_settings(RuntimeSettingsUpdate {
                routing_strategy: "ordered_priority".to_string(),
                auto_fallback: true,
                option_cache_enabled: true,
                option_cache_poll_interval_minutes: 30,
                only_show_openai_sms_countries: false,
                check_updates_on_launch: true,
                http_port: 7822,
                stats_sync_enabled: true,
                stats_sync_base_url: format!("http://{addr}"),
                stats_sync_api_token: "summary-token".to_string(),
            })
            .unwrap();

        let summary = service
            .fetch_remote_stats_summary(RemoteStatsSummaryQuery {
                provider: Some("mock".to_string()),
                service: Some("openai".to_string()),
                country: Some("local".to_string()),
                operator: None,
                lookback_hours: Some(24),
            })
            .await
            .unwrap();

        assert_eq!(summary.items.len(), 1);
        assert_eq!(summary.items[0].provider, "mock");
        assert_eq!(summary.items[0].service, "openai");
        assert_eq!(summary.items[0].country, "local");
        assert_eq!(state.public_calls.lock().as_slice(), [""]);
        assert_eq!(*state.admin_calls.lock(), 0);

        server.abort();
    }

    #[tokio::test]
    async fn fetch_remote_stats_summary_rejects_non_snapshot_lookback() {
        let service = make_service();
        service
            .update_runtime_settings(RuntimeSettingsUpdate {
                routing_strategy: "ordered_priority".to_string(),
                auto_fallback: true,
                option_cache_enabled: true,
                option_cache_poll_interval_minutes: 30,
                only_show_openai_sms_countries: false,
                check_updates_on_launch: true,
                http_port: 7822,
                stats_sync_enabled: true,
                stats_sync_base_url: "http://127.0.0.1:1".to_string(),
                stats_sync_api_token: "summary-token".to_string(),
            })
            .unwrap();

        let error = service
            .fetch_remote_stats_summary(RemoteStatsSummaryQuery {
                provider: None,
                service: None,
                country: None,
                operator: None,
                lookback_hours: Some(12),
            })
            .await
            .unwrap_err();

        assert!(
            matches!(error, SmsError::InvalidRequest(message) if message.contains("24, 72, or 168"))
        );
    }

    #[tokio::test]
    async fn routing_replace_failovers_then_cancels_previous_ticket() {
        let service = make_service();
        service.save_routing_plan(routing_plan()).unwrap();

        let acquire = service
            .acquire_code(AcquireCodeRequest {
                provider: "auto".to_string(),
                service: None,
                country: None,
                max_price: None,
                min_price: None,
                auto_pick_country: None,
                reuse_phone: None,
                reuse_key: None,
                metadata: BTreeMap::new(),
                routing_plan_id: Some("openai-plan".to_string()),
                routing_plan_name: None,
            })
            .await
            .unwrap();

        let replacement = service
            .replace_routing_attempt(RoutingReplaceRequest {
                ticket_id: acquire.ticket_id.clone(),
                reason: Some("replace route after timeout".to_string()),
                failed_item_id: acquire.routing_item_id.clone(),
                release_action: crate::models::ReleaseAction::Cancel,
            })
            .await
            .unwrap();

        assert_eq!(replacement.current_ticket_id, acquire.ticket_id);
        assert_eq!(
            replacement.current_ticket_release.status,
            TicketStatus::Cancelled
        );
        assert_eq!(
            replacement.next_ticket.routing_item_id.as_deref(),
            Some("mock-second")
        );
        assert_ne!(replacement.next_ticket.ticket_id, acquire.ticket_id);

        let previous = service.ticket(&acquire.ticket_id).unwrap();
        assert_eq!(previous.status, TicketStatus::Cancelled);
        let next = service.ticket(&replacement.next_ticket.ticket_id).unwrap();
        assert_eq!(next.routing_item_id.as_deref(), Some("mock-second"));
    }

    #[tokio::test]
    async fn pending_cancel_retry_window_expiry_returns_ticket_to_waiting_code() {
        let service = make_service_with_provider_overrides(&[]);
        let ticket = TicketRecord {
            id: "ticket-expired".to_string(),
            provider: "herosms".to_string(),
            service: "telegram".to_string(),
            country: "US".to_string(),
            operator: None,
            phone_number: "79001234567".to_string(),
            upstream_id: Some("activation-1".to_string()),
            price: Some(0.06),
            status: TicketStatus::CancelPending,
            created_at: Utc::now() - Duration::seconds(120),
            updated_at: Utc::now() - Duration::seconds(30),
            acquire_path: AcquirePath::FreshAcquire,
            code: None,
            message: None,
            same_activation_retry_supported: false,
            same_activation_retry_expires_at: None,
            pending_release_action: Some(crate::models::ReleaseAction::Cancel),
            auto_release_at: Some(Utc::now() - Duration::seconds(20)),
            next_release_attempt_at: Some(Utc::now() - Duration::seconds(5)),
            release_retry_deadline_at: Some(Utc::now() - Duration::seconds(1)),
            release_retry_count: 1,
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
        };
        service.upsert_ticket(ticket);

        service.maybe_process_pending_releases().await;

        let updated = service.ticket("ticket-expired").unwrap();
        assert_eq!(updated.status, TicketStatus::WaitingCode);
        assert_eq!(updated.pending_release_action, None);
        assert_eq!(updated.auto_release_at, None);
        assert_eq!(updated.next_release_attempt_at, None);
        assert_eq!(updated.release_retry_deadline_at, None);
        assert_eq!(
            updated.message.as_deref(),
            Some("auto cancel retry window expired")
        );
        let activity = service.activity_feed();
        assert!(activity.items.iter().any(|entry| {
            entry.level == ActivityLevel::Error && entry.title.contains("自动取消重试窗口已过期")
        }));
    }

    #[tokio::test]
    async fn pending_cancel_retry_limit_returns_ticket_to_waiting_code() {
        let service = make_service_with_provider_overrides(&[]);
        let now = Utc::now();
        let retry_limit = auto_release_retry_limit(30);
        let ticket = TicketRecord {
            id: "ticket-retry-limit".to_string(),
            provider: "herosms".to_string(),
            service: "telegram".to_string(),
            country: "US".to_string(),
            operator: None,
            phone_number: "79001234567".to_string(),
            upstream_id: Some("activation-2".to_string()),
            price: Some(0.06),
            status: TicketStatus::CancelPending,
            created_at: now - Duration::seconds(120),
            updated_at: now - Duration::seconds(30),
            acquire_path: AcquirePath::FreshAcquire,
            code: None,
            message: None,
            same_activation_retry_supported: false,
            same_activation_retry_expires_at: None,
            pending_release_action: Some(crate::models::ReleaseAction::Cancel),
            auto_release_at: Some(now - Duration::seconds(30)),
            next_release_attempt_at: Some(now - Duration::seconds(5)),
            release_retry_deadline_at: Some(now),
            release_retry_count: retry_limit,
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
        };
        service.upsert_ticket(ticket);

        service.maybe_process_pending_releases().await;

        let updated = service.ticket("ticket-retry-limit").unwrap();
        assert_eq!(updated.status, TicketStatus::WaitingCode);
        assert_eq!(updated.pending_release_action, None);
        assert_eq!(updated.auto_release_at, None);
        assert_eq!(updated.next_release_attempt_at, None);
        assert_eq!(updated.release_retry_deadline_at, None);
        assert_eq!(
            updated.message.as_deref(),
            Some("auto cancel retry window expired")
        );
        let activity = service.activity_feed();
        assert!(activity.items.iter().any(|entry| {
            entry.level == ActivityLevel::Error && entry.title.contains("自动取消重试窗口已过期")
        }));
    }

    #[test]
    fn sqlite_release_owner_lease_rejects_second_owner_before_expiry() {
        let base = std::env::temp_dir().join(format!("madao-runtime-store-{}", Uuid::now_v7()));
        fs::create_dir_all(&base).unwrap();
        let store = RuntimeStore::open(base.join("runtime.db")).unwrap();
        let now = Utc::now();
        let lease = ReleaseOwnerLease {
            owner_id: "owner-a".to_string(),
            expires_at: now + Duration::seconds(15),
        };
        assert!(store.acquire_release_owner(&lease, now).unwrap());
        let second = ReleaseOwnerLease {
            owner_id: "owner-b".to_string(),
            expires_at: now + Duration::seconds(15),
        };
        assert!(!store.acquire_release_owner(&second, now).unwrap());
    }

    #[test]
    fn sqlite_release_owner_lease_can_be_reclaimed_after_expiry() {
        let base = std::env::temp_dir().join(format!("madao-runtime-store-{}", Uuid::now_v7()));
        fs::create_dir_all(&base).unwrap();
        let store = RuntimeStore::open(base.join("runtime.db")).unwrap();
        let now = Utc::now();
        let expired = ReleaseOwnerLease {
            owner_id: "owner-a".to_string(),
            expires_at: now - Duration::seconds(1),
        };
        store.replace_release_owner(Some(&expired)).unwrap();
        let fresh = ReleaseOwnerLease {
            owner_id: "owner-b".to_string(),
            expires_at: now + Duration::seconds(15),
        };
        assert!(store.acquire_release_owner(&fresh, now).unwrap());
        let current = store.current_release_owner().unwrap().unwrap();
        assert_eq!(current.owner_id, "owner-b");
    }

    #[test]
    fn sqlite_v2_stats_event_schema_migrates_price_columns() {
        let base = std::env::temp_dir().join(format!("madao-runtime-store-{}", Uuid::now_v7()));
        fs::create_dir_all(&base).unwrap();
        let db_path = base.join("runtime.db");
        let conn = Connection::open(&db_path).unwrap();
        conn.execute_batch(
            "
            CREATE TABLE runtime_meta (
              key TEXT PRIMARY KEY,
              value_json TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            INSERT INTO runtime_meta (key, value_json, updated_at)
              VALUES ('schema_version', '2', '2026-01-01T00:00:00Z');
            CREATE TABLE tickets (
              id TEXT PRIMARY KEY,
              provider TEXT NOT NULL,
              service TEXT NOT NULL,
              country TEXT NOT NULL,
              operator TEXT,
              phone_number TEXT NOT NULL,
              upstream_id TEXT,
              price REAL,
              status TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              acquire_path TEXT NOT NULL,
              code TEXT,
              message TEXT,
              same_activation_retry_supported INTEGER NOT NULL,
              same_activation_retry_expires_at TEXT,
              pending_release_action TEXT,
              auto_release_at TEXT,
              next_release_attempt_at TEXT,
              release_retry_deadline_at TEXT,
              release_retry_count INTEGER NOT NULL,
              routing_plan_id TEXT,
              routing_plan_name TEXT,
              routing_item_id TEXT,
              routing_item_index INTEGER,
              routing_execution_mode TEXT,
              routing_execution_rounds INTEGER,
              routing_current_round INTEGER,
              routing_candidate_item_ids_json TEXT NOT NULL,
              routing_attempt_count INTEGER NOT NULL,
              reuse_count INTEGER NOT NULL
            );
            CREATE TABLE ticket_stats_events (
              id TEXT PRIMARY KEY,
              ticket_id TEXT NOT NULL,
              provider TEXT NOT NULL,
              service TEXT NOT NULL,
              country TEXT NOT NULL,
              operator TEXT,
              outcome TEXT NOT NULL,
              status TEXT NOT NULL,
              occurred_at TEXT NOT NULL,
              routing_plan_id TEXT,
              routing_item_id TEXT,
              message TEXT,
              synced_at TEXT
            );
            ",
        )
        .unwrap();
        drop(conn);

        let store = RuntimeStore::open(&db_path).unwrap();
        assert!(store.load_state().unwrap().ticket_stats_events.is_empty());

        let conn = Connection::open(&db_path).unwrap();
        let columns = conn
            .prepare("PRAGMA table_info(ticket_stats_events)")
            .unwrap()
            .query_map([], |row| row.get::<_, String>(1))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert!(columns.iter().any(|column| column == "price"));
        assert!(
            columns
                .iter()
                .any(|column| column == "receive_duration_secs")
        );
        let schema_version: String = conn
            .query_row(
                "SELECT value_json FROM runtime_meta WHERE key = 'schema_version'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(schema_version, "3");
    }
}
