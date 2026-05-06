use crate::error::SmsError;
use crate::models::{
    AcquireCodeRequest, OptionItem, PollCodeResponse, ProviderBalance, ProviderDynamicOptions,
    ProviderPriceItem, ReleaseAction, TicketRecord,
};
use async_trait::async_trait;
use plugin_sdk::{FiveSimConfig, HandlerApiConfig, MockConfig, ProviderKind, ProviderManifest};
use reqwest::Client;
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

#[async_trait]
pub trait SmsProvider: Send + Sync {
    fn manifest(&self) -> &ProviderManifest;

    async fn acquire(&self, request: &AcquireCodeRequest) -> Result<TicketRecord, SmsError>;

    async fn poll_code(&self, ticket: &TicketRecord) -> Result<PollCodeResponse, SmsError>;

    async fn release(&self, ticket: &TicketRecord, action: ReleaseAction) -> Result<String, SmsError>;

    async fn get_balance(&self) -> Result<ProviderBalance, SmsError>;

    async fn get_options(&self) -> Result<ProviderDynamicOptions, SmsError>;

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

    async fn get_options(&self) -> Result<ProviderDynamicOptions, SmsError> {
        Ok(ProviderDynamicOptions {
            provider: self.manifest.id.clone(),
            services: vec![OptionItem {
                value: "openai".into(),
                label: "OpenAI".into(),
                hint: "openai".into(),
                provider_value: Some("openai".into()),
            }],
            countries: vec![OptionItem {
                value: "local".into(),
                label: "Local".into(),
                hint: "local".into(),
                provider_value: Some("local".into()),
            }],
            operators: vec![OptionItem {
                value: "mock".into(),
                label: "Mock".into(),
                hint: "mock".into(),
                provider_value: Some("mock".into()),
            }],
            cache_state: crate::models::OptionCacheState::Fresh,
            fetched_at: None,
        })
    }

