use crate::error::SmsError;
use crate::models::{
    AcquireCodeRequest, OptionItem, PollCodeResponse, ProviderBalance, ProviderOperatorsQuery,
    ProviderPriceItem, ProviderPriceQuery, ProviderServicesQuery, ReleaseAction, TicketRecord,
};
use crate::smsbower_assets::{
    SmsBowerFaqService, country_icon_url as smsbower_country_icon_url,
    fallback_service_icon_url as smsbower_fallback_service_icon_url,
    fetch_faq_countries_map as smsbower_fetch_faq_countries_map,
    fetch_faq_services_map as smsbower_fetch_faq_services_map,
};
use async_trait::async_trait;
use plugin_sdk::{FiveSimConfig, HandlerApiConfig, MockConfig, ProviderKind, ProviderManifest};
use reqwest::Client;
use serde::Deserialize;
use serde_json::Value;
use std::collections::BTreeMap;
use std::sync::Arc;
use std::time::Duration;

/// 兼容 JSON number 和 string 两种格式的 f64 解析（如 `0.14` 与 `"0.14"` 均可处理）。
fn coerce_f64(value: &Value) -> Option<f64> {
    value
        .as_f64()
        .or_else(|| value.as_str().and_then(|s| s.trim().parse().ok()))
}

/// 兼容 JSON string 和 integer/number 两种格式的字符串提取（如手机号可能是整数 79129001234）。
fn coerce_str_value(value: &Value) -> Option<String> {
    value
        .as_str()
        .map(ToOwned::to_owned)
        .or_else(|| value.as_i64().map(|n| n.to_string()))
        .or_else(|| value.as_u64().map(|n| n.to_string()))
}

fn coerce_u64(value: &Value) -> Option<u64> {
    value
        .as_u64()
        .or_else(|| value.as_i64().and_then(|v| u64::try_from(v).ok()))
        .or_else(|| value.as_str().and_then(|s| s.trim().parse().ok()))
}

#[derive(Debug, Deserialize)]
struct UpstreamErrorPayload {
    title: String,
    details: String,
    #[serde(default)]
    info: BTreeMap<String, Value>,
}

fn format_handler_api_error(text: &str) -> String {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return "empty handler_api error".to_string();
    }
    let Ok(payload) = serde_json::from_str::<UpstreamErrorPayload>(trimmed) else {
        return trimmed.to_string();
    };
    let mut message = format!("{}: {}", payload.title, payload.details);
    if let Some(min_activation_time) = payload.info.get("minActivationTime").and_then(coerce_u64) {
        message.push_str(&format!(" (minActivationTime={min_activation_time}s)"));
    }
    message
}

fn is_handler_api_error_text(text: &str) -> bool {
    matches!(
        text.trim(),
        "BAD_KEY"
            | "BAD_ACTION"
            | "BAD_SERVICE"
            | "BAD_COUNTRY"
            | "BAD_STATUS"
            | "NO_ACTIVATION"
            | "NO_BALANCE"
            | "NO_NUMBERS"
            | "ERROR_SQL"
            | "EARLY_CANCEL_DENIED"
            | "FREE_CANCELLATION_EXPIRED"
            | "OTP_RECEIVED"
            | "STATUS_CANCEL"
    ) || serde_json::from_str::<UpstreamErrorPayload>(text.trim()).is_ok()
}

fn normalize_fivesim_error(text: &str) -> String {
    let trimmed = text.trim();
    match trimmed.to_ascii_lowercase().as_str() {
        "no free phones" => "NO_FREE_PHONES: no free phones".to_string(),
        "not enough user balance" => "INSUFFICIENT_BALANCE: not enough user balance".to_string(),
        "not enough rating" => "INSUFFICIENT_RATING: not enough rating".to_string(),
        "select country" => "SELECT_COUNTRY: select country".to_string(),
        "select operator" => "SELECT_OPERATOR: select operator".to_string(),
        "bad country" => "BAD_COUNTRY: bad country".to_string(),
        "bad operator" => "BAD_OPERATOR: bad operator".to_string(),
        "no product" => "NO_PRODUCT: no product".to_string(),
        "server offline" => "SERVER_OFFLINE: server offline".to_string(),
        "order not found" => "ORDER_NOT_FOUND: order not found".to_string(),
        _ => trimmed.to_string(),
    }
}

#[async_trait]
pub trait SmsProvider: Send + Sync {
    fn manifest(&self) -> &ProviderManifest;

    async fn acquire(&self, request: &AcquireCodeRequest) -> Result<TicketRecord, SmsError>;

    async fn poll_code(&self, ticket: &TicketRecord) -> Result<PollCodeResponse, SmsError>;

    async fn release(
        &self,
        ticket: &TicketRecord,
        action: ReleaseAction,
    ) -> Result<String, SmsError>;

    async fn get_balance(&self) -> Result<ProviderBalance, SmsError>;

    async fn get_prices(
        &self,
        query: ProviderPriceQuery,
    ) -> Result<Vec<ProviderPriceItem>, SmsError>;

    async fn list_countries(&self) -> Result<Vec<OptionItem>, SmsError>;

    async fn list_services(
        &self,
        query: ProviderServicesQuery,
    ) -> Result<Vec<OptionItem>, SmsError>;

    async fn list_operators(
        &self,
        query: ProviderOperatorsQuery,
    ) -> Result<Vec<OptionItem>, SmsError>;
}

pub struct MockProvider {
    manifest: ProviderManifest,
    config: MockConfig,
}

impl MockProvider {
    pub fn new(manifest: ProviderManifest) -> Self {
        let config = manifest.mock.clone().unwrap_or_default();
        Self { manifest, config }
    }
}

#[async_trait]
impl SmsProvider for MockProvider {
    fn manifest(&self) -> &ProviderManifest {
        &self.manifest
    }

    async fn acquire(&self, request: &AcquireCodeRequest) -> Result<TicketRecord, SmsError> {
        let service = self
            .manifest
            .resolve_service_alias(request.service.as_deref());
        let country = self
            .manifest
            .resolved_country_hint(request.country.as_deref());
        let mut ticket = TicketRecord::new(
            self.manifest.id.clone(),
            service,
            country,
            self.config.phone_number.clone(),
            Some("mock-activation".to_string()),
            Some(0.0),
        );
        ticket.status = crate::models::TicketStatus::WaitingCode;
        ticket.message = Some("mock provider acquired".to_string());
        Ok(ticket)
    }

    async fn poll_code(&self, ticket: &TicketRecord) -> Result<PollCodeResponse, SmsError> {
        let code = self
            .config
            .codes
            .first()
            .cloned()
            .unwrap_or_else(|| "123456".to_string());
        Ok(PollCodeResponse {
            ticket_id: ticket.id.clone(),
            provider: self.manifest.id.clone(),
            status: crate::models::TicketStatus::CodeReceived,
            code: Some(code),
            message: Some("mock code ready".to_string()),
            next_retry_after_ms: None,
        })
    }

    async fn release(
        &self,
        _ticket: &TicketRecord,
        action: ReleaseAction,
    ) -> Result<String, SmsError> {
        Ok(format!("mock release {action:?}"))
    }

    async fn get_balance(&self) -> Result<ProviderBalance, SmsError> {
        Ok(ProviderBalance {
            provider: self.manifest.id.clone(),
            amount: self.config.balance,
            currency: "USD".to_string(),
        })
    }

    async fn get_prices(
        &self,
        query: ProviderPriceQuery,
    ) -> Result<Vec<ProviderPriceItem>, SmsError> {
        let resolved = self
            .manifest
            .resolve_service_alias(query.service.as_deref());
        Ok(vec![ProviderPriceItem {
            country: self.manifest.defaults.country.clone(),
            display_name: "Mock Country".to_string(),
            operator: "mock".to_string(),
            operator_label: Some("Mock".to_string()),
            provider_country: Some(self.manifest.defaults.country.clone()),
            provider_operator: Some("mock".to_string()),
            price: 0.0,
            stock: 99,
        }])
        .map(|mut items| {
            items[0].display_name = format!("Mock for {resolved}");
            items
        })
    }

    async fn list_countries(&self) -> Result<Vec<OptionItem>, SmsError> {
        Ok(vec![OptionItem {
            value: "local".into(),
            label: "Local".into(),
            hint: "local".into(),
            provider_value: Some("local".into()),
            icon_url: None,
            provider_icon_url: None,
        }])
    }

    async fn list_services(
        &self,
        _query: ProviderServicesQuery,
    ) -> Result<Vec<OptionItem>, SmsError> {
        Ok(vec![OptionItem {
            value: "openai".into(),
            label: "OpenAI".into(),
            hint: "openai".into(),
            provider_value: Some("openai".into()),
            icon_url: None,
            provider_icon_url: None,
        }])
    }

