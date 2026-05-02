import { useState } from 'react';
import type {
  LogEntry,
  PriceSortKey,
  ProviderDynamicOptions,
  ProviderManifest,
  ProviderPriceResponse,
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
  });
  const [providerOptions, setProviderOptions] = useState<Record<string, ProviderDynamicOptions>>({});
  const [storeQueries, setStoreQueries] = useState<Record<string, StoreQueryState>>({});

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
    providerOptions,
    setProviderOptions,
    storeQueries,
    setStoreQueries,
  };
}
