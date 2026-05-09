use crate::error::SmsError;
use crate::models::{
    OptionCacheOverview, OptionCacheState, OptionItem, ProviderDynamicOptions,
    ProviderOptionCacheEntry, ProviderPriceItem, ProviderRawOptionAuditEntry, RuntimeSettings,
};
use chrono::{DateTime, Duration, Utc};
use plugin_sdk::ProviderManifest;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProviderOptionCacheStore {
    pub entries: BTreeMap<String, ProviderOptionCacheEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProviderRawOptionAuditStore {
    pub entries: BTreeMap<String, ProviderRawOptionAuditEntry>,
}

pub fn load_option_cache_store(path: &Path) -> Result<ProviderOptionCacheStore, SmsError> {
    if !path.exists() {
        return Ok(ProviderOptionCacheStore::default());
    }
    let content = fs::read_to_string(path)
        .map_err(|err| SmsError::Io(format!("read provider option cache failed: {err}")))?;
    serde_json::from_str(&content)
        .map_err(|err| SmsError::Config(format!("parse provider option cache failed: {err}")))
}

pub fn save_option_cache_store(
    path: &Path,
    store: &ProviderOptionCacheStore,
) -> Result<(), SmsError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| SmsError::Io(format!("create option cache dir failed: {err}")))?;
    }
    let content = serde_json::to_string_pretty(store).map_err(|err| {
        SmsError::Config(format!("serialize provider option cache failed: {err}"))
    })?;
    fs::write(path, content)
        .map_err(|err| SmsError::Io(format!("write provider option cache failed: {err}")))
}

pub fn load_raw_option_audit_store(path: &Path) -> Result<ProviderRawOptionAuditStore, SmsError> {
    if !path.exists() {
        return Ok(ProviderRawOptionAuditStore::default());
    }
    let content = fs::read_to_string(path)
        .map_err(|err| SmsError::Io(format!("read raw option audit store failed: {err}")))?;
    serde_json::from_str(&content)
        .map_err(|err| SmsError::Config(format!("parse raw option audit store failed: {err}")))
}

pub fn save_raw_option_audit_store(
    path: &Path,
    store: &ProviderRawOptionAuditStore,
) -> Result<(), SmsError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| SmsError::Io(format!("create raw option audit dir failed: {err}")))?;
    }
    let content = serde_json::to_string_pretty(store).map_err(|err| {
        SmsError::Config(format!("serialize raw option audit store failed: {err}"))
    })?;
    fs::write(path, content)
        .map_err(|err| SmsError::Io(format!("write raw option audit store failed: {err}")))
}

pub fn cache_state(
    fetched_at: Option<DateTime<Utc>>,
    settings: &RuntimeSettings,
) -> OptionCacheState {
    let Some(fetched_at) = fetched_at else {
        return OptionCacheState::Missing;
    };
    let ttl_minutes = settings.option_cache_poll_interval_minutes.max(1) as i64;
    if Utc::now() - fetched_at <= Duration::minutes(ttl_minutes) {
        OptionCacheState::Fresh
    } else {
        OptionCacheState::Stale
    }
}

pub fn provider_can_enable(
    manifest: &ProviderManifest,
    options: Option<&ProviderDynamicOptions>,
    settings: &RuntimeSettings,
) -> bool {
    if matches!(manifest.kind, plugin_sdk::ProviderKind::Mock) {
        return true;
    }
    matches!(
        cache_state(options.and_then(|item| item.fetched_at), settings),
        OptionCacheState::Fresh
    )
}

pub fn with_cache_state(
    mut options: ProviderDynamicOptions,
    settings: &RuntimeSettings,
) -> ProviderDynamicOptions {
    options.cache_state = cache_state(options.fetched_at, settings);
    options
}