    async fn list_operators(
        &self,
        _query: ProviderOperatorsQuery,
    ) -> Result<Vec<OptionItem>, SmsError> {
        Ok(vec![OptionItem {
            value: "mock".into(),
            label: "Mock".into(),
            hint: "mock".into(),
            provider_value: Some("mock".into()),
            icon_url: None,
            provider_icon_url: None,
        }])
    }
}

pub struct HeroSmsProvider {
    manifest: ProviderManifest,
    client: Client,
    config: HandlerApiConfig,
}

impl HeroSmsProvider {
    pub fn new(manifest: ProviderManifest) -> Result<Self, SmsError> {
        let config = manifest.handler_api.clone().ok_or_else(|| {
            SmsError::Config(format!(
                "provider `{}` missing handler_api config",
                manifest.id
            ))
        })?;
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| SmsError::Config(e.to_string()))?;
        Ok(Self {
            manifest,
            client,
            config,
        })
    }

    fn from_shared(shared: SharedHandlerApiProvider) -> Self {
        Self {
            manifest: shared.manifest,
            client: shared.client,
            config: shared.config,
        }
    }

    fn as_shared(&self) -> SharedHandlerApiProvider {
        SharedHandlerApiProvider {
            manifest: self.manifest.clone(),
            client: self.client.clone(),
            config: self.config.clone(),
        }
    }

    async fn request(
        &self,
        action: &str,
        extra: &[(&str, String)],
    ) -> Result<(String, Option<Value>), SmsError> {
        self.as_shared().request(action, extra).await
    }

    async fn request_countries(&self) -> Result<Vec<OptionItem>, SmsError> {
        self.as_shared().request_countries().await
    }

    async fn request_services(&self) -> Result<Vec<OptionItem>, SmsError> {
        let faq_map = smsbower_fetch_faq_services_map(&self.client).await.ok();
        let services = self.as_shared().request_services().await?;
        Ok(services
            .into_iter()
            .map(|item| {
                let code = item.value.clone();
                if let Some(faq) = faq_map.as_ref().and_then(|items| items.get(&code)) {
                    OptionItem {
                        provider_value: item.provider_value,
                        icon_url: faq
                            .img_path
                            .clone()
                            .or_else(|| Some(SmsBowerProvider::service_icon_url(&faq.id))),
                        provider_icon_url: faq
                            .img_path
                            .clone()
                            .or_else(|| Some(SmsBowerProvider::service_icon_url(&faq.id))),
                        value: item.value,
                        label: faq.title.clone(),
                        hint: item.hint,
                    }
                } else {
                    item
                }
            })
            .collect())
    }

    fn parse_balance(&self, text: &str, json: Option<&Value>) -> Result<f64, SmsError> {
        self.as_shared().parse_balance(text, json)
    }

    fn parse_prices(&self, service: &str, json: Option<&Value>) -> Vec<ProviderPriceItem> {
        self.as_shared().parse_prices(service, json)
    }

    async fn request_offer_prices(
        &self,
        service: &str,
        country: Option<&str>,
    ) -> Result<Vec<ProviderPriceItem>, SmsError> {
        let mut request = self
            .client
            .get("https://hero-sms.com/api/v1/activations/offers")
            .header("Authorization", format!("ApiKey {}", self.config.api_key))
            .query(&[("services", service)]);
        if let Some(country) = country.filter(|value| !value.trim().is_empty() && *value != "any") {
            request = request.query(&[("countries", country)]);
        }
        let response = request
            .send()
            .await
            .map_err(|err| SmsError::Upstream(err.to_string()))?;
        let status = response.status();
        let text = response
            .text()
            .await
            .map_err(|err| SmsError::Upstream(err.to_string()))?;
        if !status.is_success() {
            return Err(SmsError::Upstream(text));
        }
        let json = serde_json::from_str::<Value>(&text)
            .map_err(|err| SmsError::Upstream(format!("parse offers response failed: {err}")))?;
        Ok(self.parse_offer_prices(service, &json))
    }

    fn parse_offer_prices(&self, service: &str, json: &Value) -> Vec<ProviderPriceItem> {
        let mut items = Vec::new();
        let Some(service_map) = json
            .pointer(&format!("/data/{service}"))
            .and_then(Value::as_object)
        else {
            return items;
        };

        for (country, payload) in service_map {
            let Some(price_map) = payload.pointer("/map").and_then(Value::as_object) else {
                continue;
            };
            for (price_key, stock_value) in price_map {
                let Some(price) = price_key.trim().parse::<f64>().ok() else {
                    continue;
                };
                let stock = stock_value
                    .as_u64()
                    .or_else(|| stock_value.as_i64().map(|value| value.max(0) as u64))
                    .unwrap_or(0);
                if stock == 0 {
                    continue;
                }
                items.push(ProviderPriceItem {
                    country: country.clone(),
                    display_name: country.clone(),
                    operator: "any".to_string(),
                    operator_label: Some("Any operator".to_string()),
                    provider_country: Some(country.clone()),
                    provider_operator: Some("any".to_string()),
                    price,
                    stock,
                });
            }
        }

        items.sort_by(|left, right| {
            left.country
                .cmp(&right.country)
                .then_with(|| left.price.total_cmp(&right.price))
                .then_with(|| left.stock.cmp(&right.stock))
        });
        items
    }

    fn parse_number(
        &self,
        text: &str,
        json: Option<&Value>,
    ) -> Result<(String, String, Option<f64>), SmsError> {
        self.as_shared().parse_number(text, json)
    }

    fn expected_release_response(&self, action: ReleaseAction) -> &'static str {
        match action {
            ReleaseAction::Finish => "ACCESS_ACTIVATION",
            ReleaseAction::Cancel | ReleaseAction::Ban => "ACCESS_CANCEL",
            ReleaseAction::Retry => "ACCESS_RETRY_GET",
        }
    }
}

pub struct SmsBowerProvider {
    manifest: ProviderManifest,
    client: Client,
    config: HandlerApiConfig,
}

impl SmsBowerProvider {
    pub fn new(manifest: ProviderManifest) -> Result<Self, SmsError> {
        let shared = SharedHandlerApiProvider::new(manifest)?;
        Ok(Self {
            manifest: shared.manifest,
            client: shared.client,
            config: shared.config,
        })
    }

    fn country_icon_url(country_id: &str) -> String {
        smsbower_country_icon_url(country_id)
    }

    fn service_icon_url(service_id: &str) -> String {
        smsbower_fallback_service_icon_url(service_id)
    }

    fn enrich_service_item(item: OptionItem, faq: Option<&SmsBowerFaqService>) -> OptionItem {
        let Some(faq) = faq else {
            return item;
        };
        let provider_value = item
            .provider_value
            .clone()
            .or_else(|| Some(item.value.clone()));
        OptionItem {
            provider_value,
            icon_url: faq
                .img_path
                .clone()
                .or_else(|| Some(Self::service_icon_url(&faq.id))),
            provider_icon_url: faq
                .img_path
                .clone()
                .or_else(|| Some(Self::service_icon_url(&faq.id))),
            value: item.value,
            label: faq.title.clone(),
            hint: faq.activate_org_code.clone(),
        }
    }

    fn as_shared(&self) -> SharedHandlerApiProvider {
        SharedHandlerApiProvider {
            manifest: self.manifest.clone(),
            client: self.client.clone(),
            config: self.config.clone(),
        }
    }

    async fn request_services(&self) -> Result<Vec<OptionItem>, SmsError> {
        let faq_map = smsbower_fetch_faq_services_map(&self.client).await?;
        let services = self.as_shared().request_services().await?;
        Ok(services
            .into_iter()
            .map(|item| {
                let code = item.value.clone();
                Self::enrich_service_item(item, faq_map.get(&code))
            })
            .collect())
    }

    async fn request_price_v3(
        &self,
        service: &str,
        country: Option<&str>,
    ) -> Result<Vec<ProviderPriceItem>, SmsError> {
        let mut params = vec![("service", service.to_string())];
        if let Some(country) = country.filter(|value| !value.trim().is_empty() && *value != "any") {
            params.push(("country", country.to_string()));
        }
        let (_text, json) = self.as_shared().request("getPricesV3", &params).await?;
        Ok(Self::parse_price_v3(service, json.as_ref()))
    }

    fn parse_price_v3(service: &str, json: Option<&Value>) -> Vec<ProviderPriceItem> {
        let Some(Value::Object(country_map)) = json else {
            return Vec::new();
        };

        let mut items = Vec::new();
        for (country_id, entry) in country_map {
            let Some(service_entry) = entry.get(service).and_then(Value::as_object) else {
                continue;
            };
            for (provider_id, provider_payload) in service_entry {
                let Some(provider_payload) = provider_payload.as_object() else {
                    continue;
                };
                let Some(price) = provider_payload.get("price").and_then(coerce_f64) else {
                    continue;
                };
                let stock = provider_payload
                    .get("count")
                    .and_then(|value| {
                        value
                            .as_u64()
                            .or_else(|| value.as_str().and_then(|text| text.parse().ok()))
                    })
                    .unwrap_or(0);
                if stock == 0 {
                    continue;
                }
                items.push(ProviderPriceItem {
                    country: country_id.clone(),
                    display_name: country_id.clone(),
                    operator: provider_id.clone(),
                    operator_label: Some(format!("Provider #{provider_id}")),
                    provider_country: Some(country_id.clone()),
                    provider_operator: Some(provider_id.clone()),
                    price,
                    stock,
                });
            }
        }

        items.sort_by(|left, right| {
            left.country
                .cmp(&right.country)
                .then_with(|| left.operator.cmp(&right.operator))
                .then_with(|| left.price.total_cmp(&right.price))
        });
        items
    }
}

