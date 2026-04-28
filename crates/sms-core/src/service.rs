use crate::error::SmsError;
use crate::models::{
    AcquireCodeRequest, AcquireCodeResponse, LogEntry, PollCodeRequest, PollCodeResponse, ProviderBalance,
    ProviderManifestList, ProviderPriceQuery, ProviderPriceResponse, ProviderSummary, ReleaseCodeRequest,
    ReleaseCodeResponse, RuntimeSnapshot, TicketRecord, TicketStatus,
};
use crate::registry::ProviderRegistry;
use chrono::Utc;
use parking_lot::RwLock;
use plugin_sdk::ProviderManifest;
use std::collections::{BTreeMap, VecDeque};
use std::sync::Arc;

pub struct SmsService {
    registry: Arc<RwLock<ProviderRegistry>>,
    tickets: RwLock<BTreeMap<String, TicketRecord>>,
    logs: RwLock<VecDeque<LogEntry>>,
    log_buffer: usize,
}

impl SmsService {
    pub fn new(registry: ProviderRegistry, log_buffer: usize) -> Self {
        Self {
            registry: Arc::new(RwLock::new(registry)),
            tickets: RwLock::new(BTreeMap::new()),
            logs: RwLock::new(VecDeque::with_capacity(log_buffer)),
            log_buffer,
        }
    }

    pub fn registry(&self) -> Arc<RwLock<ProviderRegistry>> {
        Arc::clone(&self.registry)
    }

    pub async fn acquire_code(&self, request: AcquireCodeRequest) -> Result<AcquireCodeResponse, SmsError> {
        let provider = {
            let registry = self.registry.read();
            registry.get(&request.provider)?
        };
        if !provider.manifest().enabled {
            return Err(SmsError::ProviderDisabled(request.provider));
        }
        let ticket = provider.acquire(&request).await?;
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
        let provider = {
            let registry = self.registry.read();
            registry.get(&query.provider)?
        };
        let service = provider.manifest().resolve_service_alias(query.service.as_deref());
        let items = provider.get_prices(Some(&service)).await?;
        Ok(ProviderPriceResponse {
            provider: query.provider,
            service,
            items,
        })
    }

    pub fn list_provider_manifests(&self) -> ProviderManifestList {
        let manifests = self.registry.read().list_manifests();
        ProviderManifestList { manifests }
    }

    pub fn provider_manifest(&self, provider_id: &str) -> Result<ProviderManifest, SmsError> {
        self.registry.read().manifest(provider_id)
    }

    pub fn save_provider_manifest(
        &self,
        provider_id: &str,
        manifest: ProviderManifest,
    ) -> Result<ProviderManifest, SmsError> {
        let saved = self.registry.write().save_manifest(provider_id, manifest)?;
        self.log(
            "config",
            "info",
            format!("provider manifest `{provider_id}` saved and reloaded"),
        );
        Ok(saved)
    }

    pub fn reload_provider_registry(&self) -> Result<ProviderManifestList, SmsError> {
        self.registry.write().reload()?;
        self.log("config", "info", "provider registry reloaded");
        Ok(self.list_provider_manifests())
    }

    pub fn runtime_snapshot(&self) -> RuntimeSnapshot {
        let registry = self.registry.read();
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
            })
            .collect();
        let tickets = self.tickets.read().values().cloned().collect();
        let logs = self.logs.read().iter().cloned().collect();
        RuntimeSnapshot { providers, tickets, logs }
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

    #[test]
    fn manifest_can_be_saved_and_reloaded() {
        let service = make_service();
        let mut manifest = service.provider_manifest("mock").unwrap();
        manifest.description = Some("updated manifest".to_string());
        let saved = service.save_provider_manifest("mock", manifest).unwrap();
        assert_eq!(saved.description.as_deref(), Some("updated manifest"));
        let reloaded = service.provider_manifest("mock").unwrap();
        assert_eq!(reloaded.description.as_deref(), Some("updated manifest"));
    }

    #[test]
    fn invalid_manifest_save_rolls_back_previous_content() {
        let service = make_service();
        let before = service.provider_manifest("herosms").unwrap();
        let mut broken = before.clone();
        broken.handler_api = None;

        let result = service.save_provider_manifest("herosms", broken);
        assert!(result.is_err());

        let after = service.provider_manifest("herosms").unwrap();
        assert_eq!(after.handler_api.as_ref().map(|cfg| cfg.base_url.clone()), before.handler_api.as_ref().map(|cfg| cfg.base_url.clone()));
    }
}
