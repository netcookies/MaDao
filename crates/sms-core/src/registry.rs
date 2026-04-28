use crate::error::SmsError;
use crate::provider::{build_provider, SmsProvider};
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
            let entry = entry.map_err(|err| SmsError::Io(format!("read dir entry failed: {err}")))?;
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("toml") {
                continue;
            }
            let text = fs::read_to_string(&path)
                .map_err(|err| SmsError::Io(format!("read provider manifest failed: {err}")))?;
            let manifest: ProviderManifest = toml::from_str(&text)
                .map_err(|err| SmsError::Config(format!("parse provider manifest failed: {err}")))?;
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

    pub fn save_manifest(&mut self, id: &str, manifest: ProviderManifest) -> Result<ProviderManifest, SmsError> {
        if manifest.id != id {
            return Err(SmsError::InvalidRequest(format!(
                "provider id mismatch: path={id}, payload={}",
                manifest.id
            )));
        }
        let path = self
            .manifest_paths
            .get(id)
            .cloned()
            .unwrap_or_else(|| self.root_dir.join(format!("{id}.toml")));
        let content = toml::to_string_pretty(&manifest)
            .map_err(|err| SmsError::Config(format!("serialize provider manifest failed: {err}")))?;
        fs::write(&path, content)
            .map_err(|err| SmsError::Io(format!("write provider manifest failed: {err}")))?;
        self.reload()?;
        self.manifest(id)
    }
}
