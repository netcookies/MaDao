import { invoke } from '@tauri-apps/api/core';
import type {
  NotificationFeed,
  OpenAiSmsRegionsCache,
  OptionCacheOverview,
  OptionListResponse,
  ProviderBalance,
  ProviderDynamicOptions,
  ProviderManifest,
  ProviderManifestList,
  ProviderManifestSaveResponse,
  ProviderPriceResponse,
  ReusePoolClearResponse,
  RoutingReplaceResponse,
  RoutingPlan,
  RoutingPlanList,
  RuntimeAccessInfo,
  RuntimeSettings,
  RuntimeSettingsUpdate,
  RemoteStatsSummaryResponse,
  ReleaseCodeResponse,
  Snapshot,
  StatsSyncStatus,
} from '../app/types';

type SocketEnvelope<T> = {
  status: 'ok' | 'error';
  data?: T;
  message?: string;
};

async function socketInvoke<T>(command: string, payload?: Record<string, unknown>): Promise<T> {
  const response = await invoke<SocketEnvelope<T>>('socket_request', {
    command,
    payload: payload ?? null,
  });
  if (response.status !== 'ok') {
    throw new Error(response.message ?? 'socket request failed');
  }
  if (response.data === undefined) {
    throw new Error(`socket response missing data for ${command}`);
  }
  return response.data;
}

export function fetchRuntimeSnapshotViaSocket(): Promise<Snapshot> {
  return socketInvoke<Snapshot>('snapshot');
}

export function fetchProviderManifestsViaSocket(): Promise<ProviderManifestList> {
  return socketInvoke<ProviderManifestList>('provider_manifests');
}

export function fetchRoutingPlansViaSocket(): Promise<RoutingPlanList> {
  return socketInvoke<RoutingPlanList>('routing_plans');
}

export function saveRoutingPlanViaSocket(plan: RoutingPlan): Promise<RoutingPlan> {
  return socketInvoke<RoutingPlan>('save_routing_plan', { plan });
}

export function deleteRoutingPlanViaSocket(planId: string): Promise<RoutingPlanList> {
  return socketInvoke<RoutingPlanList>('delete_routing_plan', { plan_id: planId });
}

export function saveProviderManifestViaSocket(
  providerId: string,
  manifest: ProviderManifest,
): Promise<ProviderManifestSaveResponse> {
  return socketInvoke<ProviderManifestSaveResponse>('save_provider_manifest', {
    provider: providerId,
    manifest,
  });
}

export async function reloadProviderRegistryViaSocket(): Promise<void> {
  await socketInvoke<unknown>('reload_providers');
}

export function clearProviderReusePoolViaSocket(providerId: string): Promise<ReusePoolClearResponse> {
  return socketInvoke<ReusePoolClearResponse>('clear_provider_reuse_pool', { provider: providerId });
}

export function fetchProviderCountriesViaSocket(providerId: string): Promise<OptionListResponse> {
  return socketInvoke<OptionListResponse>('provider_countries', { provider: providerId });
}

export function fetchProviderServicesViaSocket(
  providerId: string,
  query?: { country?: string; operator?: string },
): Promise<OptionListResponse> {
  return socketInvoke<OptionListResponse>('provider_services', {
    provider: providerId,
    request: query ?? {},
  });
}

export function refreshProviderOptionsViaSocket(providerId: string): Promise<ProviderDynamicOptions> {
  return socketInvoke<ProviderDynamicOptions>('refresh_provider_options', { provider: providerId });
}

export function fetchProviderOptionsCacheViaSocket(providerId: string): Promise<ProviderDynamicOptions> {
  return socketInvoke<ProviderDynamicOptions>('provider_options_cache', { provider: providerId });
}

export function fetchProviderOperatorsViaSocket(
  providerId: string,
  query?: { country?: string },
): Promise<OptionListResponse> {
  return socketInvoke<OptionListResponse>('provider_operators', {
    provider: providerId,
    request: query ?? {},
  });
}

