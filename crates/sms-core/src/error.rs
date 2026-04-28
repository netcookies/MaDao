use thiserror::Error;

#[derive(Debug, Error)]
pub enum SmsError {
    #[error("provider `{0}` not found")]
    ProviderNotFound(String),
    #[error("provider `{0}` is disabled")]
    ProviderDisabled(String),
    #[error("invalid request: {0}")]
    InvalidRequest(String),
    #[error("upstream failure: {0}")]
    Upstream(String),
    #[error("io failure: {0}")]
    Io(String),
    #[error("config failure: {0}")]
    Config(String),
}
