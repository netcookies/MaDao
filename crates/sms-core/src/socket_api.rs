use crate::error::SmsError;
use crate::models::{
    AcquireCodeRequest, OpenAiSmsRegionsCache, PollCodeRequest, ProviderManifestList,
    ProviderManifestSaveResponse, ProviderPriceQuery, ReleaseCodeRequest, ReusePoolClearResponse,
    RoutingFailoverRequest, RoutingPlan, RoutingPlanList, RuntimeAccessInfo, RuntimeSettings,
    RuntimeSettingsUpdate,
};
use plugin_sdk::ProviderManifest;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "command", rename_all = "snake_case")]
pub enum SocketCommand {
    Ping,
    Snapshot,
    Acquire {
        request: AcquireCodeRequest,
    },
    Poll {
        request: PollCodeRequest,
    },
    Release {
        request: ReleaseCodeRequest,
    },
    RoutingFailover {
        request: RoutingFailoverRequest,
    },
    Balance {
        provider: String,
    },
    Prices {
        request: ProviderPriceQuery,
    },
    ProviderManifests,
    RoutingPlans,
    RoutingPlan {
        plan_id: String,
    },
    SaveRoutingPlan {
        plan: RoutingPlan,
    },
    DeleteRoutingPlan {
        plan_id: String,
    },
    ProviderManifest {
        provider: String,
    },
    SaveProviderManifest {
        provider: String,
        manifest: ProviderManifest,
    },
    ReloadProviders,
    RuntimeSettings,
    UpdateRuntimeSettings {
        request: RuntimeSettingsUpdate,
    },
    RegenerateHttpSecret,
    RuntimeAccessInfo,
    OpenAiSmsRegions,
    OptionCacheOverview,
    Notifications,
    ClearNotifications,
    ProviderCountries {
        provider: String,
    },
    ProviderServices {
        provider: String,
        request: crate::models::ProviderServicesQuery,
    },
    ProviderOperators {
        provider: String,
        request: crate::models::ProviderOperatorsQuery,
    },
    RefreshProviderOptions {
        provider: String,
    },
    ProviderOptionsCache {
        provider: String,
    },
    ClearProviderReusePool {
        provider: String,
    },
    ReorderProviders {
        request: crate::models::ProviderReorderRequest,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SocketEnvelope<T> {
    pub status: String,
    #[serde(default)]
    pub data: Option<T>,
    #[serde(default)]
    pub message: Option<String>,
}

impl<T> SocketEnvelope<T> {
    pub fn into_result(self) -> Result<T, SmsError> {
        if self.status == "ok" {
            self.data
                .ok_or_else(|| SmsError::InvalidRequest("socket response missing data".to_string()))
        } else {
            Err(SmsError::InvalidRequest(
                self.message
                    .unwrap_or_else(|| "socket request failed".to_string()),
            ))
        }
    }
}

pub type SocketPing = serde_json::Value;
pub type SocketSnapshot = serde_json::Value;
pub type SocketProviderManifests = ProviderManifestList;
pub type SocketRoutingPlans = RoutingPlanList;
pub type SocketProviderManifestSave = ProviderManifestSaveResponse;
pub type SocketReusePoolClear = ReusePoolClearResponse;
pub type SocketRuntimeSettings = RuntimeSettings;
pub type SocketRuntimeAccessInfo = RuntimeAccessInfo;
pub type SocketOpenAiSmsRegions = OpenAiSmsRegionsCache;