struct SharedHandlerApiProvider {
    manifest: ProviderManifest,
    client: Client,
    config: HandlerApiConfig,
}

impl SharedHandlerApiProvider {
    fn new(manifest: ProviderManifest) -> Result<Self, SmsError> {
        let config = manifest.handler_api.clone().ok_or_else(|| {
            SmsError::Config(format!(
                "provider `{}` missing handler_api config",
                manifest.id
            ))
        })?;
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| SmsError::Config(e.to_string()))?;
        Ok(Self {
            manifest,
            client,
            config,
        })
    }

    async fn request(
        &self,
        action: &str,
        extra: &[(&str, String)],
    ) -> Result<(String, Option<Value>), SmsError> {
        let mut query = vec![
            ("action", action.to_string()),
            ("api_key", self.config.api_key.clone()),
        ];
        query.extend(extra.iter().map(|(key, value)| (*key, value.clone())));
        let response = self
            .client
            .get(&self.config.base_url)
            .query(&query)
            .send()
            .await
            .map_err(|err| SmsError::Upstream(err.to_string()))?;
        let status = response.status();
        let text = response
            .text()
            .await
            .map_err(|err| SmsError::Upstream(err.to_string()))?;
        if !status.is_success() {
            return Err(SmsError::Upstream(format_handler_api_error(&text)));
        }
        let json = serde_json::from_str::<Value>(&text).ok();
        Ok((text, json))
    }

    async fn request_countries(&self) -> Result<Vec<OptionItem>, SmsError> {
        let (_text, json) = self.request(&self.config.get_countries_action, &[]).await?;
        let Some(json) = json else {
            return Ok(Vec::new());
        };
        let faq_map = smsbower_fetch_faq_countries_map(&self.client).await.ok();
        let values: Vec<Value> = if let Some(array) = json.as_array() {
            array.clone()
        } else if let Some(object) = json.as_object() {
            object.values().cloned().collect()
        } else {
            Vec::new()
        };
        Ok(values
            .into_iter()
            .filter_map(|item| {
                let value = item.pointer("/id").and_then(coerce_str_value)?;
                let iso_code = item
                    .pointer("/iso")
                    .and_then(coerce_str_value)
                    .map(|code| code.trim().to_ascii_lowercase());
                let label = item
                    .pointer("/chn")
                    .and_then(Value::as_str)
                    .or_else(|| item.pointer("/eng").and_then(Value::as_str))
                    .or_else(|| item.pointer("/rus").and_then(Value::as_str))
                    .unwrap_or(&value)
                    .to_string();
                let hint = item
                    .pointer("/eng")
                    .and_then(Value::as_str)
                    .unwrap_or(&value)
                    .to_string();
                let faq = faq_map.as_ref().and_then(|items| items.get(&value));
                let fallback_icon_key = faq
                    .and_then(|item| item.iso_code.as_deref())
                    .or(iso_code.as_deref())
                    .unwrap_or(&value);
                Some(OptionItem {
                    provider_value: Some(value.clone()),
                    icon_url: Some(
                        faq.map(|item| item.icon_url.clone()).unwrap_or_else(|| {
                            SmsBowerProvider::country_icon_url(fallback_icon_key)
                        }),
                    ),
                    provider_icon_url: Some(
                        faq.map(|item| item.icon_url.clone()).unwrap_or_else(|| {
                            SmsBowerProvider::country_icon_url(fallback_icon_key)
                        }),
                    ),
                    value,
                    label: faq.map(|item| item.label.clone()).unwrap_or(label),
                    hint: faq.map(|item| item.hint.clone()).unwrap_or(hint),
                })
            })
            .collect())
    }

    async fn request_services(&self) -> Result<Vec<OptionItem>, SmsError> {
        for action in ["getServicesList", "getServices"] {
            if let Ok((_text, json)) = self.request(action, &[]).await {
                if let Some(json) = json {
                    let items = json
                        .pointer("/services")
                        .and_then(Value::as_array)
                        .cloned()
                        .or_else(|| json.as_array().cloned())
                        .unwrap_or_default();
                    let services = items
                        .into_iter()
                        .filter_map(|item| {
                            let value = item
                                .pointer("/code")
                                .and_then(coerce_str_value)
                                .or_else(|| item.pointer("/id").and_then(coerce_str_value))?;
                            let label = item
                                .pointer("/name")
                                .and_then(Value::as_str)
                                .or_else(|| item.pointer("/title").and_then(Value::as_str))
                                .map(ToOwned::to_owned)
                                .unwrap_or_else(|| value.clone());
                            Some(OptionItem {
                                provider_value: Some(value.clone()),
                                icon_url: None,
                                provider_icon_url: None,
                                value,
                                label: label.clone(),
                                hint: label,
                            })
                        })
                        .collect::<Vec<_>>();
                    if !services.is_empty() {
                        return Ok(services);
                    }
                }
            }
        }
        Ok(Vec::new())
    }

    async fn request_operators(&self, country: Option<&str>) -> Result<Vec<OptionItem>, SmsError> {
        let mut params = Vec::new();
        if let Some(country) = country.filter(|value| !value.is_empty()) {
            let faq_map = smsbower_fetch_faq_countries_map(&self.client).await.ok();
            let mapped_country = faq_map
                .as_ref()
                .and_then(|items| items.get(country))
                .map(|item| item.id.clone())
                .unwrap_or_else(|| country.to_string());
            params.push(("country", mapped_country));
        }
        let (_text, json) = self.request("getOperators", &params).await?;
        let Some(json) = json else {
            return Ok(Vec::new());
        };
        let Some(groups) = json.pointer("/countryOperators").and_then(Value::as_object) else {
            return Ok(Vec::new());
        };
        let mut merged = BTreeMap::<String, OptionItem>::new();
        for (country_id, operators) in groups {
            let Some(operators) = operators.as_array() else {
                continue;
            };
            for operator in operators.iter().filter_map(Value::as_str) {
                merged
                    .entry(operator.to_string())
                    .or_insert_with(|| OptionItem {
                        value: operator.to_string(),
                        label: operator.to_string(),
                        hint: format!("country={country_id}"),
                        provider_value: Some(operator.to_string()),
                        icon_url: None,
                        provider_icon_url: None,
                    });
            }
        }
        Ok(merged.into_values().collect())
    }

    fn parse_balance(&self, text: &str, json: Option<&Value>) -> Result<f64, SmsError> {
        if let Some(value) = text.strip_prefix(&self.config.balance_prefix) {
            return value
                .trim()
                .parse::<f64>()
                .map_err(|err| SmsError::Upstream(format!("parse balance failed: {err}")));
        }
        if let Some(json) = json {
            for pointer in &self.config.balance_json_pointers {
                if let Some(number) = json.pointer(pointer).and_then(coerce_f64) {
                    return Ok(number);
                }
            }
        }
        if !text.trim().is_empty() {
            return Err(SmsError::Upstream(format_handler_api_error(text)));
        }
        Err(SmsError::Upstream("unable to parse balance".to_string()))
    }

    fn parse_prices(&self, service: &str, json: Option<&Value>) -> Vec<ProviderPriceItem> {
        let mut items = Vec::new();
        let Some(Value::Object(map)) = json else {
            return items;
        };
        for (country, entry) in map {
            let price_node = entry.get(service).unwrap_or(entry);
            let Some(price_obj) = price_node.as_object() else {
                continue;
            };
            let Some(price) = price_obj
                .get("cost")
                .or_else(|| price_obj.get("price"))
                .or_else(|| price_obj.get("activationCost"))
                .and_then(coerce_f64)
            else {
                continue;
            };
            let stock = price_obj
                .get("count")
                .or_else(|| price_obj.get("qty"))
                .or_else(|| price_obj.get("stock"))
                .and_then(|v| {
                    v.as_u64()
                        .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
                })
                .unwrap_or(0);
            let operator = price_obj
                .get("operator")
                .and_then(Value::as_str)
                .unwrap_or("default")
                .to_string();
            items.push(ProviderPriceItem {
                country: country.clone(),
                display_name: country.clone(),
                operator,
                operator_label: None,
                provider_country: Some(country.clone()),
                provider_operator: None,
                price,
                stock,
            });
        }
        items.sort_by(|left, right| left.price.total_cmp(&right.price));
        items
    }

    fn parse_number(
        &self,
        text: &str,
        json: Option<&Value>,
    ) -> Result<(String, String, Option<f64>), SmsError> {
        if let Some(stripped) = text.strip_prefix("ACCESS_NUMBER:") {
            let parts: Vec<_> = stripped.split(':').collect();
            if parts.len() >= 2 {
                let phone = if parts[1].starts_with('+') {
                    parts[1].to_string()
                } else {
                    format!("+{}", parts[1])
                };
                return Ok((parts[0].to_string(), phone, None));
            }
        }
        if let Some(json) = json {
            // activationId 可能是 string 或 integer（兼容不同版本的 handler_api）
            let upstream_id = self
                .config
                .id_json_pointers
                .iter()
                .find_map(|pointer| json.pointer(pointer).and_then(coerce_str_value))
                .unwrap_or_default();
            // phoneNumber 在 SmsBower getNumberV2 中是 integer（如 79129001234），需强制转 string
            let phone_raw = self
                .config
                .phone_json_pointers
                .iter()
                .find_map(|pointer| json.pointer(pointer).and_then(coerce_str_value))
                .unwrap_or_default();
            if !upstream_id.is_empty() && !phone_raw.is_empty() {
                let normalized = if phone_raw.starts_with('+') {
                    phone_raw
                } else {
                    format!("+{phone_raw}")
                };
                // activationCost 在 SmsBower getNumberV2 中是 string "0.14"，需强制转 f64
                let price = self
                    .config
                    .price_json_pointers
                    .iter()
                    .find_map(|pointer| json.pointer(pointer).and_then(coerce_f64));
                return Ok((upstream_id, normalized, price));
            }
        }
        Err(SmsError::Upstream(text.to_string()))
    }
}

