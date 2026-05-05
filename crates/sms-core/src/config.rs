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
        let path = path.as_ref();
        let content = fs::read_to_string(path)
            .map_err(|err| SmsError::Io(format!("read config failed: {err}")))?;
        let mut config: Self =
            toml::from_str(&content).map_err(|err| SmsError::Config(format!("parse config failed: {err}")))?;
        let base_dir = path
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| PathBuf::from("."));
        if config.provider_dir.is_relative() {
            config.provider_dir = base_dir.join(&config.provider_dir);
        }
        if config.socket_path.is_relative() {
            config.socket_path = base_dir.join(&config.socket_path);
        }
        Ok(config)
    }
}
