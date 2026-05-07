use crate::error::SmsError;
use crate::models::{
    AcquireCodeRequest, AcquireCodeResponse, LogEntry, NotificationFeed, OptionCacheOverview,
    OptionCacheState, PollCodeRequest, PollCodeResponse, ProviderBalance, ProviderDynamicOptions,
    ProviderManifestList, ProviderManifestSaveResponse, ProviderOptionCacheEntry, ProviderPriceQuery,
    ProviderPriceResponse, ProviderReorderRequest, ProviderSummary, ReleaseCodeRequest,
    ReleaseCodeResponse, RoutingExecutionMode, RoutingFailoverRequest, RoutingPlan, RoutingPlanItem,
    RoutingPlanList, RoutingPlanStore, RuntimeSettings, RuntimeSettingsUpdate, RuntimeSnapshot,
    TicketRecord, TicketStatus,
};
use crate::options::{
    build_cache_overview, cache_state, load_option_cache_store, normalize_price_items,
    normalize_provider_options, resolve_provider_value, save_option_cache_store, with_cache_state,
    OptionKind, ProviderOptionCacheStore,
};
use crate::registry::ProviderRegistry;
use chrono::Utc;
use parking_lot::RwLock;
use plugin_sdk::ProviderManifest;
use std::collections::{BTreeMap, VecDeque};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use uuid::Uuid;

const ROUTING_PLANS_FILE_NAME: &str = "routing-plans.json";

pub struct SmsService {
    registry: Arc<RwLock<ProviderRegistry>>,
    tickets: RwLock<BTreeMap<String, TicketRecord>>,
    logs: RwLock<VecDeque<LogEntry>>,
    runtime_settings: RwLock<RuntimeSettings>,
    runtime_settings_path: Option<PathBuf>,
    provider_options_path: Option<PathBuf>,
    routing_plans_path: Option<PathBuf>,
    routing_plans: RwLock<RoutingPlanStore>,
    provider_option_cache: RwLock<ProviderOptionCacheStore>,
    log_buffer: usize,
}

impl SmsService {
    pub fn new(registry: ProviderRegistry, log_buffer: usize) -> Self {
        Self::with_persistence_paths(registry, log_buffer, None, None, None)
    }

    pub fn with_runtime_settings_path(
        registry: ProviderRegistry,
        log_buffer: usize,
        runtime_settings_path: Option<PathBuf>,
    ) -> Self {
        Self::with_persistence_paths(registry, log_buffer, runtime_settings_path, None, None)
    }

    pub fn with_persistence_paths(
        registry: ProviderRegistry,
        log_buffer: usize,
        runtime_settings_path: Option<PathBuf>,
        provider_options_path: Option<PathBuf>,
        routing_plans_path: Option<PathBuf>,
    ) -> Self {
        let runtime_settings = runtime_settings_path
            .as_ref()
            .and_then(|path| load_runtime_settings(path).ok())
            .unwrap_or(RuntimeSettings {
                routing_strategy: "ordered_priority".to_string(),
                auto_fallback: true,
                option_cache_enabled: true,
                option_cache_poll_interval_minutes: 30,
            });
        let provider_option_cache = provider_options_path
            .as_ref()
            .and_then(|path| load_option_cache_store(path).ok())
            .unwrap_or_default();
        let routing_plans_path = routing_plans_path.or_else(|| {
            runtime_settings_path
                .as_ref()
                .and_then(|path| path.parent().map(|parent| parent.join(ROUTING_PLANS_FILE_NAME)))
        });
        let routing_plans = routing_plans_path
            .as_ref()
            .and_then(|path| load_routing_plans(path).ok())
            .unwrap_or_default();

        Self {
            registry: Arc::new(RwLock::new(registry)),
            tickets: RwLock::new(BTreeMap::new()),
            logs: RwLock::new(VecDeque::with_capacity(log_buffer)),
            runtime_settings: RwLock::new(runtime_settings),
            runtime_settings_path,
            provider_options_path,
            routing_plans_path,
            routing_plans: RwLock::new(routing_plans),
            provider_option_cache: RwLock::new(provider_option_cache),
            log_buffer,
        }
    }

