use crate::error::SmsError;
use crate::models::{
    AcquireCodeRequest, PollCodeResponse, ProviderBalance, ProviderPriceItem, ReleaseAction, TicketRecord,
};
use async_trait::async_trait;
use plugin_sdk::{FiveSimConfig, HandlerApiConfig, MockConfig, ProviderKind, ProviderManifest};
use reqwest::Client;
use serde_json::Value;
use std::collections::BTreeMap;
use std::sync::Arc;

#[async_trait]
pub trait SmsProvider: Send + Sync {
    fn manifest(&self) -> &ProviderManifest;

    async fn acquire(&self, request: &AcquireCodeRequest) -> Result<TicketRecord, SmsError>;

    async fn poll_code(&self, ticket: &TicketRecord) -> Result<PollCodeResponse, SmsError>;

    async fn release(&self, ticket: &TicketRecord, action: ReleaseAction) -> Result<String, SmsError>;

    async fn get_balance(&self) -> Result<ProviderBalance, SmsError>;

    async fn get_prices(&self, service: Option<&str>) -> Result<Vec<ProviderPriceItem>, SmsError>;
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
        let service = self.manifest.resolve_service_alias(request.service.as_deref());
        let country = self.manifest.resolved_country_hint(request.country.as_deref());
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
        let code = self.config.codes.first().cloned().unwrap_or_else(|| "123456".to_string());
        Ok(PollCodeResponse {
            ticket_id: ticket.id.clone(),
            provider: self.manifest.id.clone(),
            status: crate::models::TicketStatus::CodeReceived,
            code: Some(code),
            message: Some("mock code ready".to_string()),
            next_retry_after_ms: None,
        })
    }

    async fn release(&self, _ticket: &TicketRecord, action: ReleaseAction) -> Result<String, SmsError> {
        Ok(format!("mock release {action:?}"))
    }

    async fn get_balance(&self) -> Result<ProviderBalance, SmsError> {
        Ok(ProviderBalance {
            provider: self.manifest.id.clone(),
            amount: self.config.balance,
            currency: "USD".to_string(),
        })
    }

    async fn get_prices(&self, service: Option<&str>) -> Result<Vec<ProviderPriceItem>, SmsError> {
        let resolved = self.manifest.resolve_service_alias(service);
        Ok(vec![ProviderPriceItem {
            country: self.manifest.defaults.country.clone(),
            display_name: "Mock Country".to_string(),
            price: 0.0,
            stock: 99,
        }])
        .map(|mut items| {
            items[0].display_name = format!("Mock for {resolved}");
            items
        })
    }
}

pub struct HandlerApiProvider {
    manifest: ProviderManifest,
    client: Client,
    config: HandlerApiConfig,
}

impl HandlerApiProvider {
    pub fn new(manifest: ProviderManifest) -> Result<Self, SmsError> {
        let config = manifest
            .handler_api
            .clone()
            .ok_or_else(|| SmsError::Config(format!("provider `{}` missing handler_api config", manifest.id)))?;
        Ok(Self {
            manifest,
            client: Client::new(),
            config,
        })
    }

