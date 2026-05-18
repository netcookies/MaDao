use crate::error::SmsError;
use crate::provider::{SmsProvider, build_provider};
use plugin_sdk::ProviderManifest;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

pub struct ProviderRegistry {
    root_dir: PathBuf,
    providers: BTreeMap<String, Arc<dyn SmsProvider>>,
    manifests: BTreeMap<String, ProviderManifest>,
    manifest_paths: BTreeMap<String, PathBuf>,
}

impl ProviderRegistry {
    pub fn load_from_dir(path: impl AsRef<Path>) -> Result<Self, SmsError> {
        let root_dir = path.as_ref().to_path_buf();
        let mut providers = BTreeMap::new();
        let mut manifests = BTreeMap::new();
        let mut manifest_paths = BTreeMap::new();
        let entries = fs::read_dir(&root_dir)
            .map_err(|err| SmsError::Io(format!("read provider dir failed: {err}")))?;
        for entry in entries {
            let entry =
                entry.map_err(|err| SmsError::Io(format!("read dir entry failed: {err}")))?;
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("toml") {
                continue;
            }
            let text = fs::read_to_string(&path)
                .map_err(|err| SmsError::Io(format!("read provider manifest failed: {err}")))?;
            let manifest: ProviderManifest =
                normalize_manifest_defaults(toml::from_str(&text).map_err(|err| {
                    SmsError::Config(format!("parse provider manifest failed: {err}"))
                })?);
            let id = manifest.id.clone();
            let provider = build_provider(manifest.clone())?;
            manifests.insert(id.clone(), manifest);
            manifest_paths.insert(id.clone(), path);
            providers.insert(id, provider);
        }
        Ok(Self {
            root_dir,
            providers,
            manifests,
            manifest_paths,
        })
    }

    pub fn get(&self, id: &str) -> Result<Arc<dyn SmsProvider>, SmsError> {
        self.providers
            .get(id)
            .cloned()
            .ok_or_else(|| SmsError::ProviderNotFound(id.to_string()))
    }

    pub fn manifests(&self) -> impl Iterator<Item = &ProviderManifest> {
        self.manifests.values()
    }

    pub fn list_manifests(&self) -> Vec<ProviderManifest> {
        self.manifests.values().cloned().collect()
    }

    pub fn list_manifests_by_priority(&self) -> Vec<ProviderManifest> {
        let mut manifests: Vec<ProviderManifest> = self.manifests.values().cloned().collect();
        manifests.sort_by(|a, b| a.priority.cmp(&b.priority).then(a.id.cmp(&b.id)));
        manifests
    }

    pub fn set_priorities(&mut self, priorities: &[(String, u32)]) -> Result<(), SmsError> {
        for (id, priority) in priorities {
            if let Some(manifest) = self.manifests.get_mut(id) {
                manifest.priority = *priority;
                let path = self
                    .manifest_paths
                    .get(id)
                    .cloned()
                    .unwrap_or_else(|| self.root_dir.join(format!("{id}.toml")));
                let content = toml::to_string_pretty(manifest)
                    .map_err(|err| SmsError::Config(format!("serialize manifest failed: {err}")))?;
                fs::write(&path, &content)
                    .map_err(|err| SmsError::Io(format!("write manifest failed: {err}")))?;
            }
        }
        self.reload()
    }

    pub fn manifest(&self, id: &str) -> Result<ProviderManifest, SmsError> {
        self.manifests
            .get(id)
            .cloned()
            .ok_or_else(|| SmsError::ProviderNotFound(id.to_string()))
    }

    pub fn reload(&mut self) -> Result<(), SmsError> {
        let refreshed = Self::load_from_dir(self.root_dir.clone())?;
        *self = refreshed;
        Ok(())
    }

    pub fn save_manifest(
        &mut self,
        id: &str,
        manifest: ProviderManifest,
    ) -> Result<ProviderManifest, SmsError> {
        if manifest.id != id {
            return Err(SmsError::InvalidRequest(format!(
                "provider id mismatch: path={id}, payload={}",
                manifest.id
            )));
        }
        let mut next_manifests = self.manifests.clone();
        next_manifests.insert(id.to_string(), manifest.clone());
        for manifest in next_manifests.values() {
            let _ = build_provider(manifest.clone())?;
        }
        let path = self
            .manifest_paths
            .get(id)
            .cloned()
            .unwrap_or_else(|| self.root_dir.join(format!("{id}.toml")));
        let previous = fs::read_to_string(&path).ok();
        let content = toml::to_string_pretty(&manifest).map_err(|err| {
            SmsError::Config(format!("serialize provider manifest failed: {err}"))
        })?;
        fs::write(&path, &content)
            .map_err(|err| SmsError::Io(format!("write provider manifest failed: {err}")))?;
        if let Err(err) = self.reload() {
            match previous {
                Some(previous_content) => {
                    let _ = fs::write(&path, previous_content);
                    let _ = self.reload();
                }
                None => {
                    let _ = fs::remove_file(&path);
                    let _ = self.reload();
                }
            }
            return Err(err);
        }
        self.manifest(id)
    }
}