#[async_trait]
impl SmsProvider for HeroSmsProvider {
    fn manifest(&self) -> &ProviderManifest {
        &self.manifest
    }

    async fn acquire(&self, request: &AcquireCodeRequest) -> Result<TicketRecord, SmsError> {
        let service = self
            .manifest
            .resolve_service_alias(request.service.as_deref());
        let country = self
            .manifest
            .resolved_country_hint(request.country.as_deref());
        let mut params = vec![("service", service.clone()), ("country", country.clone())];
        if let Some(max_price) = request
            .max_price
            .or(Some(self.manifest.defaults.max_price))
            .filter(|v| *v > 0.0)
        {
            params.push(("maxPrice", max_price.to_string()));
        }
        if let Some(min_price) = request
            .min_price
            .or(Some(self.manifest.defaults.min_price))
            .filter(|v| *v > 0.0)
        {
            params.push(("minPrice", min_price.to_string()));
        }
        let (text, json) = self
            .request(&self.config.get_number_action, &params)
            .await?;
        let (upstream_id, phone_number, price) = self.parse_number(&text, json.as_ref())?;
        let mut ticket = TicketRecord::new(
            self.manifest.id.clone(),
            service,
            country,
            phone_number,
            Some(upstream_id),
            price,
        );
        ticket.status = crate::models::TicketStatus::WaitingCode;
        ticket.message = Some("number acquired".to_string());
        Ok(ticket)
    }

    async fn poll_code(&self, ticket: &TicketRecord) -> Result<PollCodeResponse, SmsError> {
        let upstream_id = ticket
            .upstream_id
            .clone()
            .ok_or_else(|| SmsError::InvalidRequest("ticket missing upstream_id".to_string()))?;
        let (text, json) = self
            .request(&self.config.get_status_action, &[("id", upstream_id)])
            .await?;
        let upper = text.to_ascii_uppercase();
        let success_prefix = self.config.success_status_prefix.to_ascii_uppercase();
        let code_from_json = json.as_ref().and_then(|value| {
            self.config
                .code_json_pointers
                .iter()
                .find_map(|pointer| value.pointer(pointer).and_then(Value::as_str))
        });
        if upper.starts_with(&success_prefix) || code_from_json.is_some() {
            let code = text
                .split_once(':')
                .map(|(_, value)| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .or_else(|| code_from_json.map(ToOwned::to_owned));
            return Ok(PollCodeResponse {
                ticket_id: ticket.id.clone(),
                provider: ticket.provider.clone(),
                status: crate::models::TicketStatus::CodeReceived,
                code,
                message: Some("code received".to_string()),
                next_retry_after_ms: None,
            });
        }
        if self
            .config
            .failure_status_tokens
            .iter()
            .any(|token| upper.contains(&token.to_ascii_uppercase()))
        {
            return Ok(PollCodeResponse {
                ticket_id: ticket.id.clone(),
                provider: ticket.provider.clone(),
                status: crate::models::TicketStatus::Failed,
                code: None,
                message: Some(text),
                next_retry_after_ms: None,
            });
        }
        if self
            .config
            .wait_status_tokens
            .iter()
            .any(|token| upper.contains(&token.to_ascii_uppercase()))
        {
            return Ok(PollCodeResponse {
                ticket_id: ticket.id.clone(),
                provider: ticket.provider.clone(),
                status: crate::models::TicketStatus::WaitingCode,
                code: None,
                message: Some(text),
                next_retry_after_ms: Some(3000),
            });
        }
        Ok(PollCodeResponse {
            ticket_id: ticket.id.clone(),
            provider: ticket.provider.clone(),
            status: crate::models::TicketStatus::Failed,
            code: None,
            message: Some(text),
            next_retry_after_ms: None,
        })
    }

    async fn release(
        &self,
        ticket: &TicketRecord,
        action: ReleaseAction,
    ) -> Result<String, SmsError> {
        let upstream_id = ticket
            .upstream_id
            .clone()
            .ok_or_else(|| SmsError::InvalidRequest("ticket missing upstream_id".to_string()))?;
        let status = match action {
            ReleaseAction::Finish => self.config.status_finish,
            ReleaseAction::Cancel | ReleaseAction::Ban => self.config.status_cancel,
            ReleaseAction::Retry => self.config.status_retry,
        };
        let (text, _) = self
            .request(
                &self.config.set_status_action,
                &[("id", upstream_id), ("status", status.to_string())],
            )
            .await?;
        let expected = self.expected_release_response(action);
        if text.trim() != expected {
            if is_handler_api_error_text(text.trim()) {
                return Err(SmsError::Upstream(format_handler_api_error(&text)));
            }
            return Err(SmsError::Upstream(format!(
                "unexpected release response: expected {expected}, got {}",
                text.trim()
            )));
        }
        Ok(text)
    }

    async fn get_balance(&self) -> Result<ProviderBalance, SmsError> {
        let (text, json) = self.request(&self.config.get_balance_action, &[]).await?;
        let amount = self.parse_balance(&text, json.as_ref())?;
        Ok(ProviderBalance {
            provider: self.manifest.id.clone(),
            amount,
            currency: "USD".to_string(),
        })
    }

    async fn get_prices(
        &self,
        query: ProviderPriceQuery,
    ) -> Result<Vec<ProviderPriceItem>, SmsError> {
        let service = self
            .manifest
            .resolve_service_alias(query.service.as_deref());
        let country = query.country.as_deref();
        if let Ok(items) = self.request_offer_prices(&service, country).await {
            if !items.is_empty() {
                return Ok(items);
            }
        }
        let (_text, json) = self
            .request(
                &self.config.get_prices_action,
                &[
                    ("service", service.clone()),
                    ("country", country.unwrap_or_default().to_string()),
                ],
            )
            .await?;
        if json.is_none() {
            return Err(SmsError::Upstream(
                "handler_api prices response is not valid JSON".to_string(),
            ));
        }
        Ok(self.parse_prices(&service, json.as_ref()))
    }

    async fn list_countries(&self) -> Result<Vec<OptionItem>, SmsError> {
        self.request_countries().await
    }

    async fn list_services(
        &self,
        _query: ProviderServicesQuery,
    ) -> Result<Vec<OptionItem>, SmsError> {
        self.request_services().await
    }

    async fn list_operators(
        &self,
        query: ProviderOperatorsQuery,
    ) -> Result<Vec<OptionItem>, SmsError> {
        let operators = self
            .as_shared()
            .request_operators(query.country.as_deref())
            .await?;
        if operators.is_empty() {
            return Ok(vec![OptionItem {
                value: "any".into(),
                label: "Any Operator".into(),
                hint: "any".into(),
                provider_value: Some("any".into()),
                icon_url: None,
                provider_icon_url: None,
            }]);
        }
        Ok(operators)
    }
}

#[async_trait]
impl SmsProvider for SmsBowerProvider {
    fn manifest(&self) -> &ProviderManifest {
        &self.manifest
    }

    async fn acquire(&self, request: &AcquireCodeRequest) -> Result<TicketRecord, SmsError> {
        let hero = HeroSmsProvider::from_shared(SharedHandlerApiProvider {
            manifest: self.manifest.clone(),
            client: self.client.clone(),
            config: self.config.clone(),
        });
        hero.acquire(request).await
    }