    pub fn registry(&self) -> Arc<RwLock<ProviderRegistry>> {
        Arc::clone(&self.registry)
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
            if status.starts_with('2') { "info" } else { "warn" },
            format!("{action} -> {status} {details}"),
        );
    }

    pub async fn acquire_code(&self, request: AcquireCodeRequest) -> Result<AcquireCodeResponse, SmsError> {
        if request.routing_plan_id.is_some() || request.routing_plan_name.is_some() {
            return self.acquire_code_by_routing_plan(request).await;
        }
        if request.provider == "auto" {
            return Err(SmsError::InvalidRequest(
                "routing_plan_id is required when provider is auto".to_string(),
            ));
        }
        let cached_options = self
            .provider_option_cache
            .read()
            .entries
            .get(&request.provider)
            .cloned();
        let provider = {
            let registry = self.registry.read();
            registry.get(&request.provider)?
        };
        if !provider.manifest().enabled {
            return Err(SmsError::ProviderDisabled(request.provider));
        }
        self.log_upstream_request(
            &request.provider,
            "acquire",
            format!(
                "service={} country={}",
                request.service.clone().unwrap_or_default(),
                request.country.clone().unwrap_or_default()
            ),
        );
        let ticket = match provider
            .acquire(&self.translate_acquire_request(&request, cached_options.as_ref().map(|entry| &entry.options)))
            .await
        {
            Ok(ticket) => {
                self.log_upstream_response(&request.provider, "acquire", "200", "ticket acquired");
                ticket
            }
            Err(error) => {
                self.log_upstream_response(&request.provider, "acquire", "error", error.to_string());
                return Err(error);
            }
        };
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
            routing_plan_id: ticket.routing_plan_id.clone(),
            routing_plan_name: ticket.routing_plan_name.clone(),
            routing_item_id: ticket.routing_item_id.clone(),
            routing_item_index: ticket.routing_item_index,
        };
        self.log("system", "info", format!("ticket {} acquired by {}", ticket.id, ticket.provider));
        self.tickets.write().insert(ticket.id.clone(), ticket);
        Ok(response)
    }

    async fn acquire_code_by_routing_plan(&self, request: AcquireCodeRequest) -> Result<AcquireCodeResponse, SmsError> {
        let plan = self.resolve_routing_plan(&request)?;
        let item_order = self.routing_item_order(&plan);
        if item_order.is_empty() {
            return Err(SmsError::InvalidRequest(format!(
                "routing plan `{}` has no enabled items",
                plan.name
            )));
        }
        let candidate_item_ids = item_order
            .iter()
            .map(|item| item.id.clone())
            .collect::<Vec<_>>();

        let mut last_error = SmsError::InvalidRequest("no routing plan items tried".into());
        for (attempt_index, item) in item_order.iter().enumerate() {
            let response = self
                .try_acquire_from_routing_item(&request, &plan, item, attempt_index, &candidate_item_ids)
                .await;
            match response {
                Ok(ticket) => return Ok(ticket),
                Err(error) => {
                    self.log(
                        "router",
                        "warn",
                        format!("routing plan {} skipped {}: {}", plan.id, item.id, error),
                    );
                    last_error = error;
                }
            }
        }
        Err(last_error)
    }

    async fn try_acquire_from_routing_item(
        &self,
        request: &AcquireCodeRequest,
        plan: &RoutingPlan,
        item: &RoutingPlanItem,
        attempt_index: usize,
        candidate_item_ids: &[String],
    ) -> Result<AcquireCodeResponse, SmsError> {
        let cached_options = self
            .provider_option_cache
            .read()
            .entries
            .get(&item.provider)
            .cloned();
        let provider = {
            let registry = self.registry.read();
            registry.get(&item.provider)?
        };
        if !provider.manifest().enabled {
            return Err(SmsError::ProviderDisabled(item.provider.clone()));
        }

        let mut routed = request.clone();
        routed.provider = item.provider.clone();
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

        let translated = self.translate_acquire_request(
            &routed,
            cached_options.as_ref().map(|entry| &entry.options),
        );
        self.log_upstream_request(
            &item.provider,
            "acquire",
            format!(
                "service={} country={}",
                translated.service.clone().unwrap_or_default(),
                translated.country.clone().unwrap_or_default()
            ),
        );
        let mut ticket = match provider.acquire(&translated).await {
            Ok(ticket) => {
                self.log_upstream_response(&item.provider, "acquire", "200", "ticket acquired");
                ticket
            }
            Err(error) => {
                self.log_upstream_response(&item.provider, "acquire", "error", error.to_string());
                return Err(error);
            }
        };
        ticket.routing_plan_id = Some(plan.id.clone());
        ticket.routing_plan_name = Some(plan.name.clone());
        ticket.routing_item_id = Some(item.id.clone());
        ticket.routing_item_index = Some(attempt_index);
        ticket.routing_execution_mode = Some(plan.execution_mode);
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
            routing_plan_id: ticket.routing_plan_id.clone(),
            routing_plan_name: ticket.routing_plan_name.clone(),
            routing_item_id: ticket.routing_item_id.clone(),
            routing_item_index: ticket.routing_item_index,
        };
        self.log(
            "router",
            "info",
            format!("routing plan {} matched item {} -> {}", plan.id, item.id, ticket.provider),
        );
        self.tickets.write().insert(ticket.id.clone(), ticket);
        Ok(response)
    }

    pub async fn poll_code(&self, request: PollCodeRequest) -> Result<PollCodeResponse, SmsError> {
        let current = self
            .tickets
            .read()
            .get(&request.ticket_id)
            .cloned()
            .ok_or_else(|| SmsError::InvalidRequest(format!("unknown ticket {}", request.ticket_id)))?;
        let provider = {
            let registry = self.registry.read();
            registry.get(&current.provider)?
        };
        self.log_upstream_request(&current.provider, "poll", format!("ticket_id={}", current.id));
        let response = match provider.poll_code(&current).await {
            Ok(response) => {
                self.log_upstream_response(&current.provider, "poll", "200", format!("status={:?}", response.status));
                response
            }
            Err(error) => {
                self.log_upstream_response(&current.provider, "poll", "error", error.to_string());
                return Err(error);
            }
        };
        self.tickets.write().entry(current.id.clone()).and_modify(|ticket| {
            ticket.updated_at = Utc::now();
            ticket.status = response.status.clone();
            if response.code.is_some() {
                ticket.code = response.code.clone();
            }
            if response.message.is_some() {
                ticket.message = response.message.clone();
            }
        });
        Ok(response)
    }

    pub async fn release_code(&self, request: ReleaseCodeRequest) -> Result<ReleaseCodeResponse, SmsError> {
        let current = self
            .tickets
            .read()
            .get(&request.ticket_id)
            .cloned()
            .ok_or_else(|| SmsError::InvalidRequest(format!("unknown ticket {}", request.ticket_id)))?;
        let provider = {
            let registry = self.registry.read();
            registry.get(&current.provider)?
        };
        self.log_upstream_request(&current.provider, "release", format!("ticket_id={}", current.id));
        let message = match provider.release(&current, request.action.clone()).await {
            Ok(message) => {
                self.log_upstream_response(&current.provider, "release", "200", message.clone());
                message
            }
            Err(error) => {
                self.log_upstream_response(&current.provider, "release", "error", error.to_string());
                return Err(error);
            }
        };
        let next_status = match request.action {
            crate::models::ReleaseAction::Finish => TicketStatus::Finished,
            crate::models::ReleaseAction::Cancel | crate::models::ReleaseAction::Ban => TicketStatus::Cancelled,
            crate::models::ReleaseAction::Retry => TicketStatus::WaitingCode,
        };
        self.tickets.write().entry(current.id.clone()).and_modify(|ticket| {
            ticket.updated_at = Utc::now();
            ticket.status = next_status.clone();
            ticket.message = Some(message.clone());
        });
        Ok(ReleaseCodeResponse {
            ticket_id: current.id,
            provider: current.provider,
            status: next_status,
            message: Some(message),
        })
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
            .ok_or_else(|| SmsError::InvalidRequest(format!("unknown ticket {}", request.ticket_id)))?;
        let plan_id = current
            .routing_plan_id
            .clone()
            .ok_or_else(|| SmsError::InvalidRequest("ticket is not associated with a routing plan".to_string()))?;
        let plan = self
            .routing_plans
            .read()
            .plans
            .iter()
            .find(|plan| plan.id == plan_id)
            .cloned()
            .ok_or_else(|| SmsError::InvalidRequest(format!("routing plan `{plan_id}` not found")))?;

        let current_item_id = request
            .failed_item_id
            .clone()
            .or(current.routing_item_id.clone());
        let candidates = self.routing_item_order_for_ticket(&plan, &current);
        let start_index = current_item_id
            .as_ref()
            .and_then(|item_id| candidates.iter().position(|item| &item.id == item_id))
            .map(|index| index + 1)
            .unwrap_or(0);
        let candidate_item_ids = candidates.iter().map(|item| item.id.clone()).collect::<Vec<_>>();

        if let Some(reason) = request.reason.as_ref() {
            self.log(
                "router",
                "warn",
                format!("routing failover for ticket {}: {}", request.ticket_id, reason),
            );
        }

        let mut last_error = SmsError::InvalidRequest(format!(
            "routing plan `{}` has no remaining candidate items",
            plan.name
        ));
        for (attempt_index, item) in candidates.iter().enumerate().skip(start_index) {
            let mut acquire_request = AcquireCodeRequest {
                provider: item.provider.clone(),
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
                .try_acquire_from_routing_item(&acquire_request, &plan, item, attempt_index, &candidate_item_ids)
                .await;
            match response {
                Ok(response) => return Ok(response),
                Err(error) => {
                    self.log(
                        "router",
                        "warn",
                        format!(
                            "routing failover skipped {} for ticket {}: {}",
                            item.id, request.ticket_id, error
                        ),
                    );
                    last_error = error;
                }
            }
        }
        Err(last_error)
    }

    pub async fn get_balance(&self, provider_id: &str) -> Result<ProviderBalance, SmsError> {
        self.log_upstream_request(provider_id, "get_balance", "");
        let provider = {
            let registry = self.registry.read();
            registry.get(provider_id)?
        };
        match provider.get_balance().await {
            Ok(balance) => {
                self.log_upstream_response(
                    provider_id,
                    "get_balance",
                    "200",
                    format!("amount={:.2} {}", balance.amount, balance.currency),
                );
                Ok(balance)
            }
            Err(error) => {
                self.log_upstream_response(provider_id, "get_balance", "error", error.to_string());
                Err(error)
            }
        }
    }

    pub async fn get_prices(&self, query: ProviderPriceQuery) -> Result<ProviderPriceResponse, SmsError> {
        self.log_upstream_request(
            &query.provider,
            "get_prices",
            format!("service={}", query.service.clone().unwrap_or_default()),
        );
        let cached_options = self.provider_option_cache.read().entries.get(&query.provider).cloned();
        let provider = {
            let registry = self.registry.read();
            registry.get(&query.provider)?
        };
        let service = resolve_provider_value(
            cached_options.as_ref().map(|entry| &entry.options),
            OptionKind::Service,
            query.service.as_deref().unwrap_or(provider.manifest().defaults.service.as_str()),
        );
        let items = match provider.get_prices(Some(&service)).await {
            Ok(items) => {
                self.log_upstream_response(
                    &query.provider,
                    "get_prices",
                    "200",
                    format!("service={service} items={}", items.len()),
                );
                items
            }
            Err(error) => {
                self.log_upstream_response(&query.provider, "get_prices", "error", error.to_string());
                return Err(error);
            }
        };
        let normalized_items = normalize_price_items(
            cached_options.as_ref().map(|entry| &entry.options),
            items,
        );
        Ok(ProviderPriceResponse {
            provider: query.provider,
            service: provider.manifest().resolve_service_alias(Some(&service)),
            items: normalized_items,
        })
    }

    pub fn list_provider_manifests(&self) -> ProviderManifestList {
        let manifests = self.registry.read().list_manifests();
        ProviderManifestList { manifests }
    }

    pub async fn provider_dynamic_options(&self, provider_id: &str) -> Result<ProviderDynamicOptions, SmsError> {
        let settings = self.runtime_settings();
        let cached = self.provider_option_cache.read().entries.get(provider_id).cloned();
        if let Some(entry) = cached.clone() {
            let state = cache_state(Some(entry.fetched_at), &settings);
            if !settings.option_cache_enabled || state == OptionCacheState::Fresh {
                return Ok(with_cache_state(entry.options, &settings));
            }
        }
        self.log_upstream_request(provider_id, "get_options", "");
        match self.refresh_provider_options(provider_id).await {
            Ok(options) => Ok(options),
            Err(error) => {
                self.log_upstream_response(provider_id, "get_options", "error", error.to_string());
                if let Some(entry) = cached {
                    Ok(with_cache_state(entry.options, &settings))
                } else {
                    Err(error)
                }
            }
        }
    }

    pub async fn refresh_provider_options(&self, provider_id: &str) -> Result<ProviderDynamicOptions, SmsError> {
        let manifest = {
            let registry = self.registry.read();
            registry.manifest(provider_id)?
        };
        let provider = {
            let registry = self.registry.read();
            registry.get(provider_id)?
        };
        let raw_options = match provider.get_options().await {
            Ok(options) => {
                self.log_upstream_response(provider_id, "get_options", "200", "options refreshed");
                options
            }
            Err(error) => {
                self.log_upstream_response(provider_id, "get_options", "error", error.to_string());
                return Err(error);
            }
        };
        let fetched_at = Utc::now();
        let normalized = normalize_provider_options(&manifest, raw_options, fetched_at);
        let mut store = self.provider_option_cache.write();
        store.entries.insert(
            provider_id.to_string(),
            ProviderOptionCacheEntry {
                provider: provider_id.to_string(),
                fetched_at,
                options: normalized.clone(),
            },
        );
        if let Some(path) = &self.provider_options_path {
            let _ = save_option_cache_store(path, &store);
        }
        Ok(with_cache_state(normalized, &self.runtime_settings()))
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
        let (option_cache_state, option_cache_fetched_at, cache_refresh_error) = match cache_refresh {
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
        if plan.name.trim().is_empty() {
            return Err(SmsError::InvalidRequest("routing plan name is required".to_string()));
        }
        if plan.service.trim().is_empty() {
            return Err(SmsError::InvalidRequest("routing plan service is required".to_string()));
        }
        if plan.items.is_empty() {
            return Err(SmsError::InvalidRequest("routing plan must contain at least one item".to_string()));
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

        let mut store = self.routing_plans.write();
        if let Some(existing) = store.plans.iter_mut().find(|existing| existing.id == plan.id) {
            *existing = plan.clone();
        } else {
            store.plans.push(plan.clone());
        }
        if let Some(path) = &self.routing_plans_path {
            save_routing_plans(path, &store)?;
        }
        self.log("config", "info", format!("routing plan `{}` saved", plan.id));
        Ok(plan)
    }

    pub fn delete_routing_plan(&self, plan_id: &str) -> Result<RoutingPlanList, SmsError> {
        let mut store = self.routing_plans.write();
        let before = store.plans.len();
        store.plans.retain(|plan| plan.id != plan_id);
        if before == store.plans.len() {
            return Err(SmsError::InvalidRequest(format!("routing plan `{plan_id}` not found")));
        }
        if let Some(path) = &self.routing_plans_path {
            save_routing_plans(path, &store)?;
        }
        self.log("config", "info", format!("routing plan `{plan_id}` deleted"));
        Ok(RoutingPlanList {
            plans: store.plans.clone(),
        })
    }

    pub fn reorder_providers(&self, req: ProviderReorderRequest) -> Result<ProviderManifestList, SmsError> {
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
                .take(20)
                .cloned()
                .collect(),
        }
    }

    pub fn runtime_settings(&self) -> RuntimeSettings {
        self.runtime_settings.read().clone()
    }

    pub fn update_runtime_settings(&self, update: RuntimeSettingsUpdate) -> RuntimeSettings {
        let mut current = self.runtime_settings.write();
        current.routing_strategy = update.routing_strategy;
        current.auto_fallback = update.auto_fallback;
        current.option_cache_enabled = update.option_cache_enabled;
        current.option_cache_poll_interval_minutes = update.option_cache_poll_interval_minutes.max(1);
        if let Some(path) = &self.runtime_settings_path {
            let _ = save_runtime_settings(path, &current);
        }
        self.log("config", "info", "runtime routing settings updated");
        current.clone()
    }

    pub fn runtime_snapshot(&self) -> RuntimeSnapshot {
        let registry = self.registry.read();
        let settings = self.runtime_settings();
        let providers = registry
            .manifests()
            .map(|manifest| ProviderSummary {
                id: manifest.id.clone(),
                name: manifest.name.clone(),
                enabled: manifest.enabled,
                kind: format!("{:?}", manifest.kind).to_ascii_lowercase(),
                protocol: manifest.protocol_name().to_string(),
                primary_endpoint: manifest.primary_endpoint(),
                default_service: manifest.defaults.service.clone(),
                default_country: manifest.defaults.country.clone(),
                homepage: manifest.homepage.clone(),
                description: manifest.description.clone(),
                priority: manifest.priority,
                option_cache_state: self.provider_option_cache_state_with_settings(&manifest.id, &settings),
                option_cache_fetched_at: self.provider_option_cache_fetched_at(&manifest.id),
                can_enable: matches!(manifest.kind, plugin_sdk::ProviderKind::Mock)
                    || !settings.option_cache_enabled
                    || self.provider_option_cache_state_with_settings(&manifest.id, &settings) == OptionCacheState::Fresh,
            })
            .collect();
        let tickets = self.tickets.read().values().cloned().collect();
        let logs = self.logs.read().iter().cloned().collect();
        RuntimeSnapshot { providers, tickets, logs }
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
            match self.refresh_provider_options(&provider_id).await {
                Ok(_) => self.log("cache", "info", format!("provider option cache refreshed for `{provider_id}`")),
                Err(error) => self.log("cache", "warn", format!("provider option cache refresh failed for `{provider_id}`: {error}")),
            }
        }

        self.option_cache_overview()
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
        !settings.option_cache_enabled || self.provider_option_cache_state_with_settings(provider_id, &settings) == OptionCacheState::Fresh
    }

    fn resolve_routing_plan(&self, request: &AcquireCodeRequest) -> Result<RoutingPlan, SmsError> {
        let store = self.routing_plans.read();
        if let Some(plan_id) = request.routing_plan_id.as_ref() {
            return store
                .plans
                .iter()
                .find(|plan| &plan.id == plan_id)
                .cloned()
                .ok_or_else(|| SmsError::InvalidRequest(format!("routing plan `{plan_id}` not found")))
                .and_then(ensure_routing_plan_enabled);
        }
        if let Some(plan_name) = request.routing_plan_name.as_ref() {
            return store
                .plans
                .iter()
                .find(|plan| plan.name == *plan_name)
                .cloned()
                .ok_or_else(|| SmsError::InvalidRequest(format!("routing plan `{plan_name}` not found")))
                .and_then(ensure_routing_plan_enabled);
        }
        Err(SmsError::InvalidRequest(
            "routing plan id or name is required".to_string(),
        ))
    }

    fn routing_item_order<'a>(&self, plan: &'a RoutingPlan) -> Vec<&'a RoutingPlanItem> {
        let mut items = plan
            .items
            .iter()
            .filter(|item| item.enabled)
            .collect::<Vec<_>>();
        if plan.execution_mode == RoutingExecutionMode::Random {
            items.sort_by(|left, right| left.id.cmp(&right.id));
            if !items.is_empty() {
                let rotate_by = (Utc::now().timestamp_subsec_nanos() as usize) % items.len();
                items.rotate_left(rotate_by);
            }
        }
        items
    }

    fn routing_item_order_for_ticket<'a>(&self, plan: &'a RoutingPlan, ticket: &TicketRecord) -> Vec<&'a RoutingPlanItem> {
        if ticket.routing_candidate_item_ids.is_empty() {
            return self.routing_item_order(plan);
        }

        let mut ordered = Vec::new();
        for item_id in &ticket.routing_candidate_item_ids {
            if let Some(item) = plan.items.iter().find(|item| item.enabled && &item.id == item_id) {
                ordered.push(item);
            }
        }

        for item in plan.items.iter().filter(|item| item.enabled) {
            if !ordered.iter().any(|existing| existing.id == item.id) {
                ordered.push(item);
            }
        }
        ordered
    }

    fn translate_acquire_request(
        &self,
        request: &AcquireCodeRequest,
        options: Option<&ProviderDynamicOptions>,
    ) -> AcquireCodeRequest {
        let mut translated = request.clone();
        if let Some(service) = translated.service.as_ref() {
            translated.service = Some(resolve_provider_value(options, OptionKind::Service, service));
        }
        if let Some(country) = translated.country.as_ref() {
            translated.country = Some(resolve_provider_value(options, OptionKind::Country, country));
        }
        if let Some(operator) = translated.metadata.get("operator").cloned() {
            let resolved = resolve_provider_value(options, OptionKind::Operator, &operator);
            translated.metadata.insert("operator".to_string(), resolved);
        }
        translated
    }

    pub fn log(&self, scope: impl Into<String>, level: impl Into<String>, message: impl Into<String>) {
        let mut logs = self.logs.write();
        logs.push_back(LogEntry {
            timestamp: Utc::now(),
            scope: scope.into(),
            level: level.into(),
            message: message.into(),
        });
        while logs.len() > self.log_buffer {
            logs.pop_front();
        }
    }
}

