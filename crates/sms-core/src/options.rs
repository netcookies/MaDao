use crate::canonical_data::{
    CANONICAL_COUNTRY_LABELS, CANONICAL_COUNTRY_TEXT_ALIASES, CANONICAL_SERVICE_LABELS,
    CANONICAL_SERVICE_PATTERNS,
};
use crate::error::SmsError;
use crate::models::{
    OptionCacheOverview, OptionCacheState, OptionItem, ProviderDynamicOptions,
    ProviderOptionCacheEntry, ProviderPriceItem, ProviderRawOptionAuditEntry, RuntimeSettings,
    TicketRecord,
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

pub fn normalize_loaded_provider_options(
    manifest: &ProviderManifest,
    mut options: ProviderDynamicOptions,
) -> ProviderDynamicOptions {
    let fetched_at = options.fetched_at.unwrap_or_else(Utc::now);
    if options.raw_services.is_empty() {
        options.raw_services = options.services.clone();
    }
    if options.raw_countries.is_empty() {
        options.raw_countries = options.countries.clone();
    }
    if options.raw_operators.is_empty() {
        options.raw_operators = options.operators.clone();
    }
    normalize_provider_options(manifest, options, fetched_at)
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

pub fn normalize_ticket_record(
    manifest: &ProviderManifest,
    options: Option<&ProviderDynamicOptions>,
    mut ticket: TicketRecord,
) -> TicketRecord {
    let raw_service = ticket.service.clone();
    if let Some(mapped) = options.and_then(|entry| {
        entry.services.iter().find(|item| {
            item.provider_value
                .as_ref()
                .map(|provider_value| {
                    normalize_token(provider_value) == normalize_token(&raw_service)
                })
                .unwrap_or(false)
        })
    }) {
        ticket.service = mapped.value.clone();
    } else {
        ticket.service = canonical_service_value(manifest, &raw_service, Some(&raw_service));
    }

    let raw_country = ticket.country.clone();
    if let Some(mapped) = options.and_then(|entry| {
        entry.countries.iter().find(|item| {
            item.provider_value
                .as_ref()
                .map(|provider_value| {
                    normalize_token(provider_value) == normalize_token(&raw_country)
                })
                .unwrap_or(false)
        })
    }) {
        ticket.country = mapped.value.clone();
    } else {
        ticket.country = canonical_country_value(&raw_country, Some(&raw_country), None);
    }

    ticket
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

fn find_canonical_alias<'a>(signals: &[&'a str], aliases: &[(&str, &[&str])]) -> Option<String> {
    for (candidate, candidates_aliases) in aliases {
        if signals
            .iter()
            .filter(|signal| !signal.is_empty())
            .any(|signal| candidates_aliases.iter().any(|alias| signal == alias))
        {
            return Some((*candidate).to_string());
        }
    }
    None
}

fn pattern_matches(raw_normalized: &str, label_normalized: &str, pattern: &str) -> bool {
    let combined = format!("{raw_normalized} {label_normalized}");
    if pattern.contains(' ') {
        return combined.contains(pattern);
    }
    let raw_tokens = raw_normalized.split_whitespace().collect::<Vec<_>>();
    let label_tokens = label_normalized.split_whitespace().collect::<Vec<_>>();
    if pattern.len() <= 3 {
        return raw_tokens.iter().any(|token| *token == pattern)
            || label_tokens.iter().any(|token| *token == pattern);
    }
    raw_normalized == pattern
        || label_normalized == pattern
        || raw_tokens.iter().any(|token| *token == pattern)
        || label_tokens.iter().any(|token| *token == pattern)
        || combined.contains(pattern)
}

fn is_numeric_like(value: &str) -> bool {
    let trimmed = value.trim().trim_start_matches('+');
    !trimmed.is_empty() && trimmed.chars().all(|char| char.is_ascii_digit())
}

fn canonical_service_value(manifest: &ProviderManifest, raw: &str, label: Option<&str>) -> String {
    let raw_normalized = normalize_token(raw);
    let label = label.unwrap_or(raw);
    let label_normalized = normalize_token(label);
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

    if let Some((candidate, _)) = CANONICAL_SERVICE_PATTERNS.iter().find(|(_, patterns)| {
        patterns
            .iter()
            .any(|pattern| pattern_matches(&raw_normalized, &label_normalized, pattern))
    }) {
        return (*candidate).to_string();
    }
    if !label_normalized.is_empty() && label_normalized != raw_normalized {
        return label_normalized;
    }
    raw_normalized
}

fn canonical_country_value(raw: &str, label: Option<&str>, hint: Option<&str>) -> String {
    let raw_normalized = normalize_token(raw);
    let label_normalized = normalize_token(label.unwrap_or(""));
    let hint_normalized = normalize_token(hint.unwrap_or(""));
    let textual_signals = [label_normalized.as_str(), hint_normalized.as_str()];

    if let Some(found) = find_canonical_alias(&textual_signals, CANONICAL_COUNTRY_TEXT_ALIASES) {
        return found;
    }

    if raw_normalized == "us" {
        return "usa".to_string();
    }
    if raw_normalized == "ar" {
        return "argentina".to_string();
    }
    if raw_normalized.chars().all(|char| char.is_ascii_digit()) {
        if !hint_normalized.is_empty()
            && hint_normalized != raw_normalized
            && !is_numeric_like(&hint_normalized)
        {
            return hint_normalized;
        }
        if !label_normalized.is_empty()
            && label_normalized != raw_normalized
            && !label_normalized.chars().all(|char| char.is_ascii_digit())
        {
            return label_normalized;
        }
    }
    if !label_normalized.is_empty()
        && label_normalized != raw_normalized
        && !is_numeric_like(&label_normalized)
    {
        return label_normalized;
    }
    if !hint_normalized.is_empty()
        && hint_normalized != raw_normalized
        && !is_numeric_like(&hint_normalized)
    {
        return hint_normalized;
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
    CANONICAL_SERVICE_LABELS
        .iter()
        .find(|(key, _)| *key == canonical)
        .map(|(_, value)| (*value).to_string())
        .unwrap_or_else(|| title_case_token(canonical))
}

fn resolved_service_label(canonical: &str, source_label: &str) -> String {
    let fallback = source_label.trim();
    match canonical {
        "openai" | "claude" | "telegram" | "whatsapp" | "paypal" | "discord" => {
            service_label(canonical)
        }
        _ if !fallback.is_empty() => fallback.to_string(),
        _ => service_label(canonical),
    }
}

fn country_label(canonical: &str) -> String {
    CANONICAL_COUNTRY_LABELS
        .iter()
        .find(|(key, _)| *key == canonical)
        .map(|(_, value)| (*value).to_string())
        .unwrap_or_else(|| title_case_token(canonical))
}

fn resolved_country_label(canonical: &str, source_label: &str, source_hint: &str) -> String {
    let fallback_label = source_label.trim();
    let fallback_hint = source_hint.trim();
    match canonical {
        "any"
        | "local"
        | "usa"
        | "uk"
        | "germany"
        | "japan"
        | "canada"
        | "australia"
        | "russia"
        | "argentina"
        | "vietnam"
        | "southafrica"
        | "bosnia and herzegovina"
        | "trinidad and tobago"
        | "czech republic"
        | "north macedonia"
        | "south korea"
        | "north korea"
        | "jordan" => country_label(canonical),
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
    use super::{
        canonical_country_value, canonical_service_value, normalize_loaded_provider_options,
        normalize_ticket_record,
    };
    use crate::models::ProviderRawOptionAuditEntry;
    use crate::models::{OptionItem, ProviderDynamicOptions, TicketRecord};
    use plugin_sdk::{ProviderDefaults, ProviderKind, ProviderManifest};
    use serde::Deserialize;
    use std::collections::{BTreeMap, BTreeSet};
    use std::fs;
    use std::path::PathBuf;

    fn test_manifest() -> ProviderManifest {
        ProviderManifest {
            id: "test".to_string(),
            name: "Test".to_string(),
            kind: ProviderKind::HandlerApi,
            enabled: true,
            priority: 10,
            homepage: None,
            description: None,
            service_aliases: BTreeMap::new(),
            defaults: ProviderDefaults::default(),
            ui: Default::default(),
            behavior: Default::default(),
            handler_api: None,
            five_sim: None,
            mock: None,
        }
    }

    #[test]
    fn canonical_country_value_keeps_russia_distinct_from_usa() {
        assert_eq!(
            canonical_country_value("0", Some("Russia"), Some("Russia")),
            "russia"
        );
        assert_eq!(
            canonical_country_value("50", Some("Austria"), Some("Austria")),
            "austria"
        );
        assert_eq!(
            canonical_country_value("31", Some("South Africa"), Some("South Africa")),
            "southafrica"
        );
        assert_eq!(
            canonical_country_value("us", Some("United States"), Some("United States")),
            "usa"
        );
    }

    #[test]
    fn canonical_country_value_falls_back_to_label_for_numeric_ids() {
        assert_eq!(
            canonical_country_value("116", Some("約旦"), Some("Jordan")),
            "jordan"
        );
        assert_eq!(
            canonical_country_value("18", Some("Viet nam"), Some("18")),
            "vietnam"
        );
        assert_eq!(
            canonical_country_value("12", Some("Ukraine"), Some("380")),
            "ukraine"
        );
        assert_eq!(
            canonical_country_value("103", Some("China"), Some("86")),
            "china"
        );
    }

    #[test]
    fn normalize_loaded_provider_options_recanonicalizes_legacy_numeric_countries() {
        let manifest = test_manifest();
        let options = ProviderDynamicOptions {
            provider: "test".to_string(),
            raw_services: Vec::new(),
            raw_countries: Vec::new(),
            raw_operators: Vec::new(),
            services: Vec::new(),
            countries: vec![OptionItem {
                value: "12".to_string(),
                label: "Ukraine".to_string(),
                hint: "380".to_string(),
                provider_value: Some("12".to_string()),
                icon_url: None,
                provider_icon_url: None,
            }],
            operators: Vec::new(),
            cache_state: crate::models::OptionCacheState::Fresh,
            fetched_at: None,
        };

        let normalized = normalize_loaded_provider_options(&manifest, options);
        assert_eq!(normalized.countries[0].value, "ukraine");
        assert_eq!(normalized.countries[0].label, "Ukraine");
        assert_eq!(
            normalized.countries[0].provider_value.as_deref(),
            Some("12")
        );
    }

    #[test]
    fn canonical_service_value_uses_label_for_provider_short_codes() {
        let manifest = test_manifest();
        assert_eq!(
            canonical_service_value(&manifest, "acz", Some("Claude")),
            "claude"
        );
        assert_eq!(
            canonical_service_value(&manifest, "tg", Some("Telegram")),
            "telegram"
        );
    }

    #[test]
    fn normalize_ticket_record_maps_provider_values_back_to_canonical_values() {
        let mut manifest = test_manifest();
        manifest
            .service_aliases
            .insert("openai".to_string(), "dr".to_string());

        let options = ProviderDynamicOptions {
            provider: "test".to_string(),
            raw_services: Vec::new(),
            raw_countries: Vec::new(),
            raw_operators: Vec::new(),
            services: vec![OptionItem {
                value: "openai".to_string(),
                label: "OpenAI (GPT)".to_string(),
                hint: "dr".to_string(),
                provider_value: Some("dr".to_string()),
                icon_url: None,
                provider_icon_url: None,
            }],
            countries: vec![OptionItem {
                value: "usa".to_string(),
                label: "United States".to_string(),
                hint: "50".to_string(),
                provider_value: Some("50".to_string()),
                icon_url: None,
                provider_icon_url: None,
            }],
            operators: Vec::new(),
            cache_state: crate::models::OptionCacheState::Fresh,
            fetched_at: None,
        };

        let ticket = TicketRecord::new(
            "test".to_string(),
            "dr".to_string(),
            "50".to_string(),
            "+15550000000".to_string(),
            Some("upstream-1".to_string()),
            Some(0.1),
        );

        let normalized = normalize_ticket_record(&manifest, Some(&options), ticket);
        assert_eq!(normalized.service, "openai");
        assert_eq!(normalized.country, "usa");
    }

    #[derive(Deserialize)]
    struct RawAuditStore {
        entries: BTreeMap<String, ProviderRawOptionAuditEntry>,
    }

    fn repo_root() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
    }

    fn load_manifest(provider_id: &str) -> ProviderManifest {
        let root = repo_root();
        let path = root
            .join("plugins/providers")
            .join(format!("{provider_id}.toml"));
        let content = fs::read_to_string(path).expect("read provider manifest");
        toml::from_str(&content).expect("parse provider manifest")
    }

    fn englishish(value: &str) -> bool {
        !value.chars().any(|char| {
            ('\u{4e00}'..='\u{9fff}').contains(&char)
                || ('\u{3040}'..='\u{30ff}').contains(&char)
                || ('\u{0400}'..='\u{04ff}').contains(&char)
        })
    }

    fn normalize_label_key(value: &str) -> String {
        value
            .trim()
            .to_ascii_lowercase()
            .replace(['/', '_', '-'], " ")
            .replace(['(', ')', ','], " ")
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
    }

    #[test]
    fn audit_cross_provider_service_aliases_do_not_diverge() {
        let root = repo_root();
        let path = root.join("config/provider-options-raw.json");
        let content = fs::read_to_string(path).expect("read raw option audit");
        let store: RawAuditStore = serde_json::from_str(&content).expect("parse raw option audit");

        let target_groups = [
            (
                "openai",
                &["OpenAI", "OpenAI (ChatGPT)", "OpenAI/ChatGPT"][..],
            ),
            ("claude", &["Claude", "ClaudeAI/Anthropic"][..]),
            ("telegram", &["Telegram"][..]),
            ("discord", &["Discord"][..]),
            ("wechat", &["WeChat"][..]),
            ("google chat", &["Google Chat"][..]),
            ("uber", &["Uber"][..]),
            ("apple", &["Apple"][..]),
            ("aol", &["AOL"][..]),
            ("microsoft", &["Microsoft"][..]),
            ("twitter", &["Twitter/X"][..]),
            ("yahoo", &["Yahoo"][..]),
        ];

        for (expected, labels) in target_groups {
            let mut observed = BTreeMap::<String, String>::new();
            for (provider_id, entry) in &store.entries {
                let manifest = load_manifest(provider_id);
                for item in &entry.raw_services {
                    let label = item.label.trim();
                    if labels
                        .iter()
                        .any(|candidate| label.eq_ignore_ascii_case(candidate))
                    {
                        observed.insert(
                            provider_id.clone(),
                            canonical_service_value(&manifest, &item.value, Some(&item.label)),
                        );
                    }
                }
            }
            assert!(
                !observed.is_empty(),
                "expected at least one observed service mapping for {expected}"
            );
            assert!(
                observed.values().all(|value| value == expected),
                "service canonical mismatch for {expected}: {observed:?}"
            );
        }
    }

    #[test]
    fn audit_all_cross_provider_service_groups_are_canonicalized() {
        let root = repo_root();
        let path = root.join("config/provider-options-raw.json");
        let content = fs::read_to_string(path).expect("read raw option audit");
        let store: RawAuditStore = serde_json::from_str(&content).expect("parse raw option audit");
        let generic_manifest = test_manifest();

        let mut groups = BTreeMap::<String, Vec<(String, String, String)>>::new();
        for (provider_id, entry) in &store.entries {
            let manifest = load_manifest(provider_id);
            for item in &entry.raw_services {
                let label = item.label.trim();
                let hint = item.hint.trim();
                let chosen = if !label.is_empty() && englishish(label) {
                    label
                } else if !hint.is_empty() && englishish(hint) {
                    hint
                } else {
                    continue;
                };
                let group_key = canonical_service_value(&generic_manifest, chosen, Some(chosen));
                let actual = canonical_service_value(&manifest, &item.value, Some(&item.label));
                groups.entry(group_key).or_default().push((
                    provider_id.clone(),
                    item.value.clone(),
                    actual,
                ));
            }
        }

        let mut mismatches = Vec::new();
        for (group, rows) in groups {
            let providers = rows
                .iter()
                .map(|(provider, _, _)| provider.clone())
                .collect::<BTreeSet<_>>();
            if providers.len() < 2 {
                continue;
            }
            let canonicals = rows
                .iter()
                .map(|(_, _, canonical)| canonical.clone())
                .collect::<BTreeSet<_>>();
            if canonicals.len() > 1 {
                mismatches.push((group, rows));
            }
        }

        assert!(
            mismatches.is_empty(),
            "service audit mismatches: {:?}",
            mismatches.into_iter().take(20).collect::<Vec<_>>()
        );
    }

    #[test]
    fn audit_all_cross_provider_country_groups_are_canonicalized() {
        let root = repo_root();
        let path = root.join("config/provider-options-raw.json");
        let content = fs::read_to_string(path).expect("read raw option audit");
        let store: RawAuditStore = serde_json::from_str(&content).expect("parse raw option audit");

        let mut groups = BTreeMap::<String, Vec<(String, String, String)>>::new();
        for (provider_id, entry) in &store.entries {
            for item in &entry.raw_countries {
                let label = item.label.trim();
                let hint = item.hint.trim();
                let chosen = if !label.is_empty() && englishish(label) {
                    label
                } else if !hint.is_empty() && englishish(hint) {
                    hint
                } else {
                    continue;
                };
                let group_seed = normalize_label_key(chosen);
                let group_key = canonical_country_value(&group_seed, Some(chosen), Some(chosen));
                let actual =
                    canonical_country_value(&item.value, Some(&item.label), Some(&item.hint));
                groups.entry(group_key).or_default().push((
                    provider_id.clone(),
                    item.value.clone(),
                    actual,
                ));
            }
        }

        let mut mismatches = Vec::new();
        for (group, rows) in groups {
            let providers = rows
                .iter()
                .map(|(provider, _, _)| provider.clone())
                .collect::<BTreeSet<_>>();
            if providers.len() < 2 {
                continue;
            }
            let canonicals = rows
                .iter()
                .map(|(_, _, canonical)| canonical.clone())
                .collect::<BTreeSet<_>>();
            if canonicals.len() > 1 {
                mismatches.push((group, rows));
            }
        }

        assert!(
            mismatches.is_empty(),
            "country audit mismatches: {:?}",
            mismatches.into_iter().take(20).collect::<Vec<_>>()
        );
    }
}