pub fn normalize_provider_options(
    manifest: &ProviderManifest,
    mut raw: ProviderDynamicOptions,
    fetched_at: DateTime<Utc>,
) -> ProviderDynamicOptions {
    let raw_services = raw.services.clone();
    let raw_countries = raw.countries.clone();
    let raw_operators = raw.operators.clone();
    raw.services = dedup_options(
        raw_services
            .iter()
            .cloned()
            .into_iter()
            .map(|item| {
                let raw_value = item
                    .provider_value
                    .clone()
                    .unwrap_or_else(|| item.value.clone());
                let canonical = canonical_service_value(manifest, &raw_value, Some(&item.label));
                OptionItem {
                    value: canonical.clone(),
                    label: resolved_service_label(&canonical, &item.label),
                    hint: item.hint,
                    provider_value: Some(raw_value),
                    icon_url: item.icon_url,
                    provider_icon_url: item.provider_icon_url,
                }
            })
            .collect(),
    );
    raw.countries = dedup_options(
        raw_countries
            .iter()
            .cloned()
            .into_iter()
            .map(|item| {
                let raw_value = item
                    .provider_value
                    .clone()
                    .unwrap_or_else(|| item.value.clone());
                let canonical =
                    canonical_country_value(&raw_value, Some(&item.label), Some(&item.hint));
                OptionItem {
                    value: canonical.clone(),
                    label: resolved_country_label(&canonical, &item.label, &item.hint),
                    hint: item.hint,
                    provider_value: Some(raw_value),
                    icon_url: item.icon_url,
                    provider_icon_url: item.provider_icon_url,
                }
            })
            .collect(),
    );
    raw.operators = dedup_options(
        raw_operators
            .iter()
            .cloned()
            .into_iter()
            .map(|item| {
                let raw_value = item
                    .provider_value
                    .clone()
                    .unwrap_or_else(|| item.value.clone());
                let canonical = canonical_operator_value(&raw_value, Some(&item.label));
                OptionItem {
                    value: canonical.clone(),
                    label: resolved_operator_label(&canonical, &item.label),
                    hint: item.hint,
                    provider_value: Some(raw_value),
                    icon_url: item.icon_url,
                    provider_icon_url: item.provider_icon_url,
                }
            })
            .collect(),
    );
    raw.raw_services = raw_services;
    raw.raw_countries = raw_countries;
    raw.raw_operators = raw_operators;
    raw.fetched_at = Some(fetched_at);
    raw.cache_state = OptionCacheState::Fresh;
    raw.provider = manifest.id.clone();
    raw
}

pub fn normalize_price_items(
    options: Option<&ProviderDynamicOptions>,
    items: Vec<ProviderPriceItem>,
) -> Vec<ProviderPriceItem> {
    let country_map = options.map(build_country_reverse_map).unwrap_or_default();
    let operator_map = options.map(build_operator_reverse_map).unwrap_or_default();

    items
        .into_iter()
        .map(|mut item| {
            let raw_country = item.country.clone();
            item.provider_country = Some(raw_country.clone());
            if let Some(mapped) = country_map.get(&normalize_token(&raw_country)) {
                item.country = mapped.value.clone();
                item.display_name = mapped.label.clone();
            } else {
                let canonical =
                    canonical_country_value(&raw_country, Some(&item.display_name), None);
                item.country = canonical.clone();
                item.display_name = resolved_country_label(&canonical, &item.display_name, "");
            }

            let raw_operator = item.operator.clone();
            item.provider_operator = Some(raw_operator.clone());
            if let Some(mapped) = operator_map.get(&normalize_token(&raw_operator)) {
                item.operator = mapped.value.clone();
                item.operator_label = Some(mapped.label.clone());
            } else {
                let canonical = canonical_operator_value(&raw_operator, None);
                item.operator = canonical.clone();
                item.operator_label = Some(resolved_operator_label(&canonical, &raw_operator));
            }
            item
        })
        .collect()
}

pub fn resolve_provider_value(
    options: Option<&ProviderDynamicOptions>,
    kind: OptionKind,
    canonical_value: &str,
) -> String {
    let canonical = normalize_token(canonical_value);
    if canonical.is_empty() {
        return String::new();
    }

    let source = match kind {
        OptionKind::Service => options.map(|item| &item.services),
        OptionKind::Country => options.map(|item| &item.countries),
        OptionKind::Operator => options.map(|item| &item.operators),
    };

    source
        .and_then(|items| {
            items
                .iter()
                .find(|item| normalize_token(&item.value) == canonical)
                .and_then(|item| item.provider_value.clone())
        })
        .unwrap_or_else(|| canonical_value.to_string())
}

