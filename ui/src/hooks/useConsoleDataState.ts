import { useState } from 'react';
import type {
  LogEntry,
  OptionCacheOverview,
  PriceSortKey,
  ProviderDynamicOptions,
  ProviderManifest,
  ProviderPriceResponse,
  RoutingPlan,
  RuntimeSettings,
  Snapshot,
  StoreQueryState,
} from '../app/types';

export function useConsoleDataState() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [manifests, setManifests] = useState<Record<string, ProviderManifest>>({});
  const [rawEditors, setRawEditors] = useState<Record<string, string>>({});
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [pricePanels, setPricePanels] = useState<Record<string, ProviderPriceResponse>>({});
  const [priceSort, setPriceSort] = useState<Record<string, { key: PriceSortKey; dir: 'asc' | 'desc' }>>({});
  const [providerOrder, setProviderOrder] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<LogEntry[]>([]);
  const [runtimeSettings, setRuntimeSettings] = useState<RuntimeSettings>({
    routing_strategy: 'ordered_priority',
    auto_fallback: true,
    option_cache_enabled: true,
    option_cache_poll_interval_minutes: 30,
    check_updates_on_launch: true,
    http_port: 7822,
    http_secret: '',
  });
  const [optionCacheOverview, setOptionCacheOverview] = useState<OptionCacheOverview>({
    fresh_providers: 0,
    stale_providers: 0,
    missing_providers: 0,
    last_refresh_at: null,
  });
  const [providerOptions, setProviderOptions] = useState<Record<string, ProviderDynamicOptions>>({});
  const [storeQueries, setStoreQueries] = useState<Record<string, StoreQueryState>>({});
  const [routingPlans, setRoutingPlans] = useState<RoutingPlan[]>([]);

  return {
    snapshot,
    setSnapshot,
    manifests,
    setManifests,
    rawEditors,
    setRawEditors,
    balances,
    setBalances,
    pricePanels,
    setPricePanels,
    priceSort,
    setPriceSort,
    providerOrder,
    setProviderOrder,
    notifications,
    setNotifications,
    runtimeSettings,
    setRuntimeSettings,
    optionCacheOverview,
    setOptionCacheOverview,
    providerOptions,
    setProviderOptions,
    storeQueries,
    setStoreQueries,
    routingPlans,
    setRoutingPlans,
  };
}