export function fetchNotificationsViaSocket(): Promise<NotificationFeed> {
  return socketInvoke<NotificationFeed>('notifications');
}

export function clearNotificationsViaSocket(): Promise<NotificationFeed> {
  return socketInvoke<NotificationFeed>('clear_notifications');
}

export function fetchRuntimeSettingsViaSocket(): Promise<RuntimeSettings> {
  return socketInvoke<RuntimeSettings>('runtime_settings');
}

export function saveRuntimeSettingsViaSocket(next: RuntimeSettingsUpdate): Promise<RuntimeSettings> {
  return socketInvoke<RuntimeSettings>('update_runtime_settings', { request: next });
}

export function regenerateHttpSecretViaSocket(): Promise<RuntimeSettings> {
  return socketInvoke<RuntimeSettings>('regenerate_http_secret');
}

export function fetchRuntimeAccessInfoViaSocket(): Promise<RuntimeAccessInfo> {
  return socketInvoke<RuntimeAccessInfo>('runtime_access_info');
}

export function syncTicketStatsViaSocket(): Promise<{
  uploaded: number;
  remaining: number;
  status: StatsSyncStatus;
}> {
  return socketInvoke('sync_ticket_stats');
}

export function fetchRemoteStatsSummaryViaSocket(query?: {
  provider?: string;
  service?: string;
  country?: string;
  operator?: string;
  lookback_hours?: number;
}): Promise<RemoteStatsSummaryResponse> {
  return socketInvoke('remote_stats_summary', {
    query: query ?? {},
  });
}

export function fetchOpenAiSmsRegionsViaSocket(): Promise<OpenAiSmsRegionsCache> {
  return socketInvoke<OpenAiSmsRegionsCache>('open_ai_sms_regions');
}

export function fetchOptionCacheOverviewViaSocket(): Promise<OptionCacheOverview> {
  return socketInvoke<OptionCacheOverview>('option_cache_overview');
}

export function fetchProviderBalanceViaSocket(providerId: string): Promise<ProviderBalance> {
  return socketInvoke<ProviderBalance>('balance', { provider: providerId });
}

export function fetchProviderPricesViaSocket(
  providerId: string,
  service: string,
  query?: { country?: string; operator?: string },
): Promise<ProviderPriceResponse> {
  return socketInvoke<ProviderPriceResponse>('prices', {
    request: {
      provider: providerId,
      service,
      country: query?.country,
      operator: query?.operator,
    },
  });
}

export async function pollActivationTicketViaSocket(ticketId: string): Promise<void> {
  await socketInvoke<unknown>('poll', { request: { ticket_id: ticketId } });
}

export async function releaseActivationTicketViaSocket(
  ticketId: string,
  action: 'finish' | 'cancel' | 'retry',
): Promise<ReleaseCodeResponse> {
  return socketInvoke<ReleaseCodeResponse>('release', { request: { ticket_id: ticketId, action } });
}

export function failoverRoutingTicketViaSocket(
  ticketId: string,
  failedItemId?: string,
  reason?: string,
) {
  return socketInvoke('routing_failover', {
    request: {
      ticket_id: ticketId,
      failed_item_id: failedItemId,
      reason,
    },
  });
}

export function replaceRoutingTicketViaSocket(
  ticketId: string,
  releaseAction: 'cancel' | 'ban',
  failedItemId?: string,
  reason?: string,
) {
  return socketInvoke<RoutingReplaceResponse>('routing_replace', {
    request: {
      ticket_id: ticketId,
      release_action: releaseAction,
      failed_item_id: failedItemId,
      reason,
    },
  });
}

export async function reorderProviderManifestsViaSocket(order: Array<{ id: string; priority: number }>): Promise<void> {
  await socketInvoke<unknown>('reorder_providers', { request: { order } });
}

export async function acquireActivationViaSocket(body: Record<string, unknown>): Promise<void> {
  await socketInvoke<unknown>('acquire', { request: body });
}