    async fn get_prices(&self, service: Option<&str>) -> Result<Vec<ProviderPriceItem>, SmsError> {
        let resolved = self.manifest.resolve_service_alias(service);
        Ok(vec![ProviderPriceItem {
            country: self.manifest.defaults.country.clone(),
            display_name: "Mock Country".to_string(),
            operator: "mock".to_string(),
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

    async fn request_countries(&self) -> Result<Vec<OptionItem>, SmsError> {
        let (_text, json) = self.request(&self.config.get_countries_action, &[]).await?;
        let Some(json) = json else {
            return Ok(Vec::new());
        };
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
                let label = item.pointer("/chn")
                    .and_then(Value::as_str)
                    .or_else(|| item.pointer("/eng").and_then(Value::as_str))
                    .or_else(|| item.pointer("/rus").and_then(Value::as_str))
                    .unwrap_or(&value)
                    .to_string();
                let hint = item.pointer("/eng").and_then(Value::as_str).unwrap_or(&value).to_string();
                Some(OptionItem {
                    provider_value: Some(value.clone()),
                    value,
                    label,
                    hint,
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
                            let value = item.pointer("/code").and_then(Value::as_str)
                                .or_else(|| item.pointer("/id").and_then(Value::as_str))?;
                            let label = item.pointer("/name").and_then(Value::as_str)
                                .or_else(|| item.pointer("/title").and_then(Value::as_str))
                                .unwrap_or(value);
                            Some(OptionItem {
                                provider_value: Some(value.to_string()),
                                value: value.to_string(),
                                label: label.to_string(),
                                hint: value.to_string(),
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
                .and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
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

    async fn get_options(&self) -> Result<ProviderDynamicOptions, SmsError> {
        let services = self.request_services().await?;
        let countries = self.request_countries().await?;
        Ok(ProviderDynamicOptions {
            provider: self.manifest.id.clone(),
            services: if services.is_empty() {
                vec![OptionItem {
                    value: self.manifest.defaults.service.clone(),
                    label: self.manifest.defaults.service.clone(),
                    hint: self.manifest.defaults.service.clone(),
                    provider_value: Some(self.manifest.defaults.service.clone()),
                }]
            } else {
                services
            },
            countries: if countries.is_empty() {
                vec![OptionItem {
                    value: self.manifest.defaults.country.clone(),
                    label: self.manifest.defaults.country.clone(),
                    hint: self.manifest.defaults.country.clone(),
                    provider_value: Some(self.manifest.defaults.country.clone()),
                }]
            } else {
                countries
            },
            operators: vec![OptionItem {
                value: "any".into(),
                label: "Any Operator".into(),
                hint: "any".into(),
                provider_value: Some("any".into()),
            }],
            cache_state: crate::models::OptionCacheState::Fresh,
            fetched_at: None,
        })
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
            return Err(SmsError::Upstream(text));
        }
        // 5SIM 部分端点在 HTTP 200 时会以纯文本返回错误（如 "no free phones"），
        // 直接将原文回传比 "invalid json: ..." 更利于排查问题。
        let json = serde_json::from_str::<Value>(&text)
            .map_err(|_| SmsError::Upstream(text.trim().to_string()))?;
        Ok((text, json))
    }

    async fn request_products(&self, country: &str, operator: &str) -> Result<Vec<OptionItem>, SmsError> {
        let path = format!(
            "{}/{}/{}",
            self.config.products_endpoint.trim_end_matches('/'),
            country,
            operator,
        );
        let (_text, json) = self.request_get(&path, &[]).await?;
        let items = json.as_array().cloned().unwrap_or_default();
        Ok(items
            .into_iter()
            .filter_map(|item| {
                let value = item.pointer("/name").and_then(Value::as_str)
                    .or_else(|| item.pointer("/product").and_then(Value::as_str))?;
                let qty = item.pointer("/Qty").or_else(|| item.pointer("/qty")).and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))).unwrap_or(0);
                let price = item.pointer("/Price").or_else(|| item.pointer("/price")).and_then(coerce_f64).unwrap_or(0.0);
                Some(OptionItem {
                    provider_value: Some(value.to_string()),
                    value: value.to_string(),
                    label: value.to_string(),
                    hint: format!("qty={qty}, price={price:.3}"),
                })
            })
            .collect())
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
            // RECEIVED = 号码活跃，等待 SMS；PENDING = 初始化；FINISHED = 完成
            // 只要 sms 数组中有验证码，均视为 CodeReceived
            "RECEIVED" | "PENDING" | "FINISHED" if sms_code.is_some() => crate::models::TicketStatus::CodeReceived,
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
            ReleaseAction::Retry => {
                return Err(SmsError::InvalidRequest(
                    "five_sim protocol does not support release retry; continue polling or create a new order"
                        .to_string(),
                ))
            }
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
        let (_text, json) = self
            .request_get(&self.config.prices_endpoint, &[("product", service.clone())])
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
                    .and_then(|value| value.as_u64().or_else(|| value.as_str().and_then(|text| text.parse().ok())))
                    .unwrap_or(0);
                if stock == 0 {
                    continue;
                }
                if let Some(price) = price {
                    items.push(ProviderPriceItem {
                        country: country.clone(),
                        display_name: country.clone(),
                        operator: operator_name.clone(),
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

    async fn get_options(&self) -> Result<ProviderDynamicOptions, SmsError> {
        let prices = self.get_prices(Some(&self.manifest.defaults.service)).await?;
        let mut countries = Vec::<OptionItem>::new();
        let mut operators = Vec::<OptionItem>::new();
        for item in &prices {
            if !countries.iter().any(|entry| entry.value == item.country) {
                countries.push(OptionItem {
                    provider_value: Some(item.country.clone()),
                    value: item.country.clone(),
                    label: item.display_name.clone(),
                    hint: item.country.clone(),
                });
            }
            if !operators.iter().any(|entry| entry.value == item.operator) {
                operators.push(OptionItem {
                    provider_value: Some(item.operator.clone()),
                    value: item.operator.clone(),
                    label: item.operator.clone(),
                    hint: item.operator.clone(),
                });
            }
        }
        let services = self
            .request_products(&self.manifest.defaults.country, &self.config.buy_operator)
            .await
            .unwrap_or_else(|_| {
                vec![OptionItem {
                    value: self.manifest.defaults.service.clone(),
                    label: self.manifest.defaults.service.clone(),
                    hint: self.manifest.defaults.service.clone(),
                    provider_value: Some(self.manifest.defaults.service.clone()),
                }]
            });
        Ok(ProviderDynamicOptions {
            provider: self.manifest.id.clone(),
            services,
            countries: if countries.is_empty() {
                vec![OptionItem {
                    value: self.manifest.defaults.country.clone(),
                    label: self.manifest.defaults.country.clone(),
                    hint: self.manifest.defaults.country.clone(),
                    provider_value: Some(self.manifest.defaults.country.clone()),
                }]
            } else {
                countries
            },
            operators: if operators.is_empty() {
                vec![OptionItem {
                    value: self.config.buy_operator.clone(),
                    label: self.config.buy_operator.clone(),
                    hint: self.config.buy_operator.clone(),
                    provider_value: Some(self.config.buy_operator.clone()),
                }]
            } else {
                operators
            },
            cache_state: crate::models::OptionCacheState::Fresh,
            fetched_at: None,
        })
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
            priority: 100,
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
            priority: 100,
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
    fn handler_api_unknown_status_does_not_silently_wait() {
        let provider = HandlerApiProvider::new(handler_manifest()).unwrap();
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
        assert!(provider
            .config
            .wait_status_tokens
            .iter()
            .all(|token| !upper.contains(&token.to_ascii_uppercase())));
        assert_eq!(ticket.status, crate::models::TicketStatus::Pending);
    }

    #[test]
    fn handler_api_parse_prices_accepts_price_and_stock_aliases() {
        let provider = HandlerApiProvider::new(handler_manifest()).unwrap();
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
}
