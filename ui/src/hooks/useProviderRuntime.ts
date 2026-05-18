import { startTransition, useMemo } from 'react';
import type {
  ActivationFormState,
  LanguageCode,
  PriceSortKey,
  ProviderDynamicOptions,
  ProviderManifest,
  ProviderPriceItem,
  ProviderPriceResponse,
  ProviderSectionId,
  ProviderSummary,
  RuntimeSettings,
  RuntimeSettingsUpdate,
  Snapshot,
  StoreQueryState,
} from '../app/types';
import {
  fetchRuntimeAccessInfo,
  fetchProviderOptionsCache,
  fetchOptionCacheOverview,
  fetchProviderBalance,
  fetchProviderManifests,
  fetchProviderPrices,
  refreshProviderOptions,
  fetchRuntimeSettings,
  fetchRuntimeSnapshot,
  regenerateHttpSecret,
  reloadProviderRegistry,
  reorderProviderManifests,
  saveProviderManifest,
  saveRuntimeSettings as persistRuntimeSettings,
} from '../services/runtimeApi';
import { refreshMenuBar } from '../services/menuBarApi';
import { i18n } from '../app/i18n';
import { formatProviderErrorMessage } from '../app/providerErrors';

function normalizeOptionToken(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase();
}

function resolveCanonicalOptionValue(
  options: ProviderDynamicOptions | undefined,
  rawValue: string | undefined,
  kind: 'service' | 'country' | 'operator',
) {
  const target = normalizeOptionToken(rawValue);
  if (!target) return rawValue ?? '';
  const source = kind === 'service'
    ? options?.services
    : kind === 'country'
      ? options?.countries
      : options?.operators;
  const matched = source?.find((item) => {
    const optionValue = normalizeOptionToken(item.value);
    const providerValue = normalizeOptionToken(item.provider_value);
    const hintValue = normalizeOptionToken(item.hint);
    return optionValue === target || providerValue === target || hintValue === target;
  });
  return matched?.value ?? rawValue ?? '';
}