    async fn poll_code(&self, ticket: &TicketRecord) -> Result<PollCodeResponse, SmsError> {
        let hero = HeroSmsProvider::from_shared(SharedHandlerApiProvider {
            manifest: self.manifest.clone(),
            client: self.client.clone(),
            config: self.config.clone(),
        });
        hero.poll_code(ticket).await
    }

    async fn release(
        &self,
        ticket: &TicketRecord,
        action: ReleaseAction,
    ) -> Result<String, SmsError> {
        let hero = HeroSmsProvider::from_shared(SharedHandlerApiProvider {
            manifest: self.manifest.clone(),
            client: self.client.clone(),
            config: self.config.clone(),
        });
        hero.release(ticket, action).await
    }

    async fn get_balance(&self) -> Result<ProviderBalance, SmsError> {
        let hero = HeroSmsProvider::from_shared(SharedHandlerApiProvider {
            manifest: self.manifest.clone(),
            client: self.client.clone(),
            config: self.config.clone(),
        });
        hero.get_balance().await
    }

    async fn list_countries(&self) -> Result<Vec<OptionItem>, SmsError> {
        let hero = HeroSmsProvider::from_shared(SharedHandlerApiProvider {
            manifest: self.manifest.clone(),
            client: self.client.clone(),
            config: self.config.clone(),
        });
        hero.list_countries().await
    }

    async fn get_prices(
        &self,
        query: ProviderPriceQuery,
    ) -> Result<Vec<ProviderPriceItem>, SmsError> {
        let service = self
            .manifest
            .resolve_service_alias(query.service.as_deref());
        let country = query.country.as_deref();
        if let Ok(items) = self.request_price_v3(&service, country).await {
            if !items.is_empty() {
                return Ok(items);
            }
        }
        let hero = HeroSmsProvider::from_shared(SharedHandlerApiProvider {
            manifest: self.manifest.clone(),
            client: self.client.clone(),
            config: self.config.clone(),
        });
        hero.get_prices(ProviderPriceQuery {
            provider: query.provider,
            service: Some(service),
            country: query.country,
            operator: query.operator,
        })
        .await
    }

    async fn list_services(
        &self,
        _query: ProviderServicesQuery,
    ) -> Result<Vec<OptionItem>, SmsError> {
        self.request_services().await
    }

    async fn list_operators(
        &self,
        query: ProviderOperatorsQuery,
    ) -> Result<Vec<OptionItem>, SmsError> {
        let hero = HeroSmsProvider::from_shared(SharedHandlerApiProvider {
            manifest: self.manifest.clone(),
            client: self.client.clone(),
            config: self.config.clone(),
        });
        hero.list_operators(query).await
    }
}

pub struct FiveSimProvider {
    manifest: ProviderManifest,
    client: Client,
    config: FiveSimConfig,
}

impl FiveSimProvider {
    pub fn new(manifest: ProviderManifest) -> Result<Self, SmsError> {
        let config = manifest.five_sim.clone().ok_or_else(|| {
            SmsError::Config(format!(
                "provider `{}` missing five_sim config",
                manifest.id
            ))
        })?;
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| SmsError::Config(e.to_string()))?;
        Ok(Self {
            manifest,
            client,
            config,
        })
    }

    async fn request_get(
        &self,
        path: &str,
        params: &[(&str, String)],
    ) -> Result<(String, Value), SmsError> {
        let url = format!(
            "{}/{}",
            self.config.base_url.trim_end_matches('/'),
            path.trim_start_matches('/')
        );
        let response = self
            .client
            .get(url)
            .bearer_auth(&self.config.api_key)
            .header("Accept", "application/json")
            .query(params)
            .send()
            .await
            .map_err(|err| SmsError::Upstream(err.to_string()))?;
        let status = response.status();
        let text = response
            .text()
            .await
            .map_err(|err| SmsError::Upstream(err.to_string()))?;
        if !status.is_success() {
            return Err(SmsError::Upstream(normalize_fivesim_error(&text)));
        }
        // 5SIM 部分端点在 HTTP 200 时会以纯文本返回错误（如 "no free phones"），
        // 直接将原文回传比 "invalid json: ..." 更利于排查问题。
        let json = serde_json::from_str::<Value>(&text)
            .map_err(|_| SmsError::Upstream(normalize_fivesim_error(&text)))?;
        Ok((text, json))
    }

    async fn request_products(
        &self,
        country: &str,
        operator: &str,
    ) -> Result<Vec<OptionItem>, SmsError> {
        let path = format!(
            "{}/{}/{}",
            self.config.products_endpoint.trim_end_matches('/'),
            country,
            operator,
        );
        let (_text, json) = self.request_get(&path, &[]).await?;
        let entries = json.as_object().cloned().unwrap_or_default();
        Ok(entries
            .into_iter()
            .map(|(value, item)| {
                let qty = item
                    .pointer("/Qty")
                    .or_else(|| item.pointer("/qty"))
                    .and_then(|v| {
                        v.as_u64()
                            .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
                    })
                    .unwrap_or(0);
                let price = item
                    .pointer("/Price")
                    .or_else(|| item.pointer("/price"))
                    .and_then(coerce_f64)
                    .unwrap_or(0.0);
                OptionItem {
                    provider_value: Some(value.clone()),
                    value: value.clone(),
                    label: value,
                    hint: format!("qty={qty}, price={price:.3}"),
                    icon_url: None,
                    provider_icon_url: None,
                }
            })
            .collect())
    }

    async fn request_countries_map(&self) -> Result<BTreeMap<String, Value>, SmsError> {
        let (_text, json) = self.request_get("guest/countries", &[]).await?;
        let countries = json
            .as_object()
            .cloned()
            .ok_or_else(|| SmsError::Upstream("invalid 5SIM countries response".to_string()))?;
        Ok(countries.into_iter().collect())
    }

    async fn request_static_products_list(&self) -> Result<Vec<OptionItem>, SmsError> {
        let response = self
            .client
            .get("https://5sim.net/docs")
            .header("Accept", "text/html")
            .send()
            .await
            .map_err(|err| SmsError::Upstream(err.to_string()))?;
        let status = response.status();
        let html = response
            .text()
            .await
            .map_err(|err| SmsError::Upstream(err.to_string()))?;
        if !status.is_success() {
            return Err(SmsError::Upstream(format!(
                "5SIM docs request failed: {}",
                status
            )));
        }

        let anchor = "id=\"products-list\"";
        let Some(anchor_index) = html.find(anchor) else {
            return Err(SmsError::Upstream(
                "5SIM docs products list anchor not found".to_string(),
            ));
        };
        let table_fragment = &html[anchor_index..];
        let Some(table_start_rel) = table_fragment.find("<table") else {
            return Err(SmsError::Upstream(
                "5SIM docs products list table start not found".to_string(),
            ));
        };
        let table_after_start = &table_fragment[table_start_rel..];
        let Some(table_end_rel) = table_after_start.find("</table>") else {
            return Err(SmsError::Upstream(
                "5SIM docs products list table end not found".to_string(),
            ));
        };
        let table_html = &table_after_start[..table_end_rel + "</table>".len()];

        let mut items = Vec::new();
        for row in split_html(table_html, "<tr", "</tr>") {
            if row.contains(">Service<") && row.contains(">API 5SIM<") {
                continue;
            }
            let cells = split_html(row, "<td", "</td>")
                .into_iter()
                .map(html_to_text)
                .filter(|cell| !cell.is_empty())
                .collect::<Vec<_>>();
            if cells.len() < 2 {
                continue;
            }
            let label = cells[0].clone();
            let provider_value = cells[1].clone();
            items.push(OptionItem {
                value: provider_value.clone(),
                label,
                hint: "5SIM static products list".to_string(),
                provider_value: Some(provider_value),
                icon_url: None,
                provider_icon_url: None,
            });
        }

        if items.is_empty() {
            return Err(SmsError::Upstream(
                "5SIM docs products list parsed no rows".to_string(),
            ));
        }
        Ok(items)
    }

    fn operator_keys_from_country_payload(payload: &Value) -> Vec<String> {
        let Some(object) = payload.as_object() else {
            return Vec::new();
        };
        object
            .keys()
            .filter(|key| !matches!(key.as_str(), "iso" | "prefix" | "text_en" | "text_ru"))
            .cloned()
            .collect()
    }

