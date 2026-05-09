use crate::error::SmsError;
use reqwest::Client;
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Debug, Clone)]
pub struct SmsBowerFaqService {
    pub id: String,
    pub title: String,
    pub activate_org_code: String,
    pub img_path: Option<String>,
}

#[derive(Debug, Clone)]
pub struct SmsBowerFaqCountry {
    pub id: String,
    pub activate_org_code: String,
    pub iso_code: Option<String>,
    pub label: String,
    pub hint: String,
    pub icon_url: String,
}

fn normalize_img_path(path: &str) -> String {
    if path.starts_with("http://") || path.starts_with("https://") {
        path.to_string()
    } else {
        format!("https://smsbower.app{}", path)
    }
}

fn decode_html_attr_json(encoded: &str) -> String {
  encoded
    .replace("&quot;", "\"")
    .replace("&#34;", "\"")
    .replace("&amp;", "&")
    .replace("&#39;", "'")
}

fn extract_component_attr_json(html: &str, marker: &str, attr: &str) -> Result<Value, SmsError> {
    let Some(start) = html.find(marker) else {
        return Err(SmsError::Upstream(format!(
            "smsbower faq component `{marker}` not found"
        )));
    };
    let fragment = &html[start..];
    let Some(attr_start) = fragment.find(attr) else {
        return Err(SmsError::Upstream(format!(
            "smsbower faq attr `{attr}` not found"
        )));
    };
    let payload_start = start + attr_start + attr.len();
    let rest = &html[payload_start..];
    let Some(attr_end) = rest.find('"') else {
        return Err(SmsError::Upstream(format!(
            "smsbower faq attr `{attr}` unterminated"
        )));
    };
    let raw_json = decode_html_attr_json(&rest[..attr_end]);
    serde_json::from_str::<Value>(&raw_json)
        .map_err(|err| SmsError::Upstream(format!("smsbower faq json parse failed: {err}")))
}

async fn fetch_faq_html(client: &Client) -> Result<String, SmsError> {
    let response = client
        .get("https://smsbower.app/api/?page=client")
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
            "smsbower faq request failed: {}",
            status
        )));
    }
    Ok(html)
}

pub fn country_icon_url(country_key: &str) -> String {
    format!("https://smsbower.app/img/svg/countries/{country_key}.svg?v=2")
}

pub fn fallback_service_icon_url(service_id: &str) -> String {
    format!("https://smsbower.app/img/services/{service_id}.svg?timestamp=1748774536")
}

pub async fn fetch_faq_services_map(
    client: &Client,
) -> Result<BTreeMap<String, SmsBowerFaqService>, SmsError> {
    let html = fetch_faq_html(client).await?;
    let payload = extract_component_attr_json(&html, "<api-service", ":services=\"")?;
    let items = payload.as_array().cloned().unwrap_or_default();
    let mut map = BTreeMap::new();
    for item in items {
        let Some(code) = item.get("activate_org_code").and_then(coerce_str_value) else {
            continue;
        };
        let Some(id) = item.get("id").and_then(coerce_str_value) else {
            continue;
        };
        let title = item
            .get("title")
            .and_then(Value::as_str)
            .unwrap_or(code.as_str())
            .to_string();
        let img_path = item
            .get("img_path")
            .and_then(Value::as_str)
            .map(normalize_img_path);
        map.insert(code.clone(), SmsBowerFaqService {
            id,
            title,
            activate_org_code: code,
            img_path,
        });
    }
    Ok(map)
}

pub async fn fetch_faq_countries_map(
    client: &Client,
) -> Result<BTreeMap<String, SmsBowerFaqCountry>, SmsError> {
    let html = fetch_faq_html(client).await?;
    let payload = extract_component_attr_json(&html, "<api-country", ":countries=\"")?;
    let items = payload.as_array().cloned().unwrap_or_default();
    let mut map = BTreeMap::new();
    for item in items {
        let Some(id) = item.get("id").and_then(coerce_str_value) else {
            continue;
        };
        let Some(code) = item
            .get("activate_org_code")
            .and_then(coerce_str_value)
            .or_else(|| Some(id.clone()))
        else {
            continue;
        };
        let label = item
            .get("title")
            .and_then(Value::as_str)
            .or_else(|| item.get("eng").and_then(Value::as_str))
            .unwrap_or(id.as_str())
            .to_string();
        let iso_code = item
            .get("iso")
            .and_then(coerce_str_value)
            .map(|value| value.trim().to_ascii_lowercase());
        let hint = item
            .get("prefix")
            .and_then(coerce_str_value)
            .or_else(|| item.get("eng").and_then(coerce_str_value))
            .unwrap_or_else(|| code.clone());
        let icon_url = country_icon_url(iso_code.as_deref().unwrap_or(&id));
        map.insert(code.clone(), SmsBowerFaqCountry {
            id,
            activate_org_code: code,
            iso_code,
            label,
            hint,
            icon_url,
        });
    }
    Ok(map)
}

fn coerce_str_value(value: &Value) -> Option<String> {
    value
        .as_str()
        .map(ToOwned::to_owned)
        .or_else(|| value.as_i64().map(|n| n.to_string()))
        .or_else(|| value.as_u64().map(|n| n.to_string()))
}