pub fn build_cache_overview(
    manifests: &[ProviderManifest],
    store: &ProviderOptionCacheStore,
    settings: &RuntimeSettings,
) -> OptionCacheOverview {
    let mut fresh_providers = 0;
    let mut stale_providers = 0;
    let mut missing_providers = 0;
    let mut last_refresh_at = None;

    for manifest in manifests {
        if matches!(manifest.kind, plugin_sdk::ProviderKind::Mock) {
            continue;
        }
        let state = cache_state(
            store
                .entries
                .get(&manifest.id)
                .and_then(|entry| entry.fetched_at.into()),
            settings,
        );
        match state {
            OptionCacheState::Fresh => fresh_providers += 1,
            OptionCacheState::Stale => stale_providers += 1,
            OptionCacheState::Missing => missing_providers += 1,
        }
        let fetched_at = store
            .entries
            .get(&manifest.id)
            .map(|entry| entry.fetched_at);
        if let Some(timestamp) = fetched_at {
            if last_refresh_at
                .map(|current| timestamp > current)
                .unwrap_or(true)
            {
                last_refresh_at = Some(timestamp);
            }
        }
    }

    OptionCacheOverview {
        fresh_providers,
        stale_providers,
        missing_providers,
        last_refresh_at,
    }
}

pub enum OptionKind {
    Service,
    Country,
    Operator,
}

fn dedup_options(options: Vec<OptionItem>) -> Vec<OptionItem> {
    let mut merged = BTreeMap::new();
    for item in options {
        merged.entry(normalize_token(&item.value)).or_insert(item);
    }
    merged.into_values().collect()
}

fn build_country_reverse_map(options: &ProviderDynamicOptions) -> BTreeMap<String, OptionItem> {
    options
        .countries
        .iter()
        .filter_map(|item| {
            item.provider_value
                .as_ref()
                .map(|provider_value| (normalize_token(provider_value), item.clone()))
        })
        .collect()
}

fn build_operator_reverse_map(options: &ProviderDynamicOptions) -> BTreeMap<String, OptionItem> {
    options
        .operators
        .iter()
        .filter_map(|item| {
            item.provider_value
                .as_ref()
                .map(|provider_value| (normalize_token(provider_value), item.clone()))
        })
        .collect()
}

fn canonical_service_value(manifest: &ProviderManifest, raw: &str, label: Option<&str>) -> String {
    let raw_normalized = normalize_token(raw);
    let mut reverse_aliases = manifest
        .service_aliases
        .iter()
        .filter(|(_, provider_value)| normalize_token(provider_value) == raw_normalized)
        .map(|(alias, _)| alias.to_ascii_lowercase())
        .collect::<Vec<_>>();
    reverse_aliases.sort();

    for preferred in ["openai", "telegram", "whatsapp", "paypal", "discord"] {
        if reverse_aliases.iter().any(|item| item == preferred) {
            return preferred.to_string();
        }
    }

    if let Some(found) = reverse_aliases.first() {
        return found.clone();
    }

    let label = label.unwrap_or(raw);
    let probe = format!("{} {}", raw, label).to_ascii_lowercase();
    if probe.contains("openai") || probe.contains("chatgpt") || probe.contains("gpt") {
        return "openai".to_string();
    }
    if probe.contains("telegram") || probe == "tg" {
        return "telegram".to_string();
    }
    if probe.contains("whatsapp") || probe == "wa" {
        return "whatsapp".to_string();
    }
    if probe.contains("paypal") {
        return "paypal".to_string();
    }
    if probe.contains("discord") {
        return "discord".to_string();
    }
    raw_normalized
}

fn canonical_country_value(raw: &str, label: Option<&str>, hint: Option<&str>) -> String {
    let raw_normalized = normalize_token(raw);
    let label_normalized = normalize_token(label.unwrap_or(""));
    let hint_normalized = normalize_token(hint.unwrap_or(""));
    let signals = [
        raw_normalized.as_str(),
        label_normalized.as_str(),
        hint_normalized.as_str(),
    ];

    for (candidate, aliases) in [
        ("any", &["any", "all countries", "auto select"][..]),
        ("local", &["local"][..]),
        ("usa", &["usa", "united states", "50", "america"][..]),
        (
            "uk",
            &["england", "uk", "united kingdom", "44", "britain"][..],
        ),
        ("germany", &["germany", "deutschland"][..]),
        ("japan", &["japan"][..]),
        ("canada", &["canada"][..]),
        ("australia", &["australia", "61"][..]),
        ("russia", &["russia", "0", "россия"][..]),
        ("argentina", &["argentina", "阿根廷"][..]),
    ] {
        if signals
            .iter()
            .filter(|signal| !signal.is_empty())
            .any(|signal| aliases.iter().any(|alias| signal == alias))
        {
            return candidate.to_string();
        }
    }

    if raw_normalized == "us" {
        return "usa".to_string();
    }
    if raw_normalized == "ar" {
        return "argentina".to_string();
    }

    raw_normalized
}

