use crate::canonical_data::{
    CANONICAL_COUNTRY_LABELS, CANONICAL_COUNTRY_TEXT_ALIASES, CANONICAL_SERVICE_LABELS,
    CANONICAL_SERVICE_PATTERNS,
};
use crate::error::SmsError;
use crate::models::{
    OptionCacheOverview, OptionCacheState, OptionItem, ProviderCountryOperatorOptions,
    ProviderDynamicOptions, ProviderOptionCacheEntry, ProviderPriceItem,
    ProviderRawOptionAuditEntry, RuntimeSettings, TicketRecord,
};
use chrono::{DateTime, Duration, Utc};
use plugin_sdk::ProviderManifest;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProviderOptionCacheStore {
    pub entries: BTreeMap<String, ProviderOptionCacheEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProviderRawOptionAuditStore {
    pub entries: BTreeMap<String, ProviderRawOptionAuditEntry>,
}

#[derive(Debug, Clone, Default)]
pub struct ProviderMetadataCacheState {
    pub option_cache: ProviderOptionCacheStore,
    pub raw_option_audit: ProviderRawOptionAuditStore,
}

#[derive(Debug, Clone, Default)]
pub struct ProviderMetadataCacheBatch {
    pub option_cache: Option<ProviderOptionCacheStore>,
    pub raw_option_audit: Option<ProviderRawOptionAuditStore>,
}

impl ProviderMetadataCacheBatch {
    pub fn is_empty(&self) -> bool {
        self.option_cache.is_none() && self.raw_option_audit.is_none()
    }
}

pub trait ProviderMetadataCacheRepository: Send + Sync {
    fn load_state(&self) -> Result<ProviderMetadataCacheState, SmsError>;
    fn apply_batch(&self, batch: &ProviderMetadataCacheBatch) -> Result<(), SmsError>;
}

#[derive(Debug, Clone, Default)]
pub struct FileProviderMetadataCacheRepository {
    option_cache_path: Option<PathBuf>,
    raw_option_audit_path: Option<PathBuf>,
}

impl FileProviderMetadataCacheRepository {
    pub fn new(option_cache_path: Option<PathBuf>, raw_option_audit_path: Option<PathBuf>) -> Self {
        Self {
            option_cache_path,
            raw_option_audit_path,
        }
    }
}

impl ProviderMetadataCacheRepository for FileProviderMetadataCacheRepository {
    fn load_state(&self) -> Result<ProviderMetadataCacheState, SmsError> {
        let option_cache = self
            .option_cache_path
            .as_deref()
            .and_then(|path| load_option_cache_store(path).ok())
            .unwrap_or_default();
        let raw_option_audit = self
            .raw_option_audit_path
            .as_deref()
            .and_then(|path| load_raw_option_audit_store(path).ok())
            .unwrap_or_default();
        Ok(ProviderMetadataCacheState {
            option_cache,
            raw_option_audit,
        })
    }

    fn apply_batch(&self, batch: &ProviderMetadataCacheBatch) -> Result<(), SmsError> {
        if batch.is_empty() {
            return Ok(());
        }
        if let Some(store) = batch.option_cache.as_ref() {
            if let Some(path) = self.option_cache_path.as_deref() {
                save_option_cache_store(path, store)?;
            }
        }
        if let Some(store) = batch.raw_option_audit.as_ref() {
            if let Some(path) = self.raw_option_audit_path.as_deref() {
                save_raw_option_audit_store(path, store)?;
            }
        }
        Ok(())
    }
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
    options.operators_by_country = options
        .operators_by_country
        .into_iter()
        .map(|(country, entry)| {
            let raw_operators = if entry.raw_operators.is_empty() {
                entry.operators.clone()
            } else {
                entry.raw_operators
            };
            (
                operator_country_cache_key(Some(&country)).unwrap_or(country),
                ProviderCountryOperatorOptions {
                    operators: normalize_operator_options(raw_operators.clone()),
                    raw_operators,
                    fetched_at: entry.fetched_at,
                },
            )
        })
        .collect();
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
    raw.services = normalize_service_options(manifest, raw_services.clone());
    raw.countries = normalize_country_options(raw_countries.clone());
    raw.operators = normalize_operator_options(raw_operators.clone());
    raw.operators_by_country = raw
        .operators_by_country
        .into_iter()
        .map(|(country, entry)| {
            (
                operator_country_cache_key(Some(&country)).unwrap_or(country),
                ProviderCountryOperatorOptions {
                    raw_operators: entry.raw_operators.clone(),
                    operators: normalize_operator_options(if entry.raw_operators.is_empty() {
                        entry.operators.clone()
                    } else {
                        entry.raw_operators
                    }),
                    fetched_at: entry.fetched_at.or(Some(fetched_at)),
                },
            )
        })
        .collect();
    raw.raw_services = raw_services;
    raw.raw_countries = raw_countries;
    raw.raw_operators = raw_operators;
    raw.fetched_at = Some(fetched_at);
    raw.cache_state = OptionCacheState::Fresh;
    raw.provider = manifest.id.clone();
    raw
}

pub fn normalize_operator_options(raw_operators: Vec<OptionItem>) -> Vec<OptionItem> {
    dedup_options(
        raw_operators
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
                    label_zh: None,
                    provider_value: Some(raw_value),
                    icon_url: item.icon_url,
                    provider_icon_url: item.provider_icon_url,
                }
            })
            .collect(),
    )
}

