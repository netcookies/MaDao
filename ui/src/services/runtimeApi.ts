import type {
  MessageFilter,
  NotificationFeed,
  OptionListResponse,
  OptionCacheOverview,
  ProviderBalance,
  ProviderDynamicOptions,
  ProviderManifest,
  ProviderManifestSaveResponse,
  ProviderManifestList,
  ProviderPriceResponse,
  RoutingPlan,
  RoutingPlanList,
  RuntimeSettings,
  RuntimeSettingsUpdate,
  Snapshot,
  UpdateCheckResult,
  RuntimeAccessInfo,
} from '../app/types';
import { API_BASE, SOCKET_PATH } from './runtimeEnv';
export { API_BASE, SOCKET_PATH, IS_DESKTOP_RUNTIME, IS_WEB_RUNTIME, CONFIG_DIRECTORY, RUNTIME_MODE } from './runtimeEnv';
import {
  acquireActivationViaSocket,
  clearNotificationsViaSocket,
  deleteRoutingPlanViaSocket,
  failoverRoutingTicketViaSocket,
  fetchNotificationsViaSocket,
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
import { IS_DESKTOP_RUNTIME } from './runtimeEnv';

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

export async function fetchRuntimeSnapshot(): Promise<Snapshot> {
  if (IS_DESKTOP_RUNTIME) return fetchRuntimeSnapshotViaSocket();
  return readJson<Snapshot>(await fetch(`${API_BASE}/api/providers`));
}

export async function fetchProviderManifests(): Promise<ProviderManifestList> {
  if (IS_DESKTOP_RUNTIME) return fetchProviderManifestsViaSocket();
  return readJson<ProviderManifestList>(await fetch(`${API_BASE}/api/provider-manifests`));
}

export async function fetchRoutingPlans(): Promise<RoutingPlanList> {
  if (IS_DESKTOP_RUNTIME) return fetchRoutingPlansViaSocket();
  return readJson<RoutingPlanList>(await fetch(`${API_BASE}/api/routing-plans`));
}

export async function saveRoutingPlan(plan: RoutingPlan): Promise<RoutingPlan> {
  if (IS_DESKTOP_RUNTIME) return saveRoutingPlanViaSocket(plan);
  return readJson<RoutingPlan>(await fetch(`${API_BASE}/api/routing-plans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(plan),
  }));
}

export async function deleteRoutingPlan(planId: string): Promise<RoutingPlanList> {
  if (IS_DESKTOP_RUNTIME) return deleteRoutingPlanViaSocket(planId);
  return readJson<RoutingPlanList>(await fetch(`${API_BASE}/api/routing-plans/${planId}`, {
    method: 'DELETE',
  }));
}

export async function saveProviderManifest(providerId: string, manifest: ProviderManifest): Promise<ProviderManifestSaveResponse> {
  if (IS_DESKTOP_RUNTIME) return saveProviderManifestViaSocket(providerId, manifest);
  const response = await fetch(`${API_BASE}/api/providers/${providerId}/manifest`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(manifest),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return (await response.json()) as ProviderManifestSaveResponse;
}

export async function reloadProviderRegistry(): Promise<void> {
  if (IS_DESKTOP_RUNTIME) return reloadProviderRegistryViaSocket();
  const response = await fetch(`${API_BASE}/api/provider-manifests/reload`, { method: 'POST' });
  if (!response.ok) throw new Error(await readErrorMessage(response));
}

export async function fetchProviderCountries(providerId: string): Promise<OptionListResponse> {
  if (IS_DESKTOP_RUNTIME) return fetchProviderCountriesViaSocket(providerId);
  return readJson<OptionListResponse>(await fetch(`${API_BASE}/api/providers/${providerId}/countries`));
}

export async function fetchProviderServices(
  providerId: string,
  query?: { country?: string; operator?: string },
): Promise<OptionListResponse> {
  if (IS_DESKTOP_RUNTIME) return fetchProviderServicesViaSocket(providerId, query);
  return readJson<OptionListResponse>(await fetch(`${API_BASE}/api/providers/${providerId}/services`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query ?? {}),
  }));
}

export async function refreshProviderOptions(providerId: string): Promise<ProviderDynamicOptions> {
  if (IS_DESKTOP_RUNTIME) return refreshProviderOptionsViaSocket(providerId);
  return readJson<ProviderDynamicOptions>(await fetch(`${API_BASE}/api/providers/${providerId}/refresh-options`, {
    method: 'POST',
  }));
}

export async function fetchProviderOptionsCache(providerId: string): Promise<ProviderDynamicOptions> {
  if (IS_DESKTOP_RUNTIME) return fetchProviderOptionsCacheViaSocket(providerId);
  return readJson<ProviderDynamicOptions>(await fetch(`${API_BASE}/api/providers/${providerId}/options-cache`));
}

export async function fetchProviderOperators(
  providerId: string,
  query?: { country?: string },
): Promise<OptionListResponse> {
  if (IS_DESKTOP_RUNTIME) return fetchProviderOperatorsViaSocket(providerId, query);
  return readJson<OptionListResponse>(await fetch(`${API_BASE}/api/providers/${providerId}/operators`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query ?? {}),
  }));
}

export async function fetchNotifications(): Promise<NotificationFeed> {
  if (IS_DESKTOP_RUNTIME) return fetchNotificationsViaSocket();
  return readJson<NotificationFeed>(await fetch(`${API_BASE}/api/notifications`));
}

export async function clearNotifications(): Promise<NotificationFeed> {
  if (IS_DESKTOP_RUNTIME) return clearNotificationsViaSocket();
  return readJson<NotificationFeed>(await fetch(`${API_BASE}/api/notifications`, {
    method: 'POST',
  }));
}

export async function fetchRuntimeSettings(): Promise<RuntimeSettings> {
  if (IS_DESKTOP_RUNTIME) return fetchRuntimeSettingsViaSocket();
  return readJson<RuntimeSettings>(await fetch(`${API_BASE}/api/settings/runtime`));
}

export async function saveRuntimeSettings(next: RuntimeSettingsUpdate): Promise<RuntimeSettings> {
  if (IS_DESKTOP_RUNTIME) return saveRuntimeSettingsViaSocket(next);
  return readJson<RuntimeSettings>(await fetch(`${API_BASE}/api/settings/runtime`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(next),
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
  if (IS_DESKTOP_RUNTIME) return fetchOptionCacheOverviewViaSocket();
  return readJson<OptionCacheOverview>(await fetch(`${API_BASE}/api/settings/option-cache`));
}

export async function fetchProviderBalance(providerId: string): Promise<ProviderBalance> {
  if (IS_DESKTOP_RUNTIME) return fetchProviderBalanceViaSocket(providerId);
  return readJson<ProviderBalance>(await fetch(`${API_BASE}/api/providers/${providerId}/balance`));
}

export async function fetchProviderPrices(
  providerId: string,
  service: string,
  query?: { country?: string; operator?: string },
): Promise<ProviderPriceResponse> {
  if (IS_DESKTOP_RUNTIME) return fetchProviderPricesViaSocket(providerId, service, query);
  return readJson<ProviderPriceResponse>(await fetch(`${API_BASE}/api/providers/${providerId}/prices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: providerId, service, country: query?.country, operator: query?.operator }),
  }));
}