fn load_runtime_settings(path: &Path) -> Result<RuntimeSettings, SmsError> {
    let content = fs::read_to_string(path)
        .map_err(|err| SmsError::Io(format!("read runtime settings failed: {err}")))?;
    serde_json::from_str(&content)
        .map_err(|err| SmsError::Config(format!("parse runtime settings failed: {err}")))
}

fn save_runtime_settings(path: &Path, settings: &RuntimeSettings) -> Result<(), SmsError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| SmsError::Io(format!("create runtime settings dir failed: {err}")))?;
    }
    let content = serde_json::to_string_pretty(settings)
        .map_err(|err| SmsError::Config(format!("serialize runtime settings failed: {err}")))?;
    fs::write(path, content)
        .map_err(|err| SmsError::Io(format!("write runtime settings failed: {err}")))
}

fn load_routing_plans(path: &Path) -> Result<RoutingPlanStore, SmsError> {
    if !path.exists() {
        return Ok(RoutingPlanStore::default());
    }
    let content = fs::read_to_string(path)
        .map_err(|err| SmsError::Io(format!("read routing plans failed: {err}")))?;
    serde_json::from_str(&content)
        .map_err(|err| SmsError::Config(format!("parse routing plans failed: {err}")))
}

fn save_routing_plans(path: &Path, store: &RoutingPlanStore) -> Result<(), SmsError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| SmsError::Io(format!("create routing plans dir failed: {err}")))?;
    }
    let content = serde_json::to_string_pretty(store)
        .map_err(|err| SmsError::Config(format!("serialize routing plans failed: {err}")))?;
    fs::write(path, content)
        .map_err(|err| SmsError::Io(format!("write routing plans failed: {err}")))
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::registry::ProviderRegistry;
    use crate::models::{RoutingExecutionMode, RoutingFailoverRequest, RoutingPlan, RoutingPlanItem, RoutingPriceMode};
    use std::fs;
    use std::path::PathBuf;
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

    fn routing_plan() -> RoutingPlan {
        RoutingPlan {
            id: "openai-plan".to_string(),
            name: "OpenAI Plan".to_string(),
            service: "openai".to_string(),
            description: Some("test routing plan".to_string()),
            enabled: true,
            execution_mode: RoutingExecutionMode::Sequential,
            items: vec![
                RoutingPlanItem {
                    id: "mock-first".to_string(),
                    provider: "mock".to_string(),
                    country: "usa".to_string(),
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
                    country: "canada".to_string(),
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
    async fn manifest_can_be_saved_and_reloaded() {
        let service = make_service();
        let mut manifest = service.provider_manifest("mock").unwrap();
        service.refresh_provider_options("mock").await.unwrap();
        manifest.description = Some("updated manifest".to_string());
        let saved = service.save_provider_manifest("mock", manifest).await.unwrap();
        assert_eq!(saved.manifest.description.as_deref(), Some("updated manifest"));
        let reloaded = service.provider_manifest("mock").unwrap();
        assert_eq!(reloaded.description.as_deref(), Some("updated manifest"));
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
        assert_eq!(after.handler_api.as_ref().map(|cfg| cfg.base_url.clone()), before.handler_api.as_ref().map(|cfg| cfg.base_url.clone()));
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
    async fn auto_provider_without_routing_plan_is_rejected() {
        let service = make_service();

        let error = service
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
            .unwrap_err();

        assert!(error.to_string().contains("routing_plan_id is required"));
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
        assert_eq!(failover.country, "canada");

        let logs = service.runtime_snapshot().logs;
        assert!(logs.iter().any(|entry| entry.scope == "upstream:mock" && entry.message.contains("acquire service=openai country=canada")));
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
        let current_ticket = service.tickets.read().get(&acquire.ticket_id).cloned().unwrap();
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

        assert_eq!(failover.routing_item_id.as_deref(), Some(candidate_ids[1].as_str()));
    }

    #[tokio::test]
    async fn upstream_actions_are_written_to_logs() {
        let service = make_service();
        let _ = service.get_balance("mock").await.unwrap();
        let _ = service
            .get_prices(ProviderPriceQuery {
                provider: "mock".to_string(),
                service: Some("openai".to_string()),
            })
            .await
            .unwrap();

        let logs = service.runtime_snapshot().logs;
        assert!(logs.iter().any(|entry| entry.scope == "upstream:mock" && entry.message.contains("get_balance")));
        assert!(logs.iter().any(|entry| entry.scope == "upstream:mock" && entry.message.contains("get_prices")));
    }

    #[test]
    fn notification_feed_returns_latest_entries_first() {
        let service = make_service();
        service.log("system", "info", "entry-1");
        service.log("system", "info", "entry-2");
        service.log("system", "info", "entry-3");

        let feed = service.notification_feed();

        assert_eq!(feed.items.first().map(|entry| entry.message.as_str()), Some("entry-3"));
        assert_eq!(feed.items.get(1).map(|entry| entry.message.as_str()), Some("entry-2"));
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
                phone_number: "+10000000000".to_string(),
                status: TicketStatus::Cancelled,
                created_at: Utc::now(),
                updated_at: Utc::now(),
                price: None,
                code: None,
                message: None,
                upstream_id: None,
                routing_plan_id: Some("openai-plan".to_string()),
                routing_plan_name: Some("OpenAI Plan".to_string()),
                routing_item_id: Some("mock-first".to_string()),
                routing_item_index: Some(0),
                routing_execution_mode: Some(RoutingExecutionMode::Sequential),
                routing_candidate_item_ids: vec!["mock-first".to_string(), "mock-second".to_string()],
                routing_attempt_count: 1,
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

        assert!(error.to_string().contains("provider `missing-provider` not found"));
        let logs = service.runtime_snapshot().logs;
        assert!(logs.iter().any(|entry| entry.scope == "router" && entry.message.contains("routing failover skipped mock-second")));
    }
}
