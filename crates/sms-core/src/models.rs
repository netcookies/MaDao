use chrono::{DateTime, Utc};
use plugin_sdk::ProviderManifest;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use uuid::Uuid;

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
