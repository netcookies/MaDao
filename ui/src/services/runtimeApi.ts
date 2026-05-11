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
} from '../app/types';

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

export const API_BASE = 'http://127.0.0.1:7822';
export const SOCKET_PATH = '/tmp/madao-sms.sock';

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
  return readJson<Snapshot>(await fetch(`${API_BASE}/api/providers`));
}

export async function fetchProviderManifests(): Promise<ProviderManifestList> {
  return readJson<ProviderManifestList>(await fetch(`${API_BASE}/api/provider-manifests`));
}

export async function fetchRoutingPlans(): Promise<RoutingPlanList> {
  return readJson<RoutingPlanList>(await fetch(`${API_BASE}/api/routing-plans`));
}

export async function saveRoutingPlan(plan: RoutingPlan): Promise<RoutingPlan> {
  return readJson<RoutingPlan>(await fetch(`${API_BASE}/api/routing-plans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(plan),
  }));
}

export async function deleteRoutingPlan(planId: string): Promise<RoutingPlanList> {
  return readJson<RoutingPlanList>(await fetch(`${API_BASE}/api/routing-plans/${planId}`, {
    method: 'DELETE',
  }));
}

export async function saveProviderManifest(providerId: string, manifest: ProviderManifest): Promise<ProviderManifestSaveResponse> {
  const response = await fetch(`${API_BASE}/api/providers/${providerId}/manifest`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(manifest),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return (await response.json()) as ProviderManifestSaveResponse;
}

export async function reloadProviderRegistry(): Promise<void> {
  const response = await fetch(`${API_BASE}/api/provider-manifests/reload`, { method: 'POST' });
  if (!response.ok) throw new Error(await readErrorMessage(response));
}

export async function fetchProviderCountries(providerId: string): Promise<OptionListResponse> {
  return readJson<OptionListResponse>(await fetch(`${API_BASE}/api/providers/${providerId}/countries`));
}

export async function fetchProviderServices(
  providerId: string,
  query?: { country?: string; operator?: string },
): Promise<OptionListResponse> {
  return readJson<OptionListResponse>(await fetch(`${API_BASE}/api/providers/${providerId}/services`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query ?? {}),
  }));
}

export async function refreshProviderOptions(providerId: string): Promise<ProviderDynamicOptions> {
  return readJson<ProviderDynamicOptions>(await fetch(`${API_BASE}/api/providers/${providerId}/refresh-options`, {
    method: 'POST',
  }));
}

export async function fetchProviderOptionsCache(providerId: string): Promise<ProviderDynamicOptions> {
  return readJson<ProviderDynamicOptions>(await fetch(`${API_BASE}/api/providers/${providerId}/options-cache`));
}

export async function fetchProviderOperators(
  providerId: string,
  query?: { country?: string },
): Promise<OptionListResponse> {
  return readJson<OptionListResponse>(await fetch(`${API_BASE}/api/providers/${providerId}/operators`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query ?? {}),
  }));
}

export async function fetchNotifications(): Promise<NotificationFeed> {
  return readJson<NotificationFeed>(await fetch(`${API_BASE}/api/notifications`));
}

export async function clearNotifications(): Promise<NotificationFeed> {
  return readJson<NotificationFeed>(await fetch(`${API_BASE}/api/notifications`, {
    method: 'POST',
  }));
}

export async function fetchRuntimeSettings(): Promise<RuntimeSettings> {
  return readJson<RuntimeSettings>(await fetch(`${API_BASE}/api/settings/runtime`));
}

export async function saveRuntimeSettings(next: RuntimeSettingsUpdate): Promise<RuntimeSettings> {
  return readJson<RuntimeSettings>(await fetch(`${API_BASE}/api/settings/runtime`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(next),
  }));
}

export async function checkForUpdates(currentVersion: string): Promise<UpdateCheckResult> {
  const releaseApiUrl = 'https://cdn.gh-proxy.org/https://api.github.com/repos/netcookies/MaDao/releases/latest';
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
    release_url: payload.html_url ? `https://cdn.gh-proxy.org/${payload.html_url}` : null,
    published_at: payload.published_at ?? null,
  };
}

export async function fetchOptionCacheOverview(): Promise<OptionCacheOverview> {
  return readJson<OptionCacheOverview>(await fetch(`${API_BASE}/api/settings/option-cache`));
}

export async function fetchProviderBalance(providerId: string): Promise<ProviderBalance> {
  return readJson<ProviderBalance>(await fetch(`${API_BASE}/api/providers/${providerId}/balance`));
}

export async function fetchProviderPrices(
  providerId: string,
  service: string,
  query?: { country?: string; operator?: string },
): Promise<ProviderPriceResponse> {
  return readJson<ProviderPriceResponse>(await fetch(`${API_BASE}/api/providers/${providerId}/prices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: providerId, service, country: query?.country, operator: query?.operator }),
  }));
}

export async function pollActivationTicket(ticketId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/poll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket_id: ticketId }),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
}

export async function releaseActivationTicket(ticketId: string, action: 'finish' | 'cancel' | 'retry'): Promise<void> {
  const response = await fetch(`${API_BASE}/api/release`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket_id: ticketId, action }),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
}

export async function failoverRoutingTicket(ticketId: string, failedItemId?: string, reason?: string): Promise<ActivationAcquireResponse> {
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
  const response = await fetch(`${API_BASE}/api/providers/reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order }),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
}

export async function acquireActivation(body: Record<string, unknown>): Promise<void> {
  const response = await fetch(`${API_BASE}/api/acquire`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
}
