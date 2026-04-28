use crate::error::SmsError;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub http_bind: String,
    pub socket_path: PathBuf,
    pub provider_dir: PathBuf,
    pub log_buffer: usize,
    pub ui_title: String,
}

impl ServerConfig {
    pub fn load_from_file(path: impl AsRef<Path>) -> Result<Self, SmsError> {
        let content = fs::read_to_string(path.as_ref())
            .map_err(|err| SmsError::Io(format!("read config failed: {err}")))?;
        toml::from_str(&content).map_err(|err| SmsError::Config(format!("parse config failed: {err}")))
    }
}