fn canonical_operator_value(raw: &str, label: Option<&str>) -> String {
    let probe = format!("{} {}", raw, label.unwrap_or("")).to_ascii_lowercase();
    if probe.contains("any") {
        return "any".to_string();
    }
    normalize_token(raw)
}

fn service_label(canonical: &str) -> String {
    match canonical {
        "openai" => "OpenAI (GPT)".to_string(),
        "telegram" => "Telegram".to_string(),
        "whatsapp" => "WhatsApp".to_string(),
        "paypal" => "PayPal".to_string(),
        "discord" => "Discord".to_string(),
        other => title_case_token(other),
    }
}

fn resolved_service_label(canonical: &str, source_label: &str) -> String {
    let fallback = source_label.trim();
    match canonical {
        "openai" | "telegram" | "whatsapp" | "paypal" | "discord" => service_label(canonical),
        _ if !fallback.is_empty() => fallback.to_string(),
        _ => service_label(canonical),
    }
}

fn country_label(canonical: &str) -> String {
    match canonical {
        "any" => "All countries".to_string(),
        "local" => "Local".to_string(),
        "usa" => "United States".to_string(),
        "uk" => "United Kingdom".to_string(),
        "germany" => "Germany".to_string(),
        "japan" => "Japan".to_string(),
        "canada" => "Canada".to_string(),
        "australia" => "Australia".to_string(),
        "russia" => "Russia".to_string(),
        "argentina" => "Argentina".to_string(),
        other => title_case_token(other),
    }
}

fn resolved_country_label(canonical: &str, source_label: &str, source_hint: &str) -> String {
    let fallback_label = source_label.trim();
    let fallback_hint = source_hint.trim();
    match canonical {
        "any" | "local" | "usa" | "uk" | "germany" | "japan" | "canada" | "australia"
        | "russia" | "argentina" => country_label(canonical),
        _ if !fallback_label.is_empty() && fallback_label != canonical => {
            fallback_label.to_string()
        }
        _ if !fallback_hint.is_empty() && fallback_hint != canonical => fallback_hint.to_string(),
        _ => country_label(canonical),
    }
}

fn operator_label(canonical: &str) -> String {
    match canonical {
        "o2" => "O2".to_string(),
        "any" => "Any operator".to_string(),
        other => title_case_token(other),
    }
}

fn resolved_operator_label(canonical: &str, source_label: &str) -> String {
    let fallback = source_label.trim();
    match canonical {
        "any" | "o2" => operator_label(canonical),
        _ if !fallback.is_empty() => fallback.to_string(),
        _ => operator_label(canonical),
    }
}

fn normalize_token(input: &str) -> String {
    input
        .trim()
        .replace(['/', '_', '-'], " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_ascii_lowercase()
}

fn title_case_token(input: &str) -> String {
    input
        .replace(['_', '-'], " ")
        .split_whitespace()
        .map(|part| {
            if part.eq_ignore_ascii_case("o2") {
                "O2".to_string()
            } else if part.eq_ignore_ascii_case("uk") {
                "UK".to_string()
            } else if part.eq_ignore_ascii_case("usa") || part.eq_ignore_ascii_case("us") {
                "United States".to_string()
            } else {
                let mut chars = part.chars();
                match chars.next() {
                    Some(first) => {
                        format!("{}{}", first.to_uppercase(), chars.as_str().to_lowercase())
                    }
                    None => String::new(),
                }
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::canonical_country_value;

    #[test]
    fn canonical_country_value_keeps_russia_distinct_from_usa() {
        assert_eq!(
            canonical_country_value("0", Some("Russia"), Some("Russia")),
            "russia"
        );
        assert_eq!(
            canonical_country_value("50", Some("Austria"), Some("Austria")),
            "usa"
        );
        assert_eq!(
            canonical_country_value("31", Some("South Africa"), Some("South Africa")),
            "31"
        );
        assert_eq!(
            canonical_country_value("us", Some("United States"), Some("United States")),
            "usa"
        );
    }
}
