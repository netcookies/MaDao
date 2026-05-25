import type {
  MessageFilter,
  NotificationFeed,
  OpenAiSmsRegionsCache,
  OptionListResponse,
  OptionCacheOverview,
  ProviderBalance,
  ProviderDynamicOptions,
  ProviderManifest,
  ProviderManifestSaveResponse,
  ProviderManifestList,
  ProviderPriceResponse,
  ReusePoolClearResponse,
  ReleaseCodeResponse,
  RoutingPlan,
  RoutingPlanList,
  RuntimeSettings,
  RuntimeSettingsUpdate,
  Snapshot,
  UpdateCheckResult,
  RuntimeAccessInfo,
} from '../app/types';
import { API_BASE, SOCKET_PATH } from './runtimeEnv';
export {
  API_BASE,
  SOCKET_PATH,
  IS_DESKTOP_RUNTIME,
  IS_WEB_RUNTIME,
  CONFIG_DIRECTORY,
  RUNTIME_MODE,
  USE_SOCKET_TRANSPORT,
  IS_WINDOWS_DESKTOP_RUNTIME,
} from './runtimeEnv';
import {
  acquireActivationViaSocket,
  clearNotificationsViaSocket,
  clearProviderReusePoolViaSocket,
  deleteRoutingPlanViaSocket,
  failoverRoutingTicketViaSocket,
  fetchNotificationsViaSocket,
  fetchOpenAiSmsRegionsViaSocket,
  fetchOptionCacheOverviewViaSocket,
  fetchProviderBalanceViaSocket,
  fetchProviderCountriesViaSocket,
  fetchProviderManifestsViaSocket,
  fetchProviderOperatorsViaSocket,
  fetchProviderOptionsCacheViaSocket,
  fetchProviderPricesViaSocket,
  fetchProviderServicesViaSocket,
  fetchRoutingPlansViaSocket,
  fetchRuntimeAccessInfoViaSocket,
  fetchRuntimeSettingsViaSocket,
  fetchRuntimeSnapshotViaSocket,
  pollActivationTicketViaSocket,
  regenerateHttpSecretViaSocket,
  refreshProviderOptionsViaSocket,
  releaseActivationTicketViaSocket,
  reloadProviderRegistryViaSocket,
  reorderProviderManifestsViaSocket,
  saveProviderManifestViaSocket,
  saveRoutingPlanViaSocket,
  saveRuntimeSettingsViaSocket,
} from './socketClientApi';
import { invoke } from '@tauri-apps/api/core';
import { IS_DESKTOP_RUNTIME, USE_SOCKET_TRANSPORT } from './runtimeEnv';

export type ActivationAcquireResponse = {
  ticket_id: string;
  provider: string;
  service: string;
  country: string;
  phone_number: string;
  routing_plan_id?: string | null;
  routing_plan_name?: string | null;
  routing_item_id?: string | null;
  routing_item_index?: number | null;
};

async function readErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      const payload = (await response.json()) as { message?: string };
      if (payload.message) return payload.message;
    } catch {
      // Fallback to raw text below when JSON parsing fails.
    }
  }
  const text = await response.text();
  return text || response.statusText;
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return (await response.json()) as T;
}

let desktopHttpSecretPromise: Promise<string> | null = null;

async function getDesktopHttpSecret(): Promise<string> {
  if (!IS_DESKTOP_RUNTIME || USE_SOCKET_TRANSPORT) {
    throw new Error('desktop HTTP secret is only available for non-socket desktop runtimes');
  }
  desktopHttpSecretPromise ??= invoke<string>('desktop_http_secret');
  return desktopHttpSecretPromise;
}