pub fn normalize_country_options(raw_countries: Vec<OptionItem>) -> Vec<OptionItem> {
    dedup_options(
        raw_countries
            .into_iter()
            .map(|item| {
                let raw_value = item
                    .provider_value
                    .clone()
                    .unwrap_or_else(|| item.value.clone());
                let canonical =
                    canonical_country_value(&raw_value, Some(&item.label), Some(&item.hint));
                let label_en = country_label(&canonical);
                OptionItem {
                    value: canonical.clone(),
                    label: label_en.clone(),
                    hint: item.hint,
                    label_zh: country_label_zh(&canonical),
                    provider_value: Some(raw_value),
                    icon_url: item.icon_url,
                    provider_icon_url: item.provider_icon_url,
                }
            })
            .collect(),
    )
}

pub fn normalize_service_options(
    manifest: &ProviderManifest,
    raw_services: Vec<OptionItem>,
) -> Vec<OptionItem> {
    dedup_options(
        raw_services
            .into_iter()
            .map(|item| {
                let raw_value = item
                    .provider_value
                    .clone()
                    .unwrap_or_else(|| item.value.clone());
                let canonical = canonical_service_value(manifest, &raw_value, Some(&item.label));
                let label_en = resolved_service_label(&canonical, &item.label);
                OptionItem {
                    value: canonical.clone(),
                    label: label_en.clone(),
                    hint: item.hint,
                    label_zh: None,
                    provider_value: Some(raw_value),
                    icon_url: item.icon_url,
                    provider_icon_url: item.provider_icon_url,
                }
            })
            .collect(),
    )
}

#[derive(Debug, Clone, Deserialize)]
struct CountryMetadata {
    labels: BTreeMap<String, String>,
    #[serde(default)]
    labels_zh: BTreeMap<String, String>,
    aliases: BTreeMap<String, String>,
}

static COUNTRY_METADATA: OnceLock<CountryMetadata> = OnceLock::new();

