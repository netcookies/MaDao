use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProviderKind {
    HandlerApi,
    FiveSim,
    Mock,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderManifest {
    pub id: String,
    pub name: String,
    pub kind: ProviderKind,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_priority")]
    pub priority: u32,
    #[serde(default)]
    pub homepage: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub service_aliases: BTreeMap<String, String>,
    #[serde(default)]
    pub defaults: ProviderDefaults,
    #[serde(default)]
    pub ui: ProviderUiConfig,
    #[serde(default)]
    pub behavior: ProviderBehaviorConfig,
    #[serde(default)]
    pub handler_api: Option<HandlerApiConfig>,
    #[serde(default)]
    pub five_sim: Option<FiveSimConfig>,
    #[serde(default)]
    pub mock: Option<MockConfig>,
}

impl ProviderManifest {
    pub fn resolve_service_alias(&self, requested: Option<&str>) -> String {
        let raw = requested
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or(self.defaults.service.as_str());
        let lowered = raw.to_ascii_lowercase();
        self.service_aliases
            .get(&lowered)
            .cloned()
            .unwrap_or_else(|| raw.to_string())
    }

    pub fn resolved_country_hint(&self, requested: Option<&str>) -> String {
        requested
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| self.defaults.country.clone())
    }

    pub fn protocol_name(&self) -> &'static str {
        match self.kind {
            ProviderKind::HandlerApi => "handler_api",
            ProviderKind::FiveSim => "five_sim",
            ProviderKind::Mock => "mock",
        }
    }

    pub fn primary_endpoint(&self) -> Option<String> {
        match self.kind {
            ProviderKind::HandlerApi => self
                .handler_api
                .as_ref()
                .map(|config| config.base_url.clone()),
            ProviderKind::FiveSim => self.five_sim.as_ref().map(|config| config.base_url.clone()),
            ProviderKind::Mock => None,
        }
    }

    pub fn has_configured_api_key(&self) -> bool {
        match self.kind {
            ProviderKind::HandlerApi => self
                .handler_api
                .as_ref()
                .map(|config| !config.api_key.trim().is_empty())
                .unwrap_or(false),
            ProviderKind::FiveSim => self
                .five_sim
                .as_ref()
                .map(|config| !config.api_key.trim().is_empty())
                .unwrap_or(false),
            ProviderKind::Mock => true,
        }
    }

    pub fn protocol_display_name(&self) -> String {
        self.ui
            .protocol_label
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| match self.kind {
                ProviderKind::HandlerApi => "Handler API".to_string(),
                ProviderKind::FiveSim => "FiveSim".to_string(),
                ProviderKind::Mock => "Mock".to_string(),
            })
    }

    pub fn provider_badge_label(&self) -> String {
        self.ui
            .badge_label
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| {
                self.name
                    .chars()
                    .find(|value| !value.is_whitespace())
                    .map(|value| value.to_ascii_uppercase().to_string())
                    .unwrap_or_else(|| "?".to_string())
            })
    }

    pub fn provider_icon_url(&self) -> Option<String> {
        self.ui
            .icon_url
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
    }

    pub fn handler_api_profile(&self) -> &str {
        self.handler_api
            .as_ref()
            .map(|config| config.profile.as_str())
            .filter(|value| !value.trim().is_empty())
            .unwrap_or("standard")
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderDefaults {
    #[serde(default = "default_service")]
    pub service: String,
    #[serde(default = "default_country")]
    pub country: String,
    #[serde(default)]
    pub auto_pick_country: bool,
    #[serde(default)]
    pub verify_on_register: bool,
    #[serde(default = "default_reuse_phone")]
    pub reuse_phone: bool,
    #[serde(default)]
    pub max_price: f64,
    #[serde(default)]
    pub min_price: f64,
    #[serde(default)]
    pub min_balance: f64,
    #[serde(default = "default_max_tries")]
    pub max_tries: u32,
    #[serde(default = "default_poll_timeout")]
    pub poll_timeout_sec: u64,
    #[serde(default = "default_reuse_max")]
    pub reuse_max: u32,
}

impl Default for ProviderDefaults {
    fn default() -> Self {
        Self {
            service: default_service(),
            country: default_country(),
            auto_pick_country: false,
            verify_on_register: false,
            reuse_phone: default_reuse_phone(),
            max_price: 0.0,
            min_price: 0.0,
            min_balance: 0.0,
            max_tries: default_max_tries(),
            poll_timeout_sec: default_poll_timeout(),
            reuse_max: default_reuse_max(),
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ProviderUiConfig {
    #[serde(default)]
    pub protocol_label: Option<String>,
    #[serde(default)]
    pub icon_url: Option<String>,
    #[serde(default)]
    pub badge_label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderBehaviorConfig {
    #[serde(default)]
    pub cancel_cooldown_sec: Option<u64>,
    #[serde(default = "default_true")]
    pub operator_selectable: bool,
}

impl Default for ProviderBehaviorConfig {
    fn default() -> Self {
        Self {
            cancel_cooldown_sec: None,
            operator_selectable: default_true(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HandlerApiConfig {
    pub base_url: String,
    #[serde(default = "default_handler_api_profile")]
    pub profile: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default = "default_get_balance_action")]
    pub get_balance_action: String,
    #[serde(default = "default_get_prices_action")]
    pub get_prices_action: String,
    #[serde(default = "default_get_countries_action")]
    pub get_countries_action: String,
    #[serde(default = "default_get_number_action")]
    pub get_number_action: String,
    #[serde(default = "default_get_status_action")]
    pub get_status_action: String,
    #[serde(default = "default_set_status_action")]
    pub set_status_action: String,
    #[serde(default = "default_status_ready")]
    pub status_ready: i32,
    #[serde(default = "default_status_retry")]
    pub status_retry: i32,
    #[serde(default = "default_status_finish")]
    pub status_finish: i32,
    #[serde(default = "default_status_cancel")]
    pub status_cancel: i32,
    #[serde(default = "default_balance_prefix")]
    pub balance_prefix: String,
    #[serde(default = "default_success_status_prefix")]
    pub success_status_prefix: String,
    #[serde(default = "default_wait_status_tokens")]
    pub wait_status_tokens: Vec<String>,
    #[serde(default = "default_failure_status_tokens")]
    pub failure_status_tokens: Vec<String>,
    #[serde(default = "default_id_json_pointers")]
    pub id_json_pointers: Vec<String>,
    #[serde(default = "default_phone_json_pointers")]
    pub phone_json_pointers: Vec<String>,
    #[serde(default = "default_price_json_pointers")]
    pub price_json_pointers: Vec<String>,
    #[serde(default = "default_balance_json_pointers")]
    pub balance_json_pointers: Vec<String>,
    #[serde(default = "default_code_json_pointers")]
    pub code_json_pointers: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FiveSimConfig {
    pub base_url: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default = "default_buy_operator")]
    pub buy_operator: String,
    #[serde(default = "default_profile_endpoint")]
    pub profile_endpoint: String,
    #[serde(default = "default_prices_endpoint")]
    pub prices_endpoint: String,
    #[serde(default = "default_products_endpoint")]
    pub products_endpoint: String,
    #[serde(default = "default_buy_endpoint_prefix")]
    pub buy_endpoint_prefix: String,
    #[serde(default = "default_check_endpoint_prefix")]
    pub check_endpoint_prefix: String,
    #[serde(default = "default_finish_action")]
    pub finish_action: String,
    #[serde(default = "default_cancel_action")]
    pub cancel_action: String,
    #[serde(default = "default_ban_action")]
    pub ban_action: String,
    #[serde(default = "default_balance_json_pointer")]
    pub balance_json_pointer: String,
    #[serde(default = "default_status_json_pointer")]
    pub status_json_pointer: String,
    #[serde(default = "default_code_json_pointers")]
    pub code_json_pointers: Vec<String>,
    #[serde(default = "default_five_sim_failure_statuses")]
    pub failure_statuses: Vec<String>,
    #[serde(default = "default_five_sim_id_json_pointers")]
    pub id_json_pointers: Vec<String>,
    #[serde(default = "default_five_sim_phone_json_pointers")]
    pub phone_json_pointers: Vec<String>,
    #[serde(default = "default_five_sim_price_json_pointers")]
    pub price_json_pointers: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MockConfig {
    #[serde(default = "default_mock_balance")]
    pub balance: f64,
    #[serde(default = "default_mock_phone")]
    pub phone_number: String,
    #[serde(default = "default_mock_codes")]
    pub codes: Vec<String>,
}

impl Default for MockConfig {
    fn default() -> Self {
        Self {
            balance: default_mock_balance(),
            phone_number: default_mock_phone(),
            codes: default_mock_codes(),
        }
    }
}

fn default_priority() -> u32 {
    100
}

fn default_service() -> String {
    "openai".to_string()
}

fn default_country() -> String {
    "any".to_string()
}

fn default_reuse_phone() -> bool {
    true
}

fn default_max_tries() -> u32 {
    3
}

fn default_poll_timeout() -> u64 {
    120
}

fn default_reuse_max() -> u32 {
    2
}

fn default_get_balance_action() -> String {
    "getBalance".to_string()
}

fn default_handler_api_profile() -> String {
    "standard".to_string()
}

fn default_get_prices_action() -> String {
    "getPrices".to_string()
}

fn default_get_countries_action() -> String {
    "getCountries".to_string()
}

fn default_get_number_action() -> String {
    "getNumber".to_string()
}

fn default_get_status_action() -> String {
    "getStatus".to_string()
}

fn default_set_status_action() -> String {
    "setStatus".to_string()
}

fn default_status_ready() -> i32 {
    1
}

fn default_status_retry() -> i32 {
    3
}

fn default_status_finish() -> i32 {
    6
}

fn default_status_cancel() -> i32 {
    8
}

fn default_balance_prefix() -> String {
    "ACCESS_BALANCE:".to_string()
}

fn default_success_status_prefix() -> String {
    "STATUS_OK:".to_string()
}

fn default_wait_status_tokens() -> Vec<String> {
    vec![
        "STATUS_WAIT_CODE".to_string(),
        "STATUS_WAIT_RETRY".to_string(),
        "STATUS_WAIT_RESEND".to_string(),
    ]
}

fn default_failure_status_tokens() -> Vec<String> {
    vec![
        "STATUS_CANCEL".to_string(),
        "BAD_STATUS".to_string(),
        "NO_ACTIVATION".to_string(),
    ]
}

fn default_id_json_pointers() -> Vec<String> {
    vec![
        "/activationId".to_string(),
        "/activation_id".to_string(),
        "/id".to_string(),
    ]
}

fn default_phone_json_pointers() -> Vec<String> {
    vec![
        "/phoneNumber".to_string(),
        "/phone".to_string(),
        "/number".to_string(),
    ]
}

fn default_price_json_pointers() -> Vec<String> {
    vec!["/activationCost".to_string(), "/price".to_string()]
}

fn default_balance_json_pointers() -> Vec<String> {
    vec![
        "/balance".to_string(),
        "/amount".to_string(),
        "/data/balance".to_string(),
        "/data/amount".to_string(),
    ]
}

fn default_code_json_pointers() -> Vec<String> {
    vec![
        "/sms/code".to_string(),
        "/code".to_string(),
        "/data/code".to_string(),
        "/sms/0/code".to_string(),
    ]
}

fn default_buy_operator() -> String {
    "any".to_string()
}

fn default_profile_endpoint() -> String {
    "user/profile".to_string()
}

fn default_prices_endpoint() -> String {
    "guest/prices".to_string()
}

fn default_products_endpoint() -> String {
    "guest/products".to_string()
}

fn default_buy_endpoint_prefix() -> String {
    "user/buy/activation".to_string()
}

fn default_check_endpoint_prefix() -> String {
    "user/check".to_string()
}

fn default_finish_action() -> String {
    "finish".to_string()
}

fn default_cancel_action() -> String {
    "cancel".to_string()
}

fn default_ban_action() -> String {
    "ban".to_string()
}

fn default_balance_json_pointer() -> String {
    "/balance".to_string()
}

fn default_status_json_pointer() -> String {
    "/status".to_string()
}

fn default_five_sim_failure_statuses() -> Vec<String> {
    vec![
        "CANCELED".to_string(),
        "BANNED".to_string(),
        "TIMEOUT".to_string(),
    ]
}

fn default_five_sim_id_json_pointers() -> Vec<String> {
    vec!["/id".to_string()]
}

fn default_five_sim_phone_json_pointers() -> Vec<String> {
    vec!["/phone".to_string()]
}

fn default_five_sim_price_json_pointers() -> Vec<String> {
    vec!["/price".to_string()]
}

fn default_mock_balance() -> f64 {
    999.0
}

fn default_mock_phone() -> String {
    "+15550001234".to_string()
}

fn default_mock_codes() -> Vec<String> {
    vec!["123456".to_string()]
}