export async function pollActivationTicket(ticketId: string): Promise<void> {
  if (IS_DESKTOP_RUNTIME) return pollActivationTicketViaSocket(ticketId);
  const response = await fetch(`${API_BASE}/api/poll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket_id: ticketId }),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
}

export async function releaseActivationTicket(ticketId: string, action: 'finish' | 'cancel' | 'retry'): Promise<void> {
  if (IS_DESKTOP_RUNTIME) return releaseActivationTicketViaSocket(ticketId, action);
  const response = await fetch(`${API_BASE}/api/release`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket_id: ticketId, action }),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
}

export async function failoverRoutingTicket(ticketId: string, failedItemId?: string, reason?: string): Promise<ActivationAcquireResponse> {
  if (IS_DESKTOP_RUNTIME) {
    return failoverRoutingTicketViaSocket(ticketId, failedItemId, reason) as Promise<ActivationAcquireResponse>;
  }
  const response = await fetch(`${API_BASE}/api/routing/failover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  if (IS_DESKTOP_RUNTIME) return reorderProviderManifestsViaSocket(order);
  const response = await fetch(`${API_BASE}/api/providers/reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order }),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
}

export async function acquireActivation(body: Record<string, unknown>): Promise<void> {
  if (IS_DESKTOP_RUNTIME) return acquireActivationViaSocket(body);
  const response = await fetch(`${API_BASE}/api/acquire`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
}

export async function regenerateHttpSecret(): Promise<RuntimeSettings> {
  if (IS_DESKTOP_RUNTIME) return regenerateHttpSecretViaSocket();
  return readJson<RuntimeSettings>(await fetch(`${API_BASE}/api/settings/runtime/regenerate-secret`, {
    method: 'POST',
  }));
}

export async function fetchRuntimeAccessInfo(): Promise<RuntimeAccessInfo> {
  if (IS_DESKTOP_RUNTIME) return fetchRuntimeAccessInfoViaSocket();
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