type DataState = {
  snapshot: Snapshot | null;
  setSnapshot: (value: Snapshot | null | ((prev: Snapshot | null) => Snapshot | null)) => void;
  manifests: Record<string, ProviderManifest>;
  setManifests: (value: Record<string, ProviderManifest> | ((prev: Record<string, ProviderManifest>) => Record<string, ProviderManifest>)) => void;
  rawEditors: Record<string, string>;
  setRawEditors: (value: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
  balances: Record<string, string>;
  setBalances: (value: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
  pricePanels: Record<string, ProviderPriceResponse>;
  setPricePanels: (value: Record<string, ProviderPriceResponse> | ((prev: Record<string, ProviderPriceResponse>) => Record<string, ProviderPriceResponse>)) => void;
  priceSort: Record<string, { key: PriceSortKey; dir: 'asc' | 'desc' }>;
  setPriceSort: (value: Record<string, { key: PriceSortKey; dir: 'asc' | 'desc' }> | ((prev: Record<string, { key: PriceSortKey; dir: 'asc' | 'desc' }>) => Record<string, { key: PriceSortKey; dir: 'asc' | 'desc' }>)) => void;
  providerOrder: string[];
  setProviderOrder: (value: string[] | ((prev: string[]) => string[])) => void;
  notifications: Array<{ timestamp: string; scope: string; level: string; message: string }>;
  setNotifications: (value: Array<{ timestamp: string; scope: string; level: string; message: string }> | ((prev: Array<{ timestamp: string; scope: string; level: string; message: string }>) => Array<{ timestamp: string; scope: string; level: string; message: string }>)) => void;
  runtimeSettings: RuntimeSettings;
  setRuntimeSettings: (value: RuntimeSettings | ((prev: RuntimeSettings) => RuntimeSettings)) => void;
  optionCacheOverview: import('../app/types').OptionCacheOverview;
  setOptionCacheOverview: (
    value:
      | import('../app/types').OptionCacheOverview
      | ((prev: import('../app/types').OptionCacheOverview) => import('../app/types').OptionCacheOverview)
  ) => void;
  providerOptions: Record<string, ProviderDynamicOptions>;
  setProviderOptions: (value: Record<string, ProviderDynamicOptions> | ((prev: Record<string, ProviderDynamicOptions>) => Record<string, ProviderDynamicOptions>)) => void;
  storeQueries: Record<string, StoreQueryState>;
  setStoreQueries: (value: Record<string, StoreQueryState> | ((prev: Record<string, StoreQueryState>) => Record<string, StoreQueryState>)) => void;
};

type UiState = {
  selectedProvider: string;
  setSelectedProvider: (value: string) => void;
  setActivationForm: (value: ActivationFormState | ((prev: ActivationFormState) => ActivationFormState)) => void;
  setStatusMessage: (value: string) => void;
  setBusyAction: (value: string) => void;
  setShowManifestModal: (value: boolean) => void;
  language: LanguageCode;
};

export function useProviderRuntime(
  data: DataState,
  ui: UiState,
) {
  const translate = i18n.getFixedT(ui.language);
  const formatError = (error: unknown) => formatProviderErrorMessage(error, ui.language);

  const manageableProviders = useMemo(
    () => Object.values(data.manifests).filter((provider) => provider.id !== 'mock' && provider.kind !== 'mock'),
    [data.manifests],
  );

  const selectableProviders = useMemo(
    () => manageableProviders.filter((provider) => {
      const summary = data.snapshot?.providers.find((item) => item.id === provider.id);
      return summary?.enabled ?? provider.enabled;
    }),
    [manageableProviders, data.snapshot],
  );

  const orderedProviders = useMemo(() => {
    const byId = Object.fromEntries(manageableProviders.map((provider) => [provider.id, provider]));
    const ordered = data.providerOrder.map((id) => byId[id]).filter(Boolean) as ProviderManifest[];
    const rest = manageableProviders.filter((provider) => !data.providerOrder.includes(provider.id));
    return [...ordered, ...rest];
  }, [manageableProviders, data.providerOrder]);

  const selectedManifest = data.manifests[ui.selectedProvider];
  const selectedSummary = data.snapshot?.providers.find((provider) => provider.id === ui.selectedProvider);
  const selectedPrices = data.pricePanels[ui.selectedProvider];
  const selectedOptions = data.providerOptions[ui.selectedProvider];
  const selectedStoreState = data.storeQueries[ui.selectedProvider];
  const selectedStoreQuery = data.storeQueries[ui.selectedProvider] ?? {
    service: resolveCanonicalOptionValue(selectedOptions, selectedManifest?.defaults.service, 'service'),
    country: resolveCanonicalOptionValue(selectedOptions, '', 'country'),
    operator: resolveCanonicalOptionValue(selectedOptions, '', 'operator'),
    search: '',
  };
  const normalizedSelectedStoreQuery = {
    service: resolveCanonicalOptionValue(selectedOptions, selectedStoreState?.service ?? selectedStoreQuery.service, 'service'),
    country: resolveCanonicalOptionValue(selectedOptions, selectedStoreState?.country ?? selectedStoreQuery.country, 'country'),
    operator: resolveCanonicalOptionValue(selectedOptions, selectedStoreState?.operator ?? selectedStoreQuery.operator, 'operator'),
    search: selectedStoreState?.search ?? selectedStoreQuery.search,
  };

  async function resolveProviderOptions(providerId: string, mode: 'cache-first' | 'refresh-only' = 'cache-first') {
    if (mode === 'refresh-only') {
      return refreshProviderOptions(providerId);
    }
    try {
      return await fetchProviderOptionsCache(providerId);
    } catch {
      return refreshProviderOptions(providerId);
    }
  }

  const sortedPrices = useMemo(() => {
    const panel = selectedPrices;
    if (!panel) return [];
    const query = normalizedSelectedStoreQuery;
    const sort = data.priceSort[ui.selectedProvider] ?? { key: 'country' as PriceSortKey, dir: 'asc' as const };
    const filtered = panel.items.filter((item) => {
      if (query.country && item.country !== query.country) return false;
      if (query.operator && item.operator !== query.operator) return false;
      if (!query.search.trim()) return true;
      const term = query.search.trim().toLowerCase();
      return [item.display_name, item.country, item.operator].some((value) => value.toLowerCase().includes(term));
    });
    return [...filtered].sort((left, right) => {
      const direction = sort.dir === 'asc' ? 1 : -1;
      switch (sort.key) {
        case 'price':
          return (left.price - right.price) * direction;
        case 'stock':
          return (left.stock - right.stock) * direction;
        case 'country':
        default:
          return left.display_name.localeCompare(right.display_name) * direction;
      }
    });
  }, [data.priceSort, selectedPrices, ui.selectedProvider, normalizedSelectedStoreQuery]);

  async function loadSnapshot() {
    try {
      const runtime = await fetchRuntimeSnapshot();
      startTransition(() => {
        data.setSnapshot(runtime);
        data.setBalances((current) => {
          const next = { ...current };
          runtime.providers.forEach((provider) => {
            if (provider.balance != null && provider.balance_currency) {
              next[provider.id] = `${provider.balance.toFixed(2)} ${provider.balance_currency}`;
            }
          });
          return next;
        });
      });
    } catch {
      ui.setStatusMessage(translate('cannot_connect_runtime_snapshot'));
    }
  }

  async function loadManifests() {
    try {
      const list = await fetchProviderManifests();
      const next: Record<string, ProviderManifest> = {};
      const editors: Record<string, string> = {};
      list.manifests.forEach((manifest) => {
        next[manifest.id] = manifest;
        editors[manifest.id] = JSON.stringify(manifest, null, 2);
      });
      const sorted = list.manifests
        .filter((manifest) => manifest.kind !== 'mock')
        .sort((left, right) => (left.priority ?? 100) - (right.priority ?? 100) || left.id.localeCompare(right.id))
        .map((manifest) => manifest.id);
      startTransition(() => {
        data.setManifests(next);
        data.setRawEditors(editors);
        data.setProviderOrder(sorted);
      });
      const optionsList = (
        await Promise.all(
          list.manifests
            .filter((manifest) => manifest.kind !== 'mock' && manifest.enabled)
            .map(async (manifest) => {
              try {
                return await resolveProviderOptions(manifest.id, 'cache-first');
              } catch {
                return null;
              }
            }),
        )
      ).filter(Boolean) as ProviderDynamicOptions[];
      const cacheOverview = await fetchOptionCacheOverview();
      data.setProviderOptions(() => Object.fromEntries(
        optionsList.map((item) => [item.provider, item]),
      ));
      data.setOptionCacheOverview(cacheOverview);
      const firstProvider = list.manifests
        .filter((manifest) => manifest.kind !== 'mock' && manifest.enabled)
        .sort((left, right) => (left.priority ?? 100) - (right.priority ?? 100) || left.id.localeCompare(right.id))[0]?.id;
      if (firstProvider) {
        const defaults = optionsList.find((item) => item.provider === firstProvider);
        ui.setActivationForm((current) => ({
          ...current,
          service: current.service || defaults?.services[0]?.value || '',
          country: current.country || defaults?.countries[0]?.value || '',
          operator: current.operator || defaults?.operators[0]?.value || '',
        }));
      }
      void refreshMenuBar().catch(() => {});
    } catch {
      ui.setStatusMessage(translate('failed_load_provider_manifests'));
    }
  }

  async function loadProviderOptions(providerId: string) {
    try {
      const manifest = data.manifests[providerId];
      if (!manifest || !manifest.enabled) {
        data.setProviderOptions((current) => {
          const next = { ...current };
          delete next[providerId];
          return next;
        });
        return;
      }
      const next = await resolveProviderOptions(providerId, 'cache-first');
      data.setProviderOptions((current) => ({
        ...current,
        [providerId]: next,
      }));
    } catch {
      data.setProviderOptions((current) => {
        const next = { ...current };
        delete next[providerId];
        return next;
      });
      ui.setStatusMessage(translate('failed_load_options_for_provider', { provider: providerId }));
    }
  }

  async function loadRuntimeSettings() {
    try {
      const [settings, cacheOverview] = await Promise.all([
        fetchRuntimeSettings(),
        fetchOptionCacheOverview(),
      ]);
      data.setRuntimeSettings(settings);
      data.setOptionCacheOverview(cacheOverview);
    } catch {
      ui.setStatusMessage(translate('failed_load_runtime_settings'));
    }
  }

  function updateManifestField(
    providerId: string,
    section: 'root' | 'defaults' | 'handler_api' | 'five_sim' | 'mock',
    field: string,
    value: string | number | boolean,
  ) {
    data.setManifests((current) => {
      const manifest = current[providerId];
      if (!manifest) return current;
      const next = structuredClone(manifest) as ProviderManifest;
      if (section === 'root') {
        (next as Record<string, unknown>)[field] = value;
      } else {
        const target = (next as Record<string, unknown>)[section] as Record<string, unknown> | undefined;
        if (target) target[field] = value;
      }
      data.setRawEditors((editors) => ({
        ...editors,
        [providerId]: JSON.stringify(next, null, 2),
      }));
      return {
        ...current,
        [providerId]: next,
      };
    });
  }

  async function persistProvider(providerId: string, manifest: ProviderManifest, successMessage: string) {
    try {
      ui.setBusyAction(`save-${providerId}`);
      const result = await saveProviderManifest(providerId, manifest);
      data.setProviderOptions((current) => {
        const existing = current[providerId];
        if (!existing) return current;
        return {
          ...current,
          [providerId]: {
            ...existing,
            cache_state: result.option_cache_state,
            fetched_at: result.option_cache_fetched_at ?? null,
          },
        };
      });
      if (result.cache_refresh_error) {
        ui.setStatusMessage(translate('cache_refresh_failed', { message: successMessage, error: result.cache_refresh_error }));
      } else {
        ui.setStatusMessage(successMessage);
      }
      await Promise.all([loadManifests(), loadSnapshot()]);
    } catch (error) {
      throw error;
    } finally {
      ui.setBusyAction('');
    }
  }

  async function saveProvider(providerId: string) {
    try {
      const manifest = JSON.parse(data.rawEditors[providerId] ?? '{}') as ProviderManifest;
      await persistProvider(providerId, manifest, translate('saved_provider_reloaded_refreshed', { provider: providerId }));
      ui.setShowManifestModal(false);
    } catch (error) {
      ui.setStatusMessage(translate('save_failed', { error: formatError(error) }));
    }
  }

  async function toggleProviderEnabled(providerId: string, enabled: boolean) {
    const previousManifest = data.manifests[providerId];
    if (!previousManifest) return;

    const previousRaw = data.rawEditors[providerId] ?? JSON.stringify(previousManifest, null, 2);
    let draft = previousManifest;
    try {
      draft = JSON.parse(previousRaw) as ProviderManifest;
    } catch {
      draft = previousManifest;
    }

    const nextManifest = structuredClone(draft) as ProviderManifest;
    nextManifest.enabled = enabled;
    const nextRaw = JSON.stringify(nextManifest, null, 2);

    data.setManifests((current) => ({
      ...current,
      [providerId]: nextManifest,
    }));
    data.setRawEditors((current) => ({
      ...current,
      [providerId]: nextRaw,
    }));

    try {
      await persistProvider(
        providerId,
        nextManifest,
        enabled
          ? translate('saved_provider_reloaded_refreshed', { provider: providerId })
          : translate('provider_disabled', { provider: providerId }),
      );
    } catch (error) {
      data.setManifests((current) => ({
        ...current,
        [providerId]: previousManifest,
      }));
      data.setRawEditors((current) => ({
        ...current,
        [providerId]: previousRaw,
      }));
      ui.setStatusMessage(translate('failed_update_provider', { provider: providerId, error: formatError(error) }));
    }
  }

  async function reloadProviders() {
    try {
      ui.setBusyAction('reload');
      await reloadProviderRegistry();
      ui.setStatusMessage(translate('providers_reloaded'));
      await Promise.all([loadManifests(), loadSnapshot()]);
    } catch (error) {
      ui.setStatusMessage(translate('reload_failed', { error: formatError(error) }));
    } finally {
      ui.setBusyAction('');
    }
  }

  async function updateRuntimeSettings(next: RuntimeSettingsUpdate) {
    try {
      ui.setBusyAction('routing-settings');
      const dataNext = await persistRuntimeSettings(next);
      data.setRuntimeSettings(dataNext);
      data.setOptionCacheOverview(await fetchOptionCacheOverview());
      ui.setStatusMessage(translate('runtime_settings_saved'));
    } catch (error) {
      ui.setStatusMessage(translate('failed_save_runtime_settings', { error: formatError(error) }));
    } finally {
      ui.setBusyAction('');
    }
  }

  async function reloadRuntimeAccessInfo() {
    try {
      const accessInfo = await fetchRuntimeAccessInfo();
      data.setRuntimeSettings((current) => ({
        ...current,
        http_port: accessInfo.http_port,
      }));
      return accessInfo;
    } catch {
      return null;
    }
  }

  async function refreshHttpSecret() {
    try {
      ui.setBusyAction('regenerate-http-secret');
      const settings = await regenerateHttpSecret();
      data.setRuntimeSettings(settings);
      ui.setStatusMessage(translate('http_secret_regenerated'));
      return await reloadRuntimeAccessInfo();
    } catch (error) {
      ui.setStatusMessage(translate('failed_regenerate_http_secret', { error: formatError(error) }));
      return null;
    } finally {
      ui.setBusyAction('');
    }
  }

  async function fetchBalance(providerId: string) {
    try {
      ui.setBusyAction(`balance-${providerId}`);
      const payload = await fetchProviderBalance(providerId);
      data.setBalances((current) => ({
        ...current,
        [providerId]: `${payload.amount.toFixed(2)} ${payload.currency}`,
      }));
      ui.setStatusMessage(translate('balance_fetched_for_provider', { provider: providerId }));
    } catch (error) {
      ui.setStatusMessage(translate('failed_fetch_balance', { error: formatError(error) }));
    } finally {
      ui.setBusyAction('');
    }
  }

  async function fetchVisibleBalances(providerIds?: string[]) {
    const targets = (providerIds ?? selectableProviders.map((provider) => provider.id))
      .filter((providerId, index, all) => providerId && all.indexOf(providerId) === index);
    if (targets.length === 0) return;

    await Promise.all(targets.map(async (providerId) => {
      try {
        const payload = await fetchProviderBalance(providerId);
        data.setBalances((current) => ({
          ...current,
          [providerId]: `${payload.amount.toFixed(2)} ${payload.currency}`,
        }));
      } catch {
        // 批量刷新余额时静默跳过单个 provider 的失败，避免页面进入时刷一排错误提示。
      }
    }));
  }

  async function refreshProvider(providerId: string) {
    try {
      ui.setBusyAction(`refresh-${providerId}`);
      const [nextOptions] = await Promise.all([resolveProviderOptions(providerId, 'refresh-only'), fetchBalance(providerId)]);
      data.setProviderOptions((current) => ({
        ...current,
        [providerId]: nextOptions,
      }));
      await Promise.all([loadManifests(), loadSnapshot(), loadRuntimeSettings()]);
      ui.setStatusMessage(translate('refreshed_cache_and_balance_for_provider', { provider: providerId }));
    } catch (error) {
      ui.setStatusMessage(translate('failed_refresh_provider', { provider: providerId, error: formatError(error) }));
    } finally {
      ui.setBusyAction('');
    }
  }

  async function fetchPrices(providerId: string) {
    const query = data.storeQueries[providerId];
    const service = resolveCanonicalOptionValue(
      data.providerOptions[providerId],
      query?.service || data.manifests[providerId]?.defaults.service,
      'service',
    );
    if (!service) return;
    try {
      ui.setBusyAction(`prices-${providerId}`);
      const payload = await fetchProviderPrices(providerId, service, {
        country: query?.country?.trim() ? query.country : undefined,
        operator: query?.operator || undefined,
      });
      data.setPricePanels((current) => ({
        ...current,
        [providerId]: payload,
      }));
      ui.setStatusMessage(translate('prices_loaded_for_provider', { provider: providerId }));
    } catch (error) {
      ui.setStatusMessage(translate('failed_fetch_prices', { error: formatError(error) }));
    } finally {
      ui.setBusyAction('');
    }
  }

  function updateStoreQuery(providerId: string, patch: Partial<StoreQueryState>) {
    const options = data.providerOptions[providerId];
    data.setStoreQueries((current) => ({
      ...current,
      [providerId]: {
        service: resolveCanonicalOptionValue(
          options,
          current[providerId]?.service ?? data.manifests[providerId]?.defaults.service,
          'service',
        ),
        country: resolveCanonicalOptionValue(options, current[providerId]?.country, 'country'),
        operator: resolveCanonicalOptionValue(options, current[providerId]?.operator, 'operator'),
        search: current[providerId]?.search ?? '',
        ...patch,
        ...(patch.service != null ? { service: resolveCanonicalOptionValue(options, patch.service, 'service') } : {}),
        ...(patch.country != null ? { country: resolveCanonicalOptionValue(options, patch.country, 'country') } : {}),
        ...(patch.operator != null ? { operator: resolveCanonicalOptionValue(options, patch.operator, 'operator') } : {}),
      },
    }));
  }

  async function reorderProviders(ids: string[]) {
    const order = ids.map((id, index) => ({ id, priority: (index + 1) * 10 }));
    try {
      await reorderProviderManifests(order);
      ui.setStatusMessage(translate('priority_order_saved'));
      await loadManifests();
    } catch (error) {
      ui.setStatusMessage(translate('failed_save_order', { error: formatError(error) }));
    }
  }

  function setApiKey(providerId: string, value: string) {
    const manifest = data.manifests[providerId];
    if (!manifest) return;
    if (manifest.handler_api) updateManifestField(providerId, 'handler_api', 'api_key', value);
    if (manifest.five_sim) updateManifestField(providerId, 'five_sim', 'api_key', value);
  }

  function apiKeyValue(manifest: ProviderManifest) {
    return String(manifest.handler_api?.api_key ?? manifest.five_sim?.api_key ?? '');
  }

  return {
    visibleProviders: selectableProviders,
    manageableProviders,
    orderedProviders,
    selectedManifest,
    selectedSummary,
    selectedPrices,
    selectedOptions,
    selectedStoreQuery,
    sortedPrices,
    loadSnapshot,
    loadManifests,
    loadProviderOptions,
    loadRuntimeSettings,
    updateManifestField,
    toggleProviderEnabled,
    saveProvider,
    reloadProviders,
    updateRuntimeSettings,
    reloadRuntimeAccessInfo,
    refreshHttpSecret,
    fetchBalance,
    fetchVisibleBalances,
    refreshProvider,
    fetchPrices,
    updateStoreQuery,
    reorderProviders,
    setApiKey,
    apiKeyValue,
  };
}