fn normalize_manifest_defaults(manifest: ProviderManifest) -> ProviderManifest {
    let mut manifest = manifest;
    if manifest.id.eq_ignore_ascii_case("smsbower")
        && matches!(manifest.kind, plugin_sdk::ProviderKind::HandlerApi)
    {
        if let Some(handler_api) = manifest.handler_api.as_mut() {
            if handler_api.profile.trim().is_empty()
                || handler_api.profile.eq_ignore_ascii_case("standard")
            {
                handler_api.profile = "smsbower".to_string();
            }
            if manifest.defaults.service.trim().eq_ignore_ascii_case("dr") {
                manifest.defaults.service = "openai".to_string();
            }
        }
    }
    manifest
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use uuid::Uuid;

    fn repo_root() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .canonicalize()
            .unwrap()
    }

    #[test]
    fn loads_provider_manifest_ui_and_behavior_config() {
        let base = std::env::temp_dir().join(format!("madao-registry-test-{}", Uuid::now_v7()));
        fs::create_dir_all(&base).unwrap();
        fs::copy(
            repo_root().join("plugins/providers").join("herosms.toml"),
            base.join("herosms.toml"),
        )
        .unwrap();

        let registry = ProviderRegistry::load_from_dir(&base).unwrap();
        let manifest = registry.manifest("herosms").unwrap();

        assert_eq!(manifest.ui.protocol_label.as_deref(), Some("HeroSMS"));
        assert_eq!(manifest.ui.badge_label.as_deref(), Some("H"));
        assert_eq!(manifest.behavior.cancel_cooldown_sec, Some(120));
        assert!(!manifest.behavior.operator_selectable);
        assert!(
            manifest
                .handler_api
                .as_ref()
                .unwrap()
                .wait_status_tokens
                .iter()
                .any(|token| token == "STATUS_WAIT_RESEND")
        );
    }

    #[test]
    fn provider_behavior_defaults_operator_selectable_to_true() {
        let base = std::env::temp_dir().join(format!("madao-registry-defaults-{}", Uuid::now_v7()));
        fs::create_dir_all(&base).unwrap();
        fs::copy(
            repo_root().join("plugins/providers").join("fivesim.toml"),
            base.join("fivesim.toml"),
        )
        .unwrap();

        let registry = ProviderRegistry::load_from_dir(&base).unwrap();
        let manifest = registry.manifest("fivesim").unwrap();

        assert!(manifest.behavior.operator_selectable);
    }

    #[test]
    fn normalizes_legacy_smsbower_manifest_profile() {
        let base = std::env::temp_dir().join(format!("madao-registry-smsbower-{}", Uuid::now_v7()));
        fs::create_dir_all(&base).unwrap();
        let legacy = r#"
id = "smsbower"
name = "SmsBower"
kind = "handler_api"
enabled = true
priority = 30

[service_aliases]
openai = "dr"

[defaults]
service = "dr"
country = "0"
auto_pick_country = false
verify_on_register = false
reuse_phone = true
max_price = 0.08
min_price = 0.0
min_balance = 1.0
max_tries = 3
poll_timeout_sec = 120
reuse_max = 2

[handler_api]
base_url = "https://smsbower.page/stubs/handler_api.php"
api_key = "secret"
get_balance_action = "getBalance"
get_prices_action = "getPrices"
get_countries_action = "getCountries"
get_number_action = "getNumberV2"
get_status_action = "getStatus"
set_status_action = "setStatus"
status_ready = 1
status_retry = 3
status_finish = 6
status_cancel = 8
balance_prefix = "ACCESS_BALANCE:"
success_status_prefix = "STATUS_OK:"
wait_status_tokens = ["STATUS_WAIT_CODE"]
failure_status_tokens = ["STATUS_CANCEL", "BAD_STATUS", "NO_ACTIVATION", "BAD_KEY", "BAD_SERVICE"]
id_json_pointers = ["/activationId", "/activation_id", "/id"]
phone_json_pointers = ["/phoneNumber", "/phone", "/number"]
price_json_pointers = ["/activationCost", "/price"]
balance_json_pointers = ["/balance", "/amount", "/data/balance", "/data/amount"]
code_json_pointers = ["/sms/code", "/code", "/data/code", "/sms/0/code"]
"#;
        fs::write(base.join("smsbower.toml"), legacy).unwrap();

        let registry = ProviderRegistry::load_from_dir(&base).unwrap();
        let manifest = registry.manifest("smsbower").unwrap();
        assert_eq!(manifest.handler_api_profile(), "smsbower");
        assert_eq!(manifest.defaults.service, "openai");
    }
}