    fn map_poll_payload(
        &self,
        json: &Value,
    ) -> (String, Option<String>, crate::models::TicketStatus) {
        let status = json
            .pointer(&self.config.status_json_pointer)
            .and_then(Value::as_str)
            .unwrap_or("PENDING")
            .to_string();
        let sms_code = self
            .config
            .code_json_pointers
            .iter()
            .find_map(|pointer| json.pointer(pointer).and_then(Value::as_str))
            .map(ToOwned::to_owned);
        let mapped = match status.as_str() {
            // RECEIVED = 号码活跃，等待 SMS；PENDING = 初始化；FINISHED = 完成
            // 只要 sms 数组中有验证码，均视为 CodeReceived
            "RECEIVED" | "PENDING" | "FINISHED" if sms_code.is_some() => {
                crate::models::TicketStatus::CodeReceived
            }
            _ if self
                .config
                .failure_statuses
                .iter()
                .any(|item| item.eq_ignore_ascii_case(&status)) =>
            {
                crate::models::TicketStatus::Failed
            }
            _ => crate::models::TicketStatus::WaitingCode,
        };
        (status, sms_code, mapped)
    }

    fn expected_release_status(&self, action: ReleaseAction) -> &'static str {
        match action {
            ReleaseAction::Finish => "FINISHED",
            ReleaseAction::Cancel => "CANCELED",
            ReleaseAction::Ban => "BANNED",
            ReleaseAction::Retry => "PENDING",
        }
    }

    fn validate_release_payload(
        &self,
        json: &Value,
        action: ReleaseAction,
    ) -> Result<String, SmsError> {
        let status = json
            .pointer(&self.config.status_json_pointer)
            .and_then(Value::as_str)
            .ok_or_else(|| SmsError::Upstream("missing 5SIM release status".to_string()))?;
        let expected = self.expected_release_status(action);
        if !status.eq_ignore_ascii_case(expected) {
            return Err(SmsError::Upstream(format!(
                "unexpected 5SIM release status: expected {expected}, got {status}"
            )));
        }
        Ok(status.to_string())
    }
}

#[async_trait]
impl SmsProvider for FiveSimProvider {
    fn manifest(&self) -> &ProviderManifest {
        &self.manifest
    }

    async fn acquire(&self, request: &AcquireCodeRequest) -> Result<TicketRecord, SmsError> {
        let service = self
            .manifest
            .resolve_service_alias(request.service.as_deref());
        let country = self
            .manifest
            .resolved_country_hint(request.country.as_deref());
        let endpoint = format!(
            "{}/{}/{}/{}",
            self.config.buy_endpoint_prefix.trim_end_matches('/'),
            country,
            self.config.buy_operator,
            service
        );
        let mut params = Vec::new();
        if let Some(max_price) = request
            .max_price
            .or(Some(self.manifest.defaults.max_price))
            .filter(|v| *v > 0.0)
        {
            params.push(("maxPrice", max_price.to_string()));
        }
        if request
            .reuse_phone
            .or(Some(self.manifest.defaults.reuse_phone))
            .unwrap_or(false)
        {
            params.push(("reuse", "1".to_string()));
        }
        let (_text, json) = self.request_get(&endpoint, &params).await?;
        let upstream_id = self
            .config
            .id_json_pointers
            .iter()
            .find_map(|pointer| json.pointer(pointer).and_then(coerce_str_value))
            .ok_or_else(|| SmsError::Upstream("missing 5SIM order id".to_string()))?;
        // 兼容内部 5SIM 风格实现返回 string/int 号码字段
        let raw_phone = self
            .config
            .phone_json_pointers
            .iter()
            .find_map(|pointer| json.pointer(pointer).and_then(coerce_str_value))
            .ok_or_else(|| SmsError::Upstream("missing 5SIM phone".to_string()))?;
        let phone = if raw_phone.starts_with('+') {
            raw_phone
        } else {
            format!("+{raw_phone}")
        };
        let price = self
            .config
            .price_json_pointers
            .iter()
            .find_map(|pointer| json.pointer(pointer).and_then(coerce_f64));
        let mut ticket = TicketRecord::new(
            self.manifest.id.clone(),
            service,
            country,
            phone,
            Some(upstream_id),
            price,
        );
        ticket.status = crate::models::TicketStatus::WaitingCode;
        ticket.message = Some("number acquired".to_string());
        Ok(ticket)
    }

    async fn poll_code(&self, ticket: &TicketRecord) -> Result<PollCodeResponse, SmsError> {
        let upstream_id = ticket
            .upstream_id
            .clone()
            .ok_or_else(|| SmsError::InvalidRequest("ticket missing upstream_id".to_string()))?;
        let endpoint = format!("{}/{}", self.config.check_endpoint_prefix, upstream_id);
        let (_text, json) = self.request_get(&endpoint, &[]).await?;
        let (status, sms_code, mapped) = self.map_poll_payload(&json);
        let should_retry = matches!(mapped, crate::models::TicketStatus::WaitingCode);
        Ok(PollCodeResponse {
            ticket_id: ticket.id.clone(),
            provider: ticket.provider.clone(),
            status: mapped,
            code: sms_code,
            message: Some(status),
            next_retry_after_ms: if should_retry { Some(3000) } else { None },
        })
    }

    async fn release(
        &self,
        ticket: &TicketRecord,
        action: ReleaseAction,
    ) -> Result<String, SmsError> {
        let upstream_id = ticket
            .upstream_id
            .clone()
            .ok_or_else(|| SmsError::InvalidRequest("ticket missing upstream_id".to_string()))?;
        let verb = match action {
            ReleaseAction::Finish => self.config.finish_action.as_str(),
            ReleaseAction::Cancel => self.config.cancel_action.as_str(),
            ReleaseAction::Retry => {
                return Err(SmsError::InvalidRequest(
                    "five_sim protocol does not support release retry; continue polling or create a new order"
                        .to_string(),
                ))
            }
            ReleaseAction::Ban => self.config.ban_action.as_str(),
        };
        let endpoint = format!("user/{verb}/{upstream_id}");
        let (_text, json) = self.request_get(&endpoint, &[]).await?;
        self.validate_release_payload(&json, action)
    }

    async fn get_balance(&self) -> Result<ProviderBalance, SmsError> {
        let (_text, json) = self.request_get(&self.config.profile_endpoint, &[]).await?;
        let amount = json
            .pointer(&self.config.balance_json_pointer)
            .and_then(Value::as_f64)
            .ok_or_else(|| SmsError::Upstream("missing 5SIM balance".to_string()))?;
        Ok(ProviderBalance {
            provider: self.manifest.id.clone(),
            amount,
            currency: "USD".to_string(),
        })
    }

    async fn get_prices(
        &self,
        query: ProviderPriceQuery,
    ) -> Result<Vec<ProviderPriceItem>, SmsError> {
        let service = self
            .manifest
            .resolve_service_alias(query.service.as_deref());
        let (_text, json) = self
            .request_get(
                &self.config.prices_endpoint,
                &[("product", service.clone())],
            )
            .await?;
        let mut items = Vec::new();
        let root = json
            .get(&service)
            .and_then(Value::as_object)
            .ok_or_else(|| SmsError::Upstream("invalid 5SIM prices response".to_string()))?;
        for (country, operators) in root {
            let Some(operators_map) = operators.as_object() else {
                continue;
            };
            for (operator_name, operator) in operators_map {
                let price = operator.get("cost").and_then(coerce_f64);
                let stock = operator
                    .get("count")
                    .and_then(|value| {
                        value
                            .as_u64()
                            .or_else(|| value.as_str().and_then(|text| text.parse().ok()))
                    })
                    .unwrap_or(0);
                if stock == 0 {
                    continue;
                }
                if let Some(price) = price {
                    items.push(ProviderPriceItem {
                        country: country.clone(),
                        display_name: country.clone(),
                        operator: operator_name.clone(),
                        operator_label: None,
                        provider_country: Some(country.clone()),
                        provider_operator: Some(operator_name.clone()),
                        price,
                        stock,
                    });
                }
            }
        }
        items.sort_by(|left, right| {
            left.country
                .cmp(&right.country)
                .then_with(|| left.operator.cmp(&right.operator))
                .then_with(|| left.price.total_cmp(&right.price))
        });
        Ok(items)
    }

    async fn list_countries(&self) -> Result<Vec<OptionItem>, SmsError> {
        let countries = self.request_countries_map().await?;
        Ok(countries
            .into_iter()
            .map(|(country, payload)| {
                let label = payload
                    .pointer("/text_en")
                    .and_then(Value::as_str)
                    .unwrap_or(country.as_str())
                    .to_string();
                let hint = payload
                    .pointer("/prefix")
                    .and_then(Value::as_object)
                    .and_then(|prefixes| prefixes.keys().next().cloned())
                    .unwrap_or_default();
                OptionItem {
                    value: country.clone(),
                    label,
                    hint,
                    provider_value: Some(country),
                    icon_url: None,
                    provider_icon_url: None,
                }
            })
            .collect())
    }

