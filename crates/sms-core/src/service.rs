use crate::error::SmsError;
use crate::models::{
    AcquireCodeRequest, AcquireCodeResponse, LogEntry, NotificationFeed, OptionCacheOverview,
    OptionCacheState, PollCodeRequest, PollCodeResponse, ProviderBalance, ProviderDynamicOptions,
    ProviderManifestList, ProviderManifestSaveResponse, ProviderOptionCacheEntry, ProviderPriceQuery,
    ProviderPriceResponse, ProviderReorderRequest, ProviderSummary, ReleaseCodeRequest,
    ReleaseCodeResponse, RuntimeSettings, RuntimeSettingsUpdate, RuntimeSnapshot, TicketRecord,
    TicketStatus,
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

pub struct SmsService {
    registry: Arc<RwLock<ProviderRegistry>>,
    tickets: RwLock<BTreeMap<String, TicketRecord>>,
    logs: RwLock<VecDeque<LogEntry>>,
    runtime_settings: RwLock<RuntimeSettings>,
    runtime_settings_path: Option<PathBuf>,
    provider_options_path: Option<PathBuf>,
    provider_option_cache: RwLock<ProviderOptionCacheStore>,
    log_buffer: usize,
}

impl SmsService {
    pub fn new(registry: ProviderRegistry, log_buffer: usize) -> Self {
        Self::with_persistence_paths(registry, log_buffer, None, None)
    }

    pub fn with_runtime_settings_path(
        registry: ProviderRegistry,
        log_buffer: usize,
        runtime_settings_path: Option<PathBuf>,
    ) -> Self {
        Self::with_persistence_paths(registry, log_buffer, runtime_settings_path, None)
    }

    pub fn with_persistence_paths(
        registry: ProviderRegistry,
        log_buffer: usize,
        runtime_settings_path: Option<PathBuf>,
        provider_options_path: Option<PathBuf>,
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

        Self {
            registry: Arc::new(RwLock::new(registry)),
            tickets: RwLock::new(BTreeMap::new()),
            logs: RwLock::new(VecDeque::with_capacity(log_buffer)),
            runtime_settings: RwLock::new(runtime_settings),
            runtime_settings_path,
            provider_options_path,
            provider_option_cache: RwLock::new(provider_option_cache),
            log_buffer,
        }
    }

    pub fn registry(&self) -> Arc<RwLock<ProviderRegistry>> {
        Arc::clone(&self.registry)
    }

    pub async fn acquire_code(&self, request: AcquireCodeRequest) -> Result<AcquireCodeResponse, SmsError> {
        if request.provider == "auto" {
            return self.acquire_code_auto(request).await;
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
        let ticket = provider
            .acquire(&self.translate_acquire_request(&request, cached_options.as_ref().map(|entry| &entry.options)))
            .await?;
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
        };
        self.log("system", "info", format!("ticket {} acquired by {}", ticket.id, ticket.provider));
        self.tickets.write().insert(ticket.id.clone(), ticket);
        Ok(response)
    }

    async fn acquire_code_auto(&self, request: AcquireCodeRequest) -> Result<AcquireCodeResponse, SmsError> {
        let candidates = {
            let registry = self.registry.read();
            registry
                .list_manifests_by_priority()
                .into_iter()
                .filter(|m| m.enabled && m.kind != plugin_sdk::ProviderKind::Mock)
                .map(|m| m.id.clone())
                .collect::<Vec<_>>()
        };
        if candidates.is_empty() {
            return Err(SmsError::InvalidRequest("no enabled providers available for auto-routing".into()));
        }
        let mut last_error = SmsError::InvalidRequest("no providers tried".into());
        for provider_id in candidates {
            let cached_options = self
                .provider_option_cache
                .read()
                .entries
                .get(&provider_id)
                .cloned();
            let provider = {
                let registry = self.registry.read();
                match registry.get(&provider_id) {
                    Ok(p) => p,
                    Err(_) => continue,
                }
            };
            let manifest = provider.manifest();
            if let Some(max) = request.max_price {
                if manifest.defaults.max_price > 0.0 && manifest.defaults.max_price < max {
                    continue;
                }
            }
            let mut routed = request.clone();
            routed.provider = provider_id.clone();
            let translated = self.translate_acquire_request(&routed, cached_options.as_ref().map(|entry| &entry.options));
            match provider.acquire(&translated).await {
                Ok(ticket) => {
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
                    };
                    self.log(
                        "router",
                        "info",
                        format!("auto-routed ticket {} → {}", ticket.id, provider_id),
                    );
                    self.tickets.write().insert(ticket.id.clone(), ticket);
                    return Ok(response);
                }
                Err(err) => {
                    self.log("router", "warn", format!("auto-route skipped {provider_id}: {err}"));
                    last_error = err;
                }
            }
        }
        Err(last_error)
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
        let response = provider.poll_code(&current).await?;
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
        let message = provider.release(&current, request.action.clone()).await?;
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

    pub async fn get_balance(&self, provider_id: &str) -> Result<ProviderBalance, SmsError> {
        let provider = {
            let registry = self.registry.read();
            registry.get(provider_id)?
        };
        provider.get_balance().await
    }

    pub async fn get_prices(&self, query: ProviderPriceQuery) -> Result<ProviderPriceResponse, SmsError> {
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
        let items = provider.get_prices(Some(&service)).await?;
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
        match self.refresh_provider_options(provider_id).await {
            Ok(options) => Ok(options),
            Err(error) => {
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
        let raw_options = provider.get_options().await?;
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::registry::ProviderRegistry;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn repo_root() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .canonicalize()
            .unwrap()
    }

    fn fixture_provider_dir() -> PathBuf {
        let base = std::env::temp_dir().join(format!(
            "madao-sms-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
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
}