async function buildDesktopHttpHeaders(contentType = true): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await getDesktopHttpSecret()}`,
  };
  if (contentType) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

export async function fetchRuntimeSnapshot(): Promise<Snapshot> {
  if (USE_SOCKET_TRANSPORT) return fetchRuntimeSnapshotViaSocket();
  return readJson<Snapshot>(await fetch(`${API_BASE}/api/providers`, {
    headers: IS_DESKTOP_RUNTIME ? await buildDesktopHttpHeaders(false) : undefined,
  }));
}

export async function fetchProviderManifests(): Promise<ProviderManifestList> {
  if (USE_SOCKET_TRANSPORT) return fetchProviderManifestsViaSocket();
  return readJson<ProviderManifestList>(await fetch(`${API_BASE}/api/provider-manifests`, {
    headers: IS_DESKTOP_RUNTIME ? await buildDesktopHttpHeaders(false) : undefined,
  }));
}

export async function fetchRoutingPlans(): Promise<RoutingPlanList> {
  if (USE_SOCKET_TRANSPORT) return fetchRoutingPlansViaSocket();
  return readJson<RoutingPlanList>(await fetch(`${API_BASE}/api/routing-plans`, {
    headers: IS_DESKTOP_RUNTIME ? await buildDesktopHttpHeaders(false) : undefined,
  }));
}

export async function saveRoutingPlan(plan: RoutingPlan): Promise<RoutingPlan> {
  if (USE_SOCKET_TRANSPORT) return saveRoutingPlanViaSocket(plan);
  return readJson<RoutingPlan>(await fetch(`${API_BASE}/api/routing-plans`, {
    method: 'POST',
    headers: IS_DESKTOP_RUNTIME ? await buildDesktopHttpHeaders() : { 'Content-Type': 'application/json' },
    body: JSON.stringify(plan),
  }));
}

export async function deleteRoutingPlan(planId: string): Promise<RoutingPlanList> {
  if (USE_SOCKET_TRANSPORT) return deleteRoutingPlanViaSocket(planId);
  return readJson<RoutingPlanList>(await fetch(`${API_BASE}/api/routing-plans/${planId}`, {
    method: 'DELETE',
    headers: IS_DESKTOP_RUNTIME ? await buildDesktopHttpHeaders(false) : undefined,
  }));
}

export async function saveProviderManifest(providerId: string, manifest: ProviderManifest): Promise<ProviderManifestSaveResponse> {
  if (USE_SOCKET_TRANSPORT) return saveProviderManifestViaSocket(providerId, manifest);
  const response = await fetch(`${API_BASE}/api/providers/${providerId}/manifest`, {
    method: 'PUT',
    headers: IS_DESKTOP_RUNTIME ? await buildDesktopHttpHeaders() : { 'Content-Type': 'application/json' },
    body: JSON.stringify(manifest),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return (await response.json()) as ProviderManifestSaveResponse;
}

export async function reloadProviderRegistry(): Promise<void> {
  if (USE_SOCKET_TRANSPORT) return reloadProviderRegistryViaSocket();
  const response = await fetch(`${API_BASE}/api/provider-manifests/reload`, {
    method: 'POST',
    headers: IS_DESKTOP_RUNTIME ? await buildDesktopHttpHeaders(false) : undefined,
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
}

export async function clearProviderReusePool(providerId: string): Promise<ReusePoolClearResponse> {
  if (USE_SOCKET_TRANSPORT) return clearProviderReusePoolViaSocket(providerId);
  return readJson<ReusePoolClearResponse>(await fetch(`${API_BASE}/api/providers/${providerId}/reuse-pool`, {
    method: 'POST',
    headers: IS_DESKTOP_RUNTIME ? await buildDesktopHttpHeaders(false) : undefined,
  }));
}

export async function fetchProviderCountries(providerId: string): Promise<OptionListResponse> {
  if (USE_SOCKET_TRANSPORT) return fetchProviderCountriesViaSocket(providerId);
  return readJson<OptionListResponse>(await fetch(`${API_BASE}/api/providers/${providerId}/countries`, {
    headers: IS_DESKTOP_RUNTIME ? await buildDesktopHttpHeaders(false) : undefined,
  }));
}

export async function fetchProviderServices(
  providerId: string,
  query?: { country?: string; operator?: string },
): Promise<OptionListResponse> {
  if (USE_SOCKET_TRANSPORT) return fetchProviderServicesViaSocket(providerId, query);
  return readJson<OptionListResponse>(await fetch(`${API_BASE}/api/providers/${providerId}/services`, {
    method: 'POST',
    headers: IS_DESKTOP_RUNTIME ? await buildDesktopHttpHeaders() : { 'Content-Type': 'application/json' },
    body: JSON.stringify(query ?? {}),
  }));
}

export async function refreshProviderOptions(providerId: string): Promise<ProviderDynamicOptions> {
  if (USE_SOCKET_TRANSPORT) return refreshProviderOptionsViaSocket(providerId);
  return readJson<ProviderDynamicOptions>(await fetch(`${API_BASE}/api/providers/${providerId}/refresh-options`, {
    method: 'POST',
    headers: IS_DESKTOP_RUNTIME ? await buildDesktopHttpHeaders(false) : undefined,
  }));
}

export async function fetchProviderOptionsCache(providerId: string): Promise<ProviderDynamicOptions> {
  if (USE_SOCKET_TRANSPORT) return fetchProviderOptionsCacheViaSocket(providerId);
  return readJson<ProviderDynamicOptions>(await fetch(`${API_BASE}/api/providers/${providerId}/options-cache`, {
    headers: IS_DESKTOP_RUNTIME ? await buildDesktopHttpHeaders(false) : undefined,
  }));
}

export async function fetchProviderOperators(
  providerId: string,
  query?: { country?: string },
): Promise<OptionListResponse> {
  if (USE_SOCKET_TRANSPORT) return fetchProviderOperatorsViaSocket(providerId, query);
  return readJson<OptionListResponse>(await fetch(`${API_BASE}/api/providers/${providerId}/operators`, {
    method: 'POST',
    headers: IS_DESKTOP_RUNTIME ? await buildDesktopHttpHeaders() : { 'Content-Type': 'application/json' },
    body: JSON.stringify(query ?? {}),
  }));
}

export async function fetchNotifications(): Promise<NotificationFeed> {
  if (USE_SOCKET_TRANSPORT) return fetchNotificationsViaSocket();
  return readJson<NotificationFeed>(await fetch(`${API_BASE}/api/notifications`, {
    headers: IS_DESKTOP_RUNTIME ? await buildDesktopHttpHeaders(false) : undefined,
  }));
}

export async function clearNotifications(): Promise<NotificationFeed> {
  if (USE_SOCKET_TRANSPORT) return clearNotificationsViaSocket();
  return readJson<NotificationFeed>(await fetch(`${API_BASE}/api/notifications`, {
    method: 'POST',
    headers: IS_DESKTOP_RUNTIME ? await buildDesktopHttpHeaders(false) : undefined,
  }));
}

export async function fetchRuntimeSettings(): Promise<RuntimeSettings> {
  if (USE_SOCKET_TRANSPORT) return fetchRuntimeSettingsViaSocket();
  return readJson<RuntimeSettings>(await fetch(`${API_BASE}/api/settings/runtime`, {
    headers: IS_DESKTOP_RUNTIME ? await buildDesktopHttpHeaders(false) : undefined,
  }));
}

export async function saveRuntimeSettings(next: RuntimeSettingsUpdate): Promise<RuntimeSettings> {
  if (USE_SOCKET_TRANSPORT) return saveRuntimeSettingsViaSocket(next);
  return readJson<RuntimeSettings>(await fetch(`${API_BASE}/api/settings/runtime`, {
    method: 'POST',
    headers: IS_DESKTOP_RUNTIME ? await buildDesktopHttpHeaders() : { 'Content-Type': 'application/json' },
    body: JSON.stringify(next),
  }));
}

export async function fetchOpenAiSmsRegions(): Promise<OpenAiSmsRegionsCache> {
  if (USE_SOCKET_TRANSPORT) return fetchOpenAiSmsRegionsViaSocket();
  return readJson<OpenAiSmsRegionsCache>(await fetch(`${API_BASE}/api/settings/openai-sms-regions`, {
    headers: IS_DESKTOP_RUNTIME ? await buildDesktopHttpHeaders(false) : undefined,
  }));
}

export async function checkForUpdates(currentVersion: string): Promise<UpdateCheckResult> {
  const releaseApiUrl = 'https://api.github.com/repos/netcookies/MaDao/releases/latest';
  const response = await fetch(releaseApiUrl, {
    headers: {
      Accept: 'application/vnd.github+json',
    },
  });
  if (!response.ok) {
    throw new Error(`Update check failed: ${response.status} ${response.statusText}`);
  }
  const payload = (await response.json()) as {
    tag_name?: string;
    name?: string;
    html_url?: string;
    published_at?: string;
  };
  const latestVersion = String(payload.tag_name ?? '').replace(/^v/, '').trim();
  if (!latestVersion) {
    throw new Error('Update check failed: latest release tag is missing.');
  }
  return {
    current_version: currentVersion,
    latest_version: latestVersion,
    has_update: latestVersion !== currentVersion,
    release_name: payload.name ?? null,
    release_url: payload.html_url ?? null,
    published_at: payload.published_at ?? null,
  };
}

export async function fetchOptionCacheOverview(): Promise<OptionCacheOverview> {
  if (USE_SOCKET_TRANSPORT) return fetchOptionCacheOverviewViaSocket();
  return readJson<OptionCacheOverview>(await fetch(`${API_BASE}/api/settings/option-cache`, {
    headers: IS_DESKTOP_RUNTIME ? await buildDesktopHttpHeaders(false) : undefined,
  }));
}

export async function fetchProviderBalance(providerId: string): Promise<ProviderBalance> {
  if (USE_SOCKET_TRANSPORT) return fetchProviderBalanceViaSocket(providerId);
  return readJson<ProviderBalance>(await fetch(`${API_BASE}/api/providers/${providerId}/balance`, {
    headers: IS_DESKTOP_RUNTIME ? await buildDesktopHttpHeaders(false) : undefined,
  }));
}

export async function fetchProviderPrices(
  providerId: string,
  service: string,
  query?: { country?: string; operator?: string },
): Promise<ProviderPriceResponse> {
  if (USE_SOCKET_TRANSPORT) return fetchProviderPricesViaSocket(providerId, service, query);
  return readJson<ProviderPriceResponse>(await fetch(`${API_BASE}/api/providers/${providerId}/prices`, {
    method: 'POST',
    headers: IS_DESKTOP_RUNTIME ? await buildDesktopHttpHeaders() : { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: providerId, service, country: query?.country, operator: query?.operator }),
  }));
}

export async function pollActivationTicket(ticketId: string): Promise<void> {
  if (USE_SOCKET_TRANSPORT) return pollActivationTicketViaSocket(ticketId);
  const response = await fetch(`${API_BASE}/api/poll`, {
    method: 'POST',
    headers: IS_DESKTOP_RUNTIME ? await buildDesktopHttpHeaders() : { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket_id: ticketId }),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
}

export async function releaseActivationTicket(ticketId: string, action: 'finish' | 'cancel' | 'retry'): Promise<ReleaseCodeResponse> {
  if (USE_SOCKET_TRANSPORT) return releaseActivationTicketViaSocket(ticketId, action);
  return readJson<ReleaseCodeResponse>(await fetch(`${API_BASE}/api/release`, {
    method: 'POST',
    headers: IS_DESKTOP_RUNTIME ? await buildDesktopHttpHeaders() : { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket_id: ticketId, action }),
  }));
}

export async function failoverRoutingTicket(ticketId: string, failedItemId?: string, reason?: string): Promise<ActivationAcquireResponse> {
  if (USE_SOCKET_TRANSPORT) {
    return failoverRoutingTicketViaSocket(ticketId, failedItemId, reason) as Promise<ActivationAcquireResponse>;
  }
  const response = await fetch(`${API_BASE}/api/routing/failover`, {
    method: 'POST',
    headers: IS_DESKTOP_RUNTIME ? await buildDesktopHttpHeaders() : { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ticket_id: ticketId,
      failed_item_id: failedItemId,
      reason,
    }),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return readJson<ActivationAcquireResponse>(response);
}

export async function reorderProviderManifests(order: Array<{ id: string; priority: number }>): Promise<void> {
  if (USE_SOCKET_TRANSPORT) return reorderProviderManifestsViaSocket(order);
  const response = await fetch(`${API_BASE}/api/providers/reorder`, {
    method: 'POST',
    headers: IS_DESKTOP_RUNTIME ? await buildDesktopHttpHeaders() : { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order }),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
}

export async function acquireActivation(body: Record<string, unknown>): Promise<void> {
  if (USE_SOCKET_TRANSPORT) return acquireActivationViaSocket(body);
  const response = await fetch(`${API_BASE}/api/acquire`, {
    method: 'POST',
    headers: IS_DESKTOP_RUNTIME ? await buildDesktopHttpHeaders() : { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
}

export async function regenerateHttpSecret(): Promise<RuntimeSettings> {
  if (USE_SOCKET_TRANSPORT) return regenerateHttpSecretViaSocket();
  return readJson<RuntimeSettings>(await fetch(`${API_BASE}/api/settings/runtime/regenerate-secret`, {
    method: 'POST',
    headers: IS_DESKTOP_RUNTIME ? await buildDesktopHttpHeaders(false) : undefined,
  }));
}

export async function fetchRuntimeAccessInfo(): Promise<RuntimeAccessInfo> {
  if (USE_SOCKET_TRANSPORT) return fetchRuntimeAccessInfoViaSocket();
  if (IS_DESKTOP_RUNTIME) {
    return invoke<RuntimeAccessInfo>('desktop_http_access_info');
  }
  return readJson<RuntimeAccessInfo>(await fetch(`${API_BASE}/api/access-info`));
}

export async function fetchHttpAuthStatus(): Promise<{ authenticated: boolean }> {
  if (IS_DESKTOP_RUNTIME) {
    return { authenticated: true };
  }
  return readJson<{ authenticated: boolean }>(await fetch(`${API_BASE}/auth/status`, {
    credentials: 'include',
  }));
}

export async function loginHttpAccess(secret: string): Promise<{ authenticated: boolean }> {
  if (IS_DESKTOP_RUNTIME) {
    return { authenticated: true };
  }
  return readJson<{ authenticated: boolean }>(await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ secret }),
  }));
}

export async function logoutHttpAccess(): Promise<{ authenticated: boolean }> {
  if (IS_DESKTOP_RUNTIME) {
    return { authenticated: false };
  }
  return readJson<{ authenticated: boolean }>(await fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  }));
}