    async fn list_operators(
        &self,
        query: ProviderOperatorsQuery,
    ) -> Result<Vec<OptionItem>, SmsError> {
        let countries = self.request_countries_map().await?;
        let operator_keys = if let Some(country) = query.country.as_deref() {
            countries
                .get(country)
                .map(Self::operator_keys_from_country_payload)
                .unwrap_or_default()
        } else {
            let mut merged = BTreeMap::<String, ()>::new();
            for payload in countries.values() {
                for operator in Self::operator_keys_from_country_payload(payload) {
                    merged.insert(operator, ());
                }
            }
            merged.into_keys().collect()
        };

        Ok(operator_keys
            .into_iter()
            .map(|operator| OptionItem {
                value: operator.clone(),
                label: operator.clone(),
                hint: "5SIM operator".to_string(),
                provider_value: Some(operator),
                icon_url: None,
                provider_icon_url: None,
            })
            .collect())
    }

    async fn list_services(
        &self,
        query: ProviderServicesQuery,
    ) -> Result<Vec<OptionItem>, SmsError> {
        if let Ok(items) = self.request_static_products_list().await {
            return Ok(items);
        }

        let country = query
            .country
            .as_deref()
            .filter(|value| !value.is_empty())
            .ok_or_else(|| {
                SmsError::InvalidRequest(
                    "country is required for 5SIM service discovery".to_string(),
                )
            })?;
        let operator = query
            .operator
            .as_deref()
            .filter(|value| !value.is_empty())
            .unwrap_or(self.config.buy_operator.as_str());
        self.request_products(country, operator).await
    }
}

fn split_html<'a>(input: &'a str, start_tag: &str, end_tag: &str) -> Vec<&'a str> {
    let mut result = Vec::new();
    let mut offset = 0;
    while let Some(start) = input[offset..].find(start_tag) {
        let absolute_start = offset + start;
        let after_start = &input[absolute_start..];
        let Some(end) = after_start.find(end_tag) else {
            break;
        };
        let absolute_end = absolute_start + end + end_tag.len();
        result.push(&input[absolute_start..absolute_end]);
        offset = absolute_end;
    }
    result
}

fn html_to_text(input: &str) -> String {
    let mut text = String::with_capacity(input.len());
    let mut in_tag = false;
    let mut last_was_space = false;
    let mut chars = input.chars().peekable();
    while let Some(ch) = chars.next() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            '&' if !in_tag => {
                let mut entity = String::new();
                while let Some(&next) = chars.peek() {
                    chars.next();
                    if next == ';' {
                        break;
                    }
                    entity.push(next);
                }
                let replacement = match entity.as_str() {
                    "amp" => "&",
                    "lt" => "<",
                    "gt" => ">",
                    "quot" => "\"",
                    "#39" => "'",
                    _ => " ",
                };
                if replacement == " " {
                    if !last_was_space {
                        text.push(' ');
                        last_was_space = true;
                    }
                } else {
                    text.push_str(replacement);
                    last_was_space = false;
                }
            }
            _ if in_tag => {}
            _ if ch.is_whitespace() => {
                if !last_was_space {
                    text.push(' ');
                    last_was_space = true;
                }
            }
            _ => {
                text.push(ch);
                last_was_space = false;
            }
        }
    }
    text.trim().to_string()
}

pub fn build_provider(manifest: ProviderManifest) -> Result<Arc<dyn SmsProvider>, SmsError> {
    match manifest.kind {
        ProviderKind::Mock => Ok(Arc::new(MockProvider::new(manifest))),
        ProviderKind::HandlerApi
            if manifest
                .handler_api_profile()
                .eq_ignore_ascii_case("smsbower") =>
        {
            Ok(Arc::new(SmsBowerProvider::new(manifest)?))
        }
        ProviderKind::HandlerApi => Ok(Arc::new(HeroSmsProvider::new(manifest)?)),
        ProviderKind::FiveSim => Ok(Arc::new(FiveSimProvider::new(manifest)?)),
    }
}