    async fn request(&self, action: &str, extra: &[(&str, String)]) -> Result<(String, Option<Value>), SmsError> {
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
            return Err(SmsError::Upstream(text));
        }
        let json = serde_json::from_str::<Value>(&text).ok();
        Ok((text, json))
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
                if let Some(number) = json.pointer(pointer).and_then(Value::as_f64) {
                    return Ok(number);
                }
            }
        }
        Err(SmsError::Upstream("unable to parse balance".to_string()))
    }

    fn parse_prices(&self, service: &str, json: Option<&Value>) -> Vec<ProviderPriceItem> {
        let mut items = Vec::new();
        let Some(Value::Object(map)) = json else {
            return items;
        };
        for (country, entry) in map {
            let Some(country_id) = country.parse::<u64>().ok() else {
                continue;
            };
            let price_node = entry.get(service).unwrap_or(entry);
            let Some(price_obj) = price_node.as_object() else {
                continue;
            };
            let Some(price) = price_obj.get("cost").and_then(Value::as_f64) else {
                continue;
            };
            let stock = price_obj.get("count").and_then(Value::as_u64).unwrap_or(0);
            if stock == 0 {
                continue;
            }
            items.push(ProviderPriceItem {
                country: country_id.to_string(),
                display_name: format!("Country {country_id}"),
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
            let upstream_id = self
                .config
                .id_json_pointers
                .iter()
                .find_map(|pointer| json.pointer(pointer).and_then(Value::as_str))
                .unwrap_or_default()
                .to_string();
            let phone = self
                .config
                .phone_json_pointers
                .iter()
                .find_map(|pointer| json.pointer(pointer).and_then(Value::as_str))
                .unwrap_or_default()
                .to_string();
            if !upstream_id.is_empty() && !phone.is_empty() {
                let normalized = if phone.starts_with('+') {
                    phone
                } else {
                    format!("+{phone}")
                };
                let price = self
                    .config
                    .price_json_pointers
                    .iter()
                    .find_map(|pointer| json.pointer(pointer).and_then(Value::as_f64));
                return Ok((upstream_id, normalized, price));
            }
        }
        Err(SmsError::Upstream(text.to_string()))
    }
}

#[async_trait]
impl SmsProvider for HandlerApiProvider {
    fn manifest(&self) -> &ProviderManifest {
        &self.manifest
    }

    async fn acquire(&self, request: &AcquireCodeRequest) -> Result<TicketRecord, SmsError> {
        let service = self.manifest.resolve_service_alias(request.service.as_deref());
        let country = self.manifest.resolved_country_hint(request.country.as_deref());
        let mut params = vec![("service", service.clone()), ("country", country.clone())];
        if let Some(max_price) = request.max_price.or(Some(self.manifest.defaults.max_price)).filter(|v| *v > 0.0) {
            params.push(("maxPrice", max_price.to_string()));
        }
        if let Some(min_price) = request.min_price.or(Some(self.manifest.defaults.min_price)).filter(|v| *v > 0.0) {
            params.push(("minPrice", min_price.to_string()));
        }
        let (text, json) = self.request(&self.config.get_number_action, &params).await?;
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
        if upper.starts_with(&success_prefix) {
            let code = text
                .split_once(':')
                .map(|(_, value)| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .or_else(|| {
                    json.as_ref()
                        .and_then(|value| {
                            self.config
                                .code_json_pointers
                                .iter()
                                .find_map(|pointer| value.pointer(pointer).and_then(Value::as_str))
                        })
                        .map(ToOwned::to_owned)
                });
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
        Ok(PollCodeResponse {
            ticket_id: ticket.id.clone(),
            provider: ticket.provider.clone(),
            status: crate::models::TicketStatus::WaitingCode,
            code: None,
            message: Some(text),
            next_retry_after_ms: Some(3000),
        })
    }

    async fn release(&self, ticket: &TicketRecord, action: ReleaseAction) -> Result<String, SmsError> {
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

    async fn get_prices(&self, service: Option<&str>) -> Result<Vec<ProviderPriceItem>, SmsError> {
        let service = self.manifest.resolve_service_alias(service);
        let (_text, json) = self
            .request(&self.config.get_prices_action, &[("service", service.clone())])
            .await?;
        Ok(self.parse_prices(&service, json.as_ref()))
    }
}

pub struct FiveSimProvider {
    manifest: ProviderManifest,
    client: Client,
    config: FiveSimConfig,
}

impl FiveSimProvider {
    pub fn new(manifest: ProviderManifest) -> Result<Self, SmsError> {
        let config = manifest
            .five_sim
            .clone()
            .ok_or_else(|| SmsError::Config(format!("provider `{}` missing five_sim config", manifest.id)))?;
        Ok(Self {
            manifest,
            client: Client::new(),
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
            return Err(SmsError::Upstream(text));
        }
        let json = serde_json::from_str::<Value>(&text)
            .map_err(|err| SmsError::Upstream(format!("invalid json: {err}")))?;
        Ok((text, json))
    }

    fn map_poll_payload(&self, json: &Value) -> (String, Option<String>, crate::models::TicketStatus) {
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
            "RECEIVED" | "PENDING" if sms_code.is_some() => crate::models::TicketStatus::CodeReceived,
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
}

#[async_trait]
impl SmsProvider for FiveSimProvider {
    fn manifest(&self) -> &ProviderManifest {
        &self.manifest
    }

    async fn acquire(&self, request: &AcquireCodeRequest) -> Result<TicketRecord, SmsError> {
        let service = self.manifest.resolve_service_alias(request.service.as_deref());
        let country = self.manifest.resolved_country_hint(request.country.as_deref());
        let endpoint = format!(
            "{}/{}/{}/{}",
            self.config.buy_endpoint_prefix.trim_end_matches('/'),
            country,
            self.config.buy_operator,
            service
        );
        let mut params = Vec::new();
        if let Some(max_price) = request.max_price.or(Some(self.manifest.defaults.max_price)).filter(|v| *v > 0.0) {
            params.push(("maxPrice", max_price.to_string()));
        }
        if request.reuse_phone.or(Some(self.manifest.defaults.reuse_phone)).unwrap_or(false) {
            params.push(("reuse", "1".to_string()));
        }
        let (_text, json) = self.request_get(&endpoint, &params).await?;
        let upstream_id = json
            .pointer("/id")
            .and_then(Value::as_i64)
            .map(|value| value.to_string())
            .ok_or_else(|| SmsError::Upstream("missing 5SIM order id".to_string()))?;
        let phone = json
            .pointer("/phone")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned)
            .ok_or_else(|| SmsError::Upstream("missing 5SIM phone".to_string()))?;
        let price = json.pointer("/price").and_then(Value::as_f64);
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
            next_retry_after_ms: if should_retry {
                Some(3000)
            } else {
                None
            },
        })
    }

    async fn release(&self, ticket: &TicketRecord, action: ReleaseAction) -> Result<String, SmsError> {
        let upstream_id = ticket
            .upstream_id
            .clone()
            .ok_or_else(|| SmsError::InvalidRequest("ticket missing upstream_id".to_string()))?;
        let verb = match action {
            ReleaseAction::Finish => self.config.finish_action.as_str(),
            ReleaseAction::Cancel => self.config.cancel_action.as_str(),
            ReleaseAction::Retry => self.config.cancel_action.as_str(),
            ReleaseAction::Ban => self.config.ban_action.as_str(),
        };
        let endpoint = format!("user/{verb}/{upstream_id}");
        let (text, _json) = self.request_get(&endpoint, &[]).await?;
        Ok(text)
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

    async fn get_prices(&self, service: Option<&str>) -> Result<Vec<ProviderPriceItem>, SmsError> {
        let service = self.manifest.resolve_service_alias(service);
        let endpoint = format!("{}?product={service}", self.config.prices_endpoint);
        let (_text, json) = self.request_get(&endpoint, &[]).await?;
        let mut items = Vec::new();
        let root = json
            .get(&service)
            .and_then(Value::as_object)
            .ok_or_else(|| SmsError::Upstream("invalid 5SIM prices response".to_string()))?;
        for (country, operators) in root {
            let Some(operators_map) = operators.as_object() else {
                continue;
            };
            let mut min_price = None::<f64>;
            let mut stock_total = 0u64;
            for operator in operators_map.values() {
                let price = operator.get("cost").and_then(Value::as_f64);
                let stock = operator.get("count").and_then(Value::as_u64).unwrap_or(0);
                if stock > 0 {
                    stock_total += stock;
                    min_price = Some(match min_price {
                        Some(current) => current.min(price.unwrap_or(current)),
                        None => price.unwrap_or(0.0),
                    });
                }
            }
            if let Some(price) = min_price {
                items.push(ProviderPriceItem {
                    country: country.clone(),
                    display_name: country.clone(),
                    price,
                    stock: stock_total,
                });
            }
        }
        items.sort_by(|left, right| left.price.total_cmp(&right.price));
        Ok(items)
    }
}

pub fn build_provider(manifest: ProviderManifest) -> Result<Arc<dyn SmsProvider>, SmsError> {
    match manifest.kind {
        ProviderKind::Mock => Ok(Arc::new(MockProvider::new(manifest))),
        ProviderKind::HandlerApi => Ok(Arc::new(HandlerApiProvider::new(manifest)?)),
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
            homepage: None,
            description: None,
            service_aliases: BTreeMap::new(),
            defaults: Default::default(),
            handler_api: Some(HandlerApiConfig {
                base_url: "http://localhost/internal".to_string(),
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
            homepage: None,
            description: None,
            service_aliases: BTreeMap::new(),
            defaults: Default::default(),
            handler_api: None,
            five_sim: Some(FiveSimConfig {
                base_url: "http://localhost/fivesim".to_string(),
                api_key: "secret".to_string(),
                buy_operator: "any".to_string(),
                profile_endpoint: "profile".to_string(),
                prices_endpoint: "prices".to_string(),
                buy_endpoint_prefix: "buy".to_string(),
                check_endpoint_prefix: "check".to_string(),
                finish_action: "finish".to_string(),
                cancel_action: "cancel".to_string(),
                ban_action: "ban".to_string(),
                balance_json_pointer: "/wallet/balance".to_string(),
                status_json_pointer: "/data/state".to_string(),
                code_json_pointers: vec!["/data/messages/0/pin".to_string()],
                failure_statuses: vec!["DENIED".to_string()],
            }),
            mock: None,
        }
    }

    #[test]
    fn handler_api_parse_balance_and_number_follow_manifest_pointers() {
        let provider = HandlerApiProvider::new(handler_manifest()).unwrap();
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
}
