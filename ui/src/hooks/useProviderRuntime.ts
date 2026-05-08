import { startTransition, useMemo } from 'react';
import type {
  ActivationFormState,
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
  fetchOptionCacheOverview,
  fetchProviderBalance,
  fetchProviderCountries,
  fetchProviderManifests,
  fetchProviderOperators,
  fetchProviderPrices,
  fetchProviderServices,
  fetchRuntimeSettings,
  fetchRuntimeSnapshot,
  reloadProviderRegistry,
  reorderProviderManifests,
  saveProviderManifest,
  saveRuntimeSettings as persistRuntimeSettings,
} from '../services/runtimeApi';
import { refreshMenuBar } from '../services/menuBarApi';
import {
  mergeOptionItems,
  normalizeCountryOptions,
  normalizeOperatorOptions,
  normalizeServiceOptions,
} from '../app/utils';

function optionRequestValue(option?: { value?: string; provider_value?: string | null }) {
  return option?.provider_value?.trim() || option?.value?.trim() || '';
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
};

export function useProviderRuntime(
  data: DataState,
  ui: UiState,
) {
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
  const selectedStoreQuery = data.storeQueries[ui.selectedProvider] ?? {
    service: selectedManifest?.defaults.service ?? '',
    country: '',
    operator: '',
    search: '',
  };

  const sortedPrices = useMemo(() => {
    const panel = selectedPrices;
    if (!panel) return [];
    const query = selectedStoreQuery;
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
  }, [data.priceSort, selectedPrices, ui.selectedProvider, selectedStoreQuery]);

  async function loadSnapshot() {
    try {
      const runtime = await fetchRuntimeSnapshot();
      startTransition(() => data.setSnapshot(runtime));
    } catch {
      ui.setStatusMessage('Cannot connect to runtime snapshot.');
    }
  }

  async function discoverProviderOptions(provider: ProviderManifest): Promise<ProviderDynamicOptions> {
    const providerId = provider.id;
    const countriesPayload = await fetchProviderCountries(providerId);
    const rawCountries = countriesPayload.items;
    const countries = normalizeCountryOptions(rawCountries);

    const countrySeed = optionRequestValue(countries[0])
      || provider.defaults.country
      || '';
    const operatorsPayload = await fetchProviderOperators(
      providerId,
      countrySeed ? { country: countrySeed } : {},
    );
    const rawOperators = operatorsPayload.items;
    const operators = normalizeOperatorOptions(rawOperators);

    let rawServices = [];
    let services = [];
    if (provider.kind === 'five_sim') {
      if (countrySeed) {
        const operatorSeeds = operators.map((item) => optionRequestValue(item)).filter(Boolean);
        const serviceGroups = await Promise.all(
          operatorSeeds.map(async (operator) => {
            try {
              const servicesPayload = await fetchProviderServices(providerId, {
                country: countrySeed,
                operator,
              });
              return servicesPayload.items;
            } catch {
              return [];
            }
          }),
        );
        rawServices = mergeOptionItems(serviceGroups);
        services = normalizeServiceOptions(rawServices);
      }
    } else {
      const servicesPayload = await fetchProviderServices(providerId);
      rawServices = servicesPayload.items;
      services = normalizeServiceOptions(rawServices);
    }

    return {
      provider: providerId,
      raw_services: rawServices,
      raw_countries: rawCountries,
      raw_operators: rawOperators,
      services,
      countries,
      operators,
      cache_state: 'fresh',
      fetched_at: new Date().toISOString(),
    };
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
                return await discoverProviderOptions(manifest);
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
      ui.setStatusMessage('Failed to load provider manifests.');
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
      const next = await discoverProviderOptions(manifest);
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
      ui.setStatusMessage(`Failed to load options for ${providerId}.`);
    }
  }

  async function loadRuntimeSettings() {
    try {
      const settings = await fetchRuntimeSettings();
      data.setRuntimeSettings(settings);
      const cacheOverview = await fetchOptionCacheOverview();
      data.setOptionCacheOverview(cacheOverview);
    } catch {
      ui.setStatusMessage('Failed to load runtime settings.');
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
        ui.setStatusMessage(`${successMessage} Cache refresh failed: ${result.cache_refresh_error}`);
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
      await persistProvider(providerId, manifest, `Saved ${providerId}, hot-reloaded, and refreshed provider cache.`);
      ui.setShowManifestModal(false);
    } catch (error) {
      ui.setStatusMessage(`Save failed: ${String(error)}`);
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
          ? `Enabled ${providerId}, hot-reloaded, and refreshed provider cache.`
          : `Disabled ${providerId}.`,
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
      ui.setStatusMessage(`Failed to update ${providerId}: ${String(error)}`);
    }
  }

  async function reloadProviders() {
    try {
      ui.setBusyAction('reload');
      await reloadProviderRegistry();
      ui.setStatusMessage('Providers reloaded.');
      await Promise.all([loadManifests(), loadSnapshot()]);
    } catch (error) {
      ui.setStatusMessage(`Reload failed: ${String(error)}`);
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
      ui.setStatusMessage('Runtime settings saved.');
    } catch (error) {
      ui.setStatusMessage(`Failed to save runtime settings: ${String(error)}`);
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
      ui.setStatusMessage(`Balance fetched for ${providerId}.`);
    } catch (error) {
      ui.setStatusMessage(`Failed to fetch balance: ${String(error)}`);
    } finally {
      ui.setBusyAction('');
    }
  }

  async function refreshProvider(providerId: string) {
    try {
      ui.setBusyAction(`refresh-${providerId}`);
      await Promise.all([loadProviderOptions(providerId), fetchBalance(providerId)]);
      await Promise.all([loadManifests(), loadSnapshot()]);
      ui.setStatusMessage(`Refreshed cache and balance for ${providerId}.`);
    } catch (error) {
      ui.setStatusMessage(`Failed to refresh ${providerId}: ${String(error)}`);
    } finally {
      ui.setBusyAction('');
    }
  }

  async function fetchPrices(providerId: string) {
    const query = data.storeQueries[providerId];
    const service = query?.service || data.manifests[providerId]?.defaults.service;
    if (!service) return;
    try {
      ui.setBusyAction(`prices-${providerId}`);
      const payload = await fetchProviderPrices(providerId, service);
      data.setPricePanels((current) => ({
        ...current,
        [providerId]: payload,
      }));
      ui.setStatusMessage(`Prices loaded for ${providerId}.`);
    } catch (error) {
      ui.setStatusMessage(`Failed to fetch prices: ${String(error)}`);
    } finally {
      ui.setBusyAction('');
    }
  }

  function updateStoreQuery(providerId: string, patch: Partial<StoreQueryState>) {
    data.setStoreQueries((current) => ({
      ...current,
      [providerId]: {
        service: current[providerId]?.service ?? data.manifests[providerId]?.defaults.service ?? '',
        country: current[providerId]?.country ?? '',
        operator: current[providerId]?.operator ?? '',
        search: current[providerId]?.search ?? '',
        ...patch,
      },
    }));
  }

  async function reorderProviders(ids: string[]) {
    const order = ids.map((id, index) => ({ id, priority: (index + 1) * 10 }));
    try {
      await reorderProviderManifests(order);
      ui.setStatusMessage('Priority order saved.');
      await loadManifests();
    } catch (error) {
      ui.setStatusMessage(`Failed to save order: ${String(error)}`);
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
    fetchBalance,
    refreshProvider,
    fetchPrices,
    updateStoreQuery,
    reorderProviders,
    setApiKey,
    apiKeyValue,
  };
}