fn country_metadata() -> &'static CountryMetadata {
    COUNTRY_METADATA.get_or_init(|| {
        serde_json::from_str(include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../config/country-metadata.json"
        )))
        .expect("country metadata should parse")
    })
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
                item.display_name_zh = mapped.label_zh.clone();
            } else {
                let canonical =
                    canonical_country_value(&raw_country, Some(&item.display_name), None);
                item.country = canonical.clone();
                item.display_name = resolved_country_label(&canonical, &item.display_name, "");
                item.display_name_zh = country_label_zh(&canonical);
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

pub fn canonical_country_key(raw: &str, label: Option<&str>, hint: Option<&str>) -> String {
    canonical_country_value(raw, label, hint)
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

    if let Some(raw_operator) = ticket.operator.clone() {
        if let Some(mapped) = operator_items_for_country(options, Some(&ticket.country))
            .into_iter()
            .flatten()
            .chain(
                options
                    .map(|entry| entry.operators.iter())
                    .into_iter()
                    .flatten(),
            )
            .find(|item| {
                item.provider_value
                    .as_ref()
                    .map(|provider_value| {
                        normalize_token(provider_value) == normalize_token(&raw_operator)
                    })
                    .unwrap_or(false)
            })
        {
            ticket.operator = Some(mapped.value.clone());
        } else {
            let canonical = canonical_operator_value(&raw_operator, Some(&raw_operator));
            ticket.operator = if canonical.is_empty() {
                None
            } else {
                Some(canonical)
            };
        }
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

pub fn resolve_provider_country_option_value(
    options: Option<&ProviderDynamicOptions>,
    country: &str,
) -> String {
    let raw_lookup = normalize_token(country);
    if raw_lookup.is_empty() {
        return String::new();
    }
    let canonical = canonical_country_key(country, Some(country), None);
    let canonical_lookup = normalize_token(&canonical);

    options
        .and_then(|entry| {
            entry.countries.iter().find(|item| {
                normalize_token(&item.value) == canonical_lookup
                    || item
                        .provider_value
                        .as_ref()
                        .map(|value| normalize_token(value) == raw_lookup)
                        .unwrap_or(false)
                    || normalize_token(&item.label) == raw_lookup
                    || item
                        .label_zh
                        .as_ref()
                        .map(|value| normalize_token(value) == raw_lookup)
                        .unwrap_or(false)
                    || normalize_token(&item.hint) == raw_lookup
            })
        })
        .map(|item| {
            item.provider_value
                .clone()
                .unwrap_or_else(|| item.value.clone())
        })
        .unwrap_or_else(|| country.to_string())
}

pub fn resolve_provider_operator_value(
    options: Option<&ProviderDynamicOptions>,
    canonical_value: &str,
    country: Option<&str>,
) -> String {
    let canonical = normalize_token(canonical_value);
    if canonical.is_empty() {
        return String::new();
    }

    operator_items_for_country(options, country)
        .into_iter()
        .flatten()
        .chain(
            options
                .map(|item| item.operators.iter())
                .into_iter()
                .flatten(),
        )
        .find(|item| normalize_token(&item.value) == canonical)
        .and_then(|item| item.provider_value.clone())
        .unwrap_or_else(|| canonical_value.to_string())
}

pub fn operator_country_cache_key(country: Option<&str>) -> Option<String> {
    country
        .map(|value| canonical_country_value(value, Some(value), None))
        .map(|value| match value.as_str() {
            "any" | "local" => value,
            _ => value.to_ascii_lowercase(),
        })
        .filter(|value| !value.is_empty())
}

pub fn operator_items_for_country<'a>(
    options: Option<&'a ProviderDynamicOptions>,
    country: Option<&str>,
) -> Option<&'a Vec<OptionItem>> {
    let key = operator_country_cache_key(country)?;
    let legacy_key = country.map(normalize_token);
    options.and_then(|item| {
        item.operators_by_country
            .get(&key)
            .or_else(|| {
                legacy_key
                    .as_ref()
                    .and_then(|candidate| item.operators_by_country.get(candidate))
            })
            .map(|entry| &entry.operators)
    })
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

pub(crate) fn canonical_service_key(raw: &str, label: Option<&str>) -> String {
    let raw_normalized = normalize_token(raw);
    let label = label.unwrap_or(raw);
    let label_normalized = normalize_token(label);

    if matches!(raw_normalized.as_str(), "dr" | "codex")
        || matches!(label_normalized.as_str(), "dr" | "codex")
    {
        return "openai".to_string();
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

    canonical_service_key(raw, label)
}

fn canonical_country_value(raw: &str, label: Option<&str>, hint: Option<&str>) -> String {
    let raw_normalized = normalize_token(raw);
    let label_normalized = normalize_token(label.unwrap_or(""));
    let hint_normalized = normalize_token(hint.unwrap_or(""));
    let metadata = country_metadata();

    let resolve_alias = |signal: &str| {
        metadata
            .aliases
            .get(signal)
            .map(|found| match found.as_str() {
                "ANY" => "any".to_string(),
                "LOCAL" => "local".to_string(),
                _ => found.clone(),
            })
    };

    let raw_is_numeric = raw_normalized.chars().all(|char| char.is_ascii_digit());
    if raw_is_numeric {
        for signal in [label_normalized.as_str(), hint_normalized.as_str()] {
            if signal.is_empty() {
                continue;
            }
            if let Some(found) = resolve_alias(signal) {
                return found;
            }
        }
    }

    for signal in [
        raw_normalized.as_str(),
        label_normalized.as_str(),
        hint_normalized.as_str(),
    ] {
        if signal.is_empty() {
            continue;
        }
        if let Some(found) = resolve_alias(signal) {
            return found;
        }
    }

    let textual_signals = [label_normalized.as_str(), hint_normalized.as_str()];
    if let Some(found) = find_canonical_alias(&textual_signals, CANONICAL_COUNTRY_TEXT_ALIASES) {
        if let Some(code) = resolve_alias(&found) {
            return code;
        }
        return found;
    }

    if raw_normalized.len() == 2
        && raw_normalized
            .chars()
            .all(|char| char.is_ascii_alphabetic())
    {
        return raw_normalized.to_ascii_uppercase();
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
    if canonical.eq_ignore_ascii_case("any") {
        return "All countries".to_string();
    }
    if canonical.eq_ignore_ascii_case("local") {
        return "Local".to_string();
    }
    if let Some(label) = country_metadata().labels.get(canonical) {
        return label.clone();
    }
    CANONICAL_COUNTRY_LABELS
        .iter()
        .find(|(key, _)| *key == canonical)
        .map(|(_, value)| (*value).to_string())
        .unwrap_or_else(|| title_case_token(canonical))
}

fn country_label_zh(canonical: &str) -> Option<String> {
    if canonical.eq_ignore_ascii_case("any") {
        return Some("全部国家".to_string());
    }
    if canonical.eq_ignore_ascii_case("local") {
        return Some("本地".to_string());
    }
    country_metadata().labels_zh.get(canonical).cloned()
}

fn resolved_country_label(canonical: &str, source_label: &str, source_hint: &str) -> String {
    let fallback_label = source_label.trim();
    let fallback_hint = source_hint.trim();
    if canonical.eq_ignore_ascii_case("any")
        || canonical.eq_ignore_ascii_case("local")
        || country_metadata().labels.contains_key(canonical)
        || (canonical.len() == 2 && canonical.chars().all(|char| char.is_ascii_uppercase()))
    {
        return country_label(canonical);
    }
    if !fallback_label.is_empty() && fallback_label != canonical {
        return fallback_label.to_string();
    }
    if !fallback_hint.is_empty() && fallback_hint != canonical {
        return fallback_hint.to_string();
    }
    country_label(canonical)
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
            } else if part.len() == 2 && part.chars().all(|char| char.is_ascii_alphabetic()) {
                part.to_ascii_uppercase()
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
        FileProviderMetadataCacheRepository, ProviderMetadataCacheBatch,
        ProviderMetadataCacheRepository, ProviderOptionCacheStore, ProviderRawOptionAuditStore,
        canonical_country_value, canonical_service_value, normalize_loaded_provider_options,
        normalize_provider_options, normalize_ticket_record, resolve_provider_country_option_value,
        resolve_provider_operator_value,
    };
    use crate::models::ProviderRawOptionAuditEntry;
    use crate::models::{
        OptionCacheState, OptionItem, ProviderCountryOperatorOptions, ProviderDynamicOptions,
        ProviderOptionCacheEntry, TicketRecord,
    };
    use chrono::Utc;
    use plugin_sdk::{ProviderDefaults, ProviderKind, ProviderManifest};
    use serde::Deserialize;
    use std::collections::{BTreeMap, BTreeSet};
    use std::fs;
    use std::path::PathBuf;
    use tempfile::tempdir;

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
            "RU"
        );
        assert_eq!(
            canonical_country_value("50", Some("Austria"), Some("Austria")),
            "AT"
        );
        assert_eq!(
            canonical_country_value("31", Some("South Africa"), Some("South Africa")),
            "ZA"
        );
        assert_eq!(
            canonical_country_value("us", Some("United States"), Some("United States")),
            "US"
        );
    }

    #[test]
    fn canonical_country_value_falls_back_to_label_for_numeric_ids() {
        assert_eq!(
            canonical_country_value("116", Some("約旦"), Some("Jordan")),
            "JO"
        );
        assert_eq!(
            canonical_country_value("18", Some("Viet nam"), Some("18")),
            "VN"
        );
        assert_eq!(
            canonical_country_value("12", Some("Ukraine"), Some("380")),
            "UA"
        );
        assert_eq!(
            canonical_country_value("103", Some("China"), Some("86")),
            "CN"
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
                label_zh: None,
                provider_value: Some("12".to_string()),
                icon_url: None,
                provider_icon_url: None,
            }],
            operators: Vec::new(),
            operators_by_country: BTreeMap::new(),
            cache_state: crate::models::OptionCacheState::Fresh,
            fetched_at: None,
        };

        let normalized = normalize_loaded_provider_options(&manifest, options);
        assert_eq!(normalized.countries[0].value, "UA");
        assert_eq!(normalized.countries[0].label, "Ukraine");
        assert_eq!(normalized.countries[0].label_zh.as_deref(), Some("乌克兰"));
        assert_eq!(
            normalized.countries[0].provider_value.as_deref(),
            Some("12")
        );
    }

    #[test]
    fn normalize_provider_options_exposes_country_zh_label_only() {
        let manifest = test_manifest();
        let fetched_at = Utc::now();
        let options = ProviderDynamicOptions {
            provider: "test".to_string(),
            raw_services: Vec::new(),
            raw_countries: Vec::new(),
            raw_operators: Vec::new(),
            services: vec![OptionItem {
                value: "dr".to_string(),
                label: "OpenAI".to_string(),
                hint: "dr".to_string(),
                label_zh: None,
                provider_value: None,
                icon_url: None,
                provider_icon_url: None,
            }],
            countries: vec![OptionItem {
                value: "england".to_string(),
                label: "United Kingdom".to_string(),
                hint: "44".to_string(),
                label_zh: None,
                provider_value: None,
                icon_url: None,
                provider_icon_url: None,
            }],
            operators: vec![OptionItem {
                value: "any".to_string(),
                label: "Any Operator".to_string(),
                hint: String::new(),
                label_zh: None,
                provider_value: None,
                icon_url: None,
                provider_icon_url: None,
            }],
            operators_by_country: BTreeMap::new(),
            cache_state: crate::models::OptionCacheState::Missing,
            fetched_at: None,
        };

        let normalized = normalize_provider_options(&manifest, options, fetched_at);

        assert_eq!(normalized.countries[0].value, "GB");
        assert_eq!(normalized.countries[0].label, "United Kingdom");
        assert_eq!(normalized.countries[0].label_zh.as_deref(), Some("英国"));
        assert_eq!(
            normalized.countries[0].provider_value.as_deref(),
            Some("england")
        );
        assert_eq!(normalized.services[0].value, "openai");
        assert_eq!(normalized.services[0].label, "OpenAI (GPT)");
        assert_eq!(normalized.services[0].label_zh, None);
        assert_eq!(normalized.operators[0].value, "any");
        assert_eq!(normalized.operators[0].label_zh, None);
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
                label_zh: None,
                provider_value: Some("dr".to_string()),
                icon_url: None,
                provider_icon_url: None,
            }],
            countries: vec![OptionItem {
                value: "US".to_string(),
                label: "United States".to_string(),
                hint: "50".to_string(),
                label_zh: None,
                provider_value: Some("50".to_string()),
                icon_url: None,
                provider_icon_url: None,
            }],
            operators: Vec::new(),
            operators_by_country: BTreeMap::new(),
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
        assert_eq!(normalized.country, "US");
    }

    #[test]
    fn resolve_provider_operator_value_prefers_country_specific_cache() {
        let options = ProviderDynamicOptions {
            provider: "test".to_string(),
            raw_services: Vec::new(),
            raw_countries: Vec::new(),
            raw_operators: Vec::new(),
            services: Vec::new(),
            countries: Vec::new(),
            operators: vec![OptionItem {
                value: "verizon".to_string(),
                label: "Verizon".to_string(),
                hint: String::new(),
                label_zh: None,
                provider_value: Some("global-verizon".to_string()),
                icon_url: None,
                provider_icon_url: None,
            }],
            operators_by_country: BTreeMap::from([(
                "us".to_string(),
                ProviderCountryOperatorOptions {
                    raw_operators: vec![OptionItem {
                        value: "verizon".to_string(),
                        label: "Verizon".to_string(),
                        hint: String::new(),
                        label_zh: None,
                        provider_value: Some("us-verizon".to_string()),
                        icon_url: None,
                        provider_icon_url: None,
                    }],
                    operators: vec![OptionItem {
                        value: "verizon".to_string(),
                        label: "Verizon".to_string(),
                        hint: String::new(),
                        label_zh: None,
                        provider_value: Some("us-verizon".to_string()),
                        icon_url: None,
                        provider_icon_url: None,
                    }],
                    fetched_at: Some(Utc::now()),
                },
            )]),
            cache_state: crate::models::OptionCacheState::Fresh,
            fetched_at: None,
        };

        assert_eq!(
            resolve_provider_operator_value(Some(&options), "verizon", Some("US")),
            "us-verizon"
        );
        assert_eq!(
            resolve_provider_operator_value(Some(&options), "verizon", Some("CA")),
            "global-verizon"
        );
    }

    #[test]
    fn resolve_provider_country_option_value_accepts_canonical_label_and_native_values() {
        let options = ProviderDynamicOptions {
            provider: "test".to_string(),
            raw_services: Vec::new(),
            raw_countries: Vec::new(),
            raw_operators: Vec::new(),
            services: Vec::new(),
            countries: vec![OptionItem {
                value: "GB".to_string(),
                label: "United Kingdom".to_string(),
                hint: "44".to_string(),
                label_zh: Some("英国".to_string()),
                provider_value: Some("england".to_string()),
                icon_url: None,
                provider_icon_url: None,
            }],
            operators: Vec::new(),
            operators_by_country: BTreeMap::new(),
            cache_state: crate::models::OptionCacheState::Fresh,
            fetched_at: None,
        };

        assert_eq!(
            resolve_provider_country_option_value(Some(&options), "GB"),
            "england"
        );
        assert_eq!(
            resolve_provider_country_option_value(Some(&options), "United Kingdom"),
            "england"
        );
        assert_eq!(
            resolve_provider_country_option_value(Some(&options), "英国"),
            "england"
        );
        assert_eq!(
            resolve_provider_country_option_value(Some(&options), "england"),
            "england"
        );
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

    #[test]
    fn file_provider_metadata_cache_repository_round_trips_batch() {
        let dir = tempdir().unwrap();
        let repo = FileProviderMetadataCacheRepository::new(
            Some(dir.path().join("provider-options-cache.json")),
            Some(dir.path().join("provider-options-raw.json")),
        );
        let fetched_at = Utc::now();
        let option_cache = ProviderOptionCacheStore {
            entries: BTreeMap::from([(
                "mock".to_string(),
                ProviderOptionCacheEntry {
                    provider: "mock".to_string(),
                    fetched_at,
                    options: ProviderDynamicOptions {
                        provider: "mock".to_string(),
                        raw_services: Vec::new(),
                        raw_countries: Vec::new(),
                        raw_operators: Vec::new(),
                        services: vec![OptionItem {
                            value: "openai".to_string(),
                            label: "OpenAI".to_string(),
                            hint: String::new(),
                            label_zh: None,
                            provider_value: Some("dr".to_string()),
                            icon_url: None,
                            provider_icon_url: None,
                        }],
                        countries: Vec::new(),
                        operators: Vec::new(),
                        operators_by_country: BTreeMap::new(),
                        cache_state: OptionCacheState::Fresh,
                        fetched_at: Some(fetched_at),
                    },
                },
            )]),
        };
        let raw_option_audit = ProviderRawOptionAuditStore {
            entries: BTreeMap::from([(
                "mock".to_string(),
                ProviderRawOptionAuditEntry {
                    provider: "mock".to_string(),
                    fetched_at,
                    raw_services: vec![OptionItem {
                        value: "dr".to_string(),
                        label: "OpenAI".to_string(),
                        hint: String::new(),
                        label_zh: None,
                        provider_value: None,
                        icon_url: None,
                        provider_icon_url: None,
                    }],
                    raw_countries: Vec::new(),
                    raw_operators: Vec::new(),
                },
            )]),
        };

        repo.apply_batch(&ProviderMetadataCacheBatch {
            option_cache: Some(option_cache),
            raw_option_audit: Some(raw_option_audit),
        })
        .unwrap();

        let loaded = repo.load_state().unwrap();
        assert_eq!(loaded.option_cache.entries["mock"].provider, "mock");
        assert_eq!(loaded.raw_option_audit.entries["mock"].provider, "mock");
        assert_eq!(
            loaded.option_cache.entries["mock"].options.services[0]
                .provider_value
                .as_deref(),
            Some("dr")
        );
        assert_eq!(
            loaded.raw_option_audit.entries["mock"].raw_services[0].value,
            "dr"
        );
    }

    #[test]
    fn file_provider_metadata_cache_repository_isolates_corrupt_cache_files() {
        let dir = tempdir().unwrap();
        let option_path = dir.path().join("provider-options-cache.json");
        let raw_path = dir.path().join("provider-options-raw.json");
        let repo = FileProviderMetadataCacheRepository::new(
            Some(option_path.clone()),
            Some(raw_path.clone()),
        );
        let fetched_at = Utc::now().to_rfc3339();

        fs::write(&option_path, "{not-json").unwrap();
        fs::write(
            &raw_path,
            format!(
                r#"{{
  "entries": {{
    "mock": {{
      "provider": "mock",
      "fetched_at": "{fetched_at}",
      "raw_services": [],
      "raw_countries": [],
      "raw_operators": []
    }}
  }}
}}"#
            ),
        )
        .unwrap();

        let loaded = repo.load_state().unwrap();
        assert!(loaded.option_cache.entries.is_empty());
        assert!(loaded.raw_option_audit.entries.contains_key("mock"));

        fs::write(
            &option_path,
            format!(
                r#"{{
  "entries": {{
    "mock": {{
      "provider": "mock",
      "fetched_at": "{fetched_at}",
      "options": {{
        "provider": "mock",
        "raw_services": [],
        "raw_countries": [],
        "raw_operators": [],
        "services": [],
        "countries": [],
        "operators": [],
        "operators_by_country": {{}},
        "cache_state": "fresh",
        "fetched_at": "{fetched_at}"
      }}
    }}
  }}
}}"#
            ),
        )
        .unwrap();
        fs::write(&raw_path, "{not-json").unwrap();

        let loaded = repo.load_state().unwrap();
        assert!(loaded.option_cache.entries.contains_key("mock"));
        assert!(loaded.raw_option_audit.entries.is_empty());
    }
}