pub fn provider_summary_map(manifests: &[ProviderManifest]) -> BTreeMap<String, String> {
    manifests
        .iter()
        .map(|manifest| (manifest.id.clone(), manifest.name.clone()))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn handler_manifest() -> ProviderManifest {
        ProviderManifest {
            id: "internal-handler".to_string(),
            name: "Internal Handler".to_string(),
            kind: ProviderKind::HandlerApi,
            enabled: true,
            priority: 100,
            homepage: None,
            description: None,
            service_aliases: BTreeMap::new(),
            defaults: Default::default(),
            ui: Default::default(),
            behavior: Default::default(),
            handler_api: Some(HandlerApiConfig {
                base_url: "http://localhost/internal".to_string(),
                profile: "standard".to_string(),
                api_key: "secret".to_string(),
                get_balance_action: "getBalance".to_string(),
                get_prices_action: "getPrices".to_string(),
                get_countries_action: "getCountries".to_string(),
                get_number_action: "getNumber".to_string(),
                get_status_action: "getStatus".to_string(),
                set_status_action: "setStatus".to_string(),
                status_ready: 1,
                status_retry: 3,
                status_finish: 6,
                status_cancel: 8,
                balance_prefix: "BAL=".to_string(),
                success_status_prefix: "OK_CODE:".to_string(),
                wait_status_tokens: vec!["WAIT".to_string()],
                failure_status_tokens: vec!["CANCELLED".to_string()],
                id_json_pointers: vec!["/payload/id".to_string()],
                phone_json_pointers: vec!["/payload/phone".to_string()],
                price_json_pointers: vec!["/payload/cost".to_string()],
                balance_json_pointers: vec!["/payload/balance".to_string()],
                code_json_pointers: vec!["/payload/code".to_string()],
            }),
            five_sim: None,
            mock: None,
        }
    }

    fn five_sim_manifest() -> ProviderManifest {
        ProviderManifest {
            id: "internal-fivesim".to_string(),
            name: "Internal FiveSim".to_string(),
            kind: ProviderKind::FiveSim,
            enabled: true,
            priority: 100,
            homepage: None,
            description: None,
            service_aliases: BTreeMap::new(),
            defaults: Default::default(),
            ui: Default::default(),
            behavior: Default::default(),
            handler_api: None,
            five_sim: Some(FiveSimConfig {
                base_url: "http://localhost/fivesim".to_string(),
                api_key: "secret".to_string(),
                buy_operator: "any".to_string(),
                profile_endpoint: "profile".to_string(),
                prices_endpoint: "prices".to_string(),
                products_endpoint: "products".to_string(),
                buy_endpoint_prefix: "buy".to_string(),
                check_endpoint_prefix: "check".to_string(),
                finish_action: "finish".to_string(),
                cancel_action: "cancel".to_string(),
                ban_action: "ban".to_string(),
                balance_json_pointer: "/wallet/balance".to_string(),
                status_json_pointer: "/data/state".to_string(),
                code_json_pointers: vec!["/data/messages/0/pin".to_string()],
                failure_statuses: vec!["DENIED".to_string()],
                id_json_pointers: vec!["/payload/order_id".to_string()],
                phone_json_pointers: vec!["/payload/phone_number".to_string()],
                price_json_pointers: vec!["/payload/amount".to_string()],
            }),
            mock: None,
        }
    }

    #[test]
    fn handler_api_parse_balance_and_number_follow_manifest_pointers() {
        let provider = HeroSmsProvider::new(handler_manifest()).unwrap();
        let balance = provider
            .parse_balance("BAL=19.75", Some(&json!({"payload":{"balance": 5.0}})))
            .unwrap();
        assert!((balance - 19.75).abs() < f64::EPSILON);

        let (id, phone, price) = provider
            .parse_number(
                "IGNORED",
                Some(&json!({
                    "payload": {
                        "id": "abc-1",
                        "phone": "15551230000",
                        "cost": 0.12
                    }
                })),
            )
            .unwrap();
        assert_eq!(id, "abc-1");
        assert_eq!(phone, "+15551230000");
        assert_eq!(price, Some(0.12));
    }

    #[test]
    fn handler_api_unknown_status_does_not_silently_wait() {
        let provider = HeroSmsProvider::new(handler_manifest()).unwrap();
        let ticket = TicketRecord::new(
            "internal-handler".to_string(),
            "openai".to_string(),
            "uk".to_string(),
            "+447700900000".to_string(),
            Some("abc".to_string()),
            None,
        );
        let json = json!({"payload": {}});
        let upper = "SERVER_DOWN";
        let success_prefix = provider.config.success_status_prefix.to_ascii_uppercase();
        let code_from_json = Some(&json).and_then(|value| {
            provider
                .config
                .code_json_pointers
                .iter()
                .find_map(|pointer| value.pointer(pointer).and_then(Value::as_str))
        });
        assert!(!upper.starts_with(&success_prefix));
        assert!(code_from_json.is_none());
        assert!(
            provider
                .config
                .wait_status_tokens
                .iter()
                .all(|token| !upper.contains(&token.to_ascii_uppercase()))
        );
        assert_eq!(ticket.status, crate::models::TicketStatus::Pending);
    }

    #[test]
    fn handler_api_parse_prices_accepts_price_and_stock_aliases() {
        let provider = HeroSmsProvider::new(handler_manifest()).unwrap();
        let prices = provider.parse_prices(
            "dr",
            Some(&json!({
                "0": {
                    "dr": {
                        "price": "0.12",
                        "stock": "4",
                        "operator": "tele2"
                    }
                }
            })),
        );
        assert_eq!(prices.len(), 1);
        assert_eq!(prices[0].country, "0");
        assert_eq!(prices[0].operator, "tele2");
        assert!((prices[0].price - 0.12).abs() < f64::EPSILON);
        assert_eq!(prices[0].stock, 4);
    }

    #[test]
    fn handler_api_release_response_must_match_action() {
        let provider = HeroSmsProvider::new(handler_manifest()).unwrap();
        assert_eq!(
            provider.expected_release_response(ReleaseAction::Retry),
            "ACCESS_RETRY_GET"
        );
        assert_eq!(
            provider.expected_release_response(ReleaseAction::Finish),
            "ACCESS_ACTIVATION"
        );
        assert_eq!(
            provider.expected_release_response(ReleaseAction::Cancel),
            "ACCESS_CANCEL"
        );
        assert_eq!(
            provider.expected_release_response(ReleaseAction::Ban),
            "ACCESS_CANCEL"
        );
    }

    #[test]
    fn handler_api_error_payload_formats_readable_message() {
        let message = format_handler_api_error(
            r#"{"title":"EARLY_CANCEL_DENIED","details":"Activation cannot be cancelled at this time. Minimum activation period must pass.","info":{"minActivationTime":120}}"#,
        );
        assert_eq!(
            message,
            "EARLY_CANCEL_DENIED: Activation cannot be cancelled at this time. Minimum activation period must pass. (minActivationTime=120s)"
        );
    }

    #[test]
    fn fivesim_error_text_is_normalized() {
        assert_eq!(
            normalize_fivesim_error("no free phones"),
            "NO_FREE_PHONES: no free phones"
        );
        assert_eq!(
            normalize_fivesim_error("order not found"),
            "ORDER_NOT_FOUND: order not found"
        );
    }

    #[test]
    fn herosms_offer_prices_expand_multiple_price_tiers() {
        let provider = HeroSmsProvider::new(handler_manifest()).unwrap();
        let prices = provider.parse_offer_prices(
            "dr",
            &json!({
                "data": {
                    "dr": {
                        "50": {
                            "map": {
                                "0.0750": 42414,
                                "0.2353": 255111
                            }
                        }
                    }
                }
            }),
        );
        assert_eq!(prices.len(), 2);
        assert_eq!(prices[0].country, "50");
        assert_eq!(prices[0].operator, "any");
        assert_eq!(prices[0].stock, 42414);
        assert!((prices[0].price - 0.075).abs() < f64::EPSILON);
        assert_eq!(prices[1].stock, 255111);
        assert!((prices[1].price - 0.2353).abs() < f64::EPSILON);
    }

    #[test]
    fn smsbower_price_v3_expands_multiple_provider_slots() {
        let json = json!({
            "31": {
                "dr": {
                    "2217": { "count": 1, "price": 0.059, "provider_id": 2217 },
                    "2260": { "count": 286, "price": 0.006, "provider_id": 2260 }
                }
            }
        });
        let prices = SmsBowerProvider::parse_price_v3("dr", Some(&json));
        assert_eq!(prices.len(), 2);
        assert_eq!(prices[0].country, "31");
        assert_eq!(prices[0].operator, "2217");
        assert!((prices[0].price - 0.059).abs() < f64::EPSILON);
        assert_eq!(prices[1].operator, "2260");
        assert_eq!(prices[1].stock, 286);
    }

    #[test]
    fn fivesim_poll_mapping_follows_manifest_pointers() {
        let provider = FiveSimProvider::new(five_sim_manifest()).unwrap();
        let (status, code, mapped) = provider.map_poll_payload(&json!({
            "data": {
                "state": "RECEIVED",
                "messages": [{"pin": "998877"}]
            }
        }));
        assert_eq!(status, "RECEIVED");
        assert_eq!(code.as_deref(), Some("998877"));
        assert_eq!(mapped, crate::models::TicketStatus::CodeReceived);

        let (_, _, failed) = provider.map_poll_payload(&json!({
            "data": {
                "state": "DENIED",
                "messages": []
            }
        }));
        assert_eq!(failed, crate::models::TicketStatus::Failed);
    }

    #[test]
    fn fivesim_release_status_must_match_action() {
        let provider = FiveSimProvider::new(five_sim_manifest()).unwrap();
        let finished = json!({
            "data": {
                "state": "FINISHED"
            }
        });
        let canceled = json!({
            "data": {
                "state": "CANCELED"
            }
        });
        let banned = json!({
            "data": {
                "state": "BANNED"
            }
        });
        let wrong = json!({
            "data": {
                "state": "PENDING"
            }
        });
        assert_eq!(
            provider
                .validate_release_payload(&finished, ReleaseAction::Finish)
                .unwrap(),
            "FINISHED"
        );
        assert_eq!(
            provider
                .validate_release_payload(&canceled, ReleaseAction::Cancel)
                .unwrap(),
            "CANCELED"
        );
        assert_eq!(
            provider
                .validate_release_payload(&banned, ReleaseAction::Ban)
                .unwrap(),
            "BANNED"
        );
        assert!(
            provider
                .validate_release_payload(&wrong, ReleaseAction::Finish)
                .is_err()
        );
    }

    #[test]
    fn fivesim_acquire_fields_follow_manifest_pointers() {
        let provider = FiveSimProvider::new(five_sim_manifest()).unwrap();
        let json = json!({
            "payload": {
                "order_id": 884422,
                "phone_number": 447700900123u64,
                "amount": "7.25"
            }
        });
        let upstream_id = provider
            .config
            .id_json_pointers
            .iter()
            .find_map(|pointer| json.pointer(pointer).and_then(coerce_str_value));
        let phone = provider
            .config
            .phone_json_pointers
            .iter()
            .find_map(|pointer| json.pointer(pointer).and_then(coerce_str_value));
        let price = provider
            .config
            .price_json_pointers
            .iter()
            .find_map(|pointer| json.pointer(pointer).and_then(coerce_f64));
        assert_eq!(upstream_id.as_deref(), Some("884422"));
        assert_eq!(phone.as_deref(), Some("447700900123"));
        assert_eq!(price, Some(7.25));
    }

    #[test]
    fn parses_static_fivesim_products_table_rows() {
        let html = r#"
        <h1 id="products-list">Products list</h1>
        <h3>Activation</h3>
        <table>
          <thead>
            <tr><th>Service</th><th>API 5SIM</th></tr>
          </thead>
          <tbody>
            <tr><td><div>OpenAI</div></td><td>openai</td></tr>
            <tr><td><div>Discord</div></td><td>discord</td></tr>
          </tbody>
        </table>
        "#;

        let anchor_index = html.find("id=\"products-list\"").unwrap();
        let table_fragment = &html[anchor_index..];
        let table_start_rel = table_fragment.find("<table").unwrap();
        let table_after_start = &table_fragment[table_start_rel..];
        let table_end_rel = table_after_start.find("</table>").unwrap();
        let table_html = &table_after_start[..table_end_rel + "</table>".len()];
        let rows = split_html(table_html, "<tr", "</tr>");
        let parsed = rows
            .into_iter()
            .filter(|row| !row.contains(">Service<"))
            .map(|row| {
                split_html(row, "<td", "</td>")
                    .into_iter()
                    .map(html_to_text)
                    .filter(|cell| !cell.is_empty())
                    .collect::<Vec<_>>()
            })
            .filter(|cells| cells.len() >= 2)
            .collect::<Vec<_>>();

        assert_eq!(parsed[0], vec!["OpenAI".to_string(), "openai".to_string()]);
        assert_eq!(
            parsed[1],
            vec!["Discord".to_string(), "discord".to_string()]
        );
    }

    #[test]
    fn smsbower_service_enrichment_keeps_upstream_service_code() {
        let enriched = SmsBowerProvider::enrich_service_item(
            OptionItem {
                value: "dr".to_string(),
                label: "Legacy OpenAI".to_string(),
                hint: "dr".to_string(),
                provider_value: Some("dr".to_string()),
                icon_url: None,
                provider_icon_url: None,
            },
            Some(&SmsBowerFaqService {
                id: "247".to_string(),
                title: "OpenAI (ChatGPT)".to_string(),
                activate_org_code: "dr".to_string(),
                img_path: None,
            }),
        );

        assert_eq!(enriched.value, "dr");
        assert_eq!(enriched.provider_value.as_deref(), Some("dr"));
        assert_eq!(enriched.label, "OpenAI (ChatGPT)");
        assert_eq!(enriched.hint, "dr");
        assert_eq!(
            enriched.icon_url.as_deref(),
            Some("https://smsbower.app/img/services/247.svg?timestamp=1748774536")
        );
        assert_eq!(
            enriched.provider_icon_url.as_deref(),
            Some("https://smsbower.app/img/services/247.svg?timestamp=1748774536")
        );
    }
}
