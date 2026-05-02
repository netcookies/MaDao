import {
  startTransition, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import {
  Bell, Bot, ChevronLeft, ChevronsUpDown, Copy, GripVertical, LayoutDashboard,
  Loader2, MessageSquare, Minus, PanelLeft, Plus, Search, Send, Server, Settings,
  Shield, ShoppingCart, Sliders, Smartphone, Square, Terminal, User, Wallet, X,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import {
  AppButton,
  ConfigRow,
  DataTable,
  DetailRow,
  ModalField,
  PageHeader,
  SearchField,
  SectionHeader,
  SegmentedControl,
  SelectTrigger,
  StatusBadge,
  StatusPill,
} from './app/ui-bridge';
import { MessagesScreen } from './app/messages/MessagesScreen';
import { NotifIcon } from './app/overlays/NotifIcon';
import { NewActivationModal } from './app/overlays/NewActivationModal';
import { ManifestModal } from './app/overlays/ManifestModal';
import { SearchSelectorModal } from './app/overlays/SearchSelectorModal';
import { OverviewScreen } from './app/overview/OverviewScreen';
import { ProviderWorkspaceScreen } from './app/providers/ProviderWorkspaceScreen';
import { ProvidersListScreen } from './app/providers/ProvidersListScreen';
import type {
  ActivationFormState,
  AppearanceTheme,
  LanguageCode,
  LogEntry,
  LogFilter,
  MessageFilter,
  NotificationFeed,
  OptionItem,
  PriceSortKey,
  ProviderBalance,
  ProviderDynamicOptions,
  ProviderManifest,
  ProviderManifestList,
  ProviderPriceItem,
  ProviderPriceResponse,
  ProviderSectionId,
  ProviderSummary,
  RoutingStrategy,
  RuntimeSettings,
  RuntimeSettingsUpdate,
  ScreenId,
  SelectorKind,
  SelectorState,
  Snapshot,
  StoreQueryState,
  TicketRecord,
} from './app/types';
import { LogsScreen } from './app/logs/LogsScreen';
import { SettingsScreen } from './app/settings/SettingsScreen';
import {
  countryBadge,
  formatCountryLabel,
  formatProviderLabel,
  formatRelativeTime,
  formatServiceLabel,
  getTicketPhase,
} from './lib/formatters';
import { cx } from './lib/cx';
import { mergeOptionItems } from './app/utils';
import { useConsoleDataState } from './hooks/useConsoleDataState';
import { useConsoleUiState } from './hooks/useConsoleUiState';
import { getScreenshotMeasureSelector, getScreenshotScenario, isIsolatedScreenshotTarget, type ScreenshotTarget } from './screenshot-mode';

type SidebarItem = { id: ScreenId; label: string; Icon: typeof LayoutDashboard };
type ScreenshotScenario = ReturnType<typeof getScreenshotScenario>;

const API_BASE = 'http://127.0.0.1:7822';
const SOCKET_PATH = '/tmp/madao-sms.sock';
const screenshotTarget = (window as Window & {
  __MA_DAO_SCREENSHOT_TARGET__?: ScreenshotTarget;
}).__MA_DAO_SCREENSHOT_TARGET__ ?? null;

const NAV_ITEMS: SidebarItem[] = [
  { id: 'overview', label: 'Overview', Icon: LayoutDashboard },
  { id: 'providers', label: 'Providers', Icon: Server },
  { id: 'messages', label: 'Messages', Icon: MessageSquare },
  { id: 'settings', label: 'Settings', Icon: Settings },
  { id: 'logs', label: 'Logs', Icon: Terminal },
];

const MESSAGE_FILTERS: Array<{ id: MessageFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'received', label: 'Received' },
  { id: 'waiting', label: 'Waiting' },
  { id: 'failed', label: 'Failed' },
];

const WORKSPACE_SECTIONS: Array<{ id: ProviderSectionId; label: string; Icon: typeof Sliders }> = [
  { id: 'config', label: 'Configuration', Icon: Sliders },
  { id: 'store', label: 'Store & Inventory', Icon: ShoppingCart },
  { id: 'wallet', label: 'Wallet Balance', Icon: Wallet },
];

const ROUTING_STRATEGIES: Array<{ id: RoutingStrategy; label: string }> = [
  { id: 'ordered_priority', label: 'Ordered Priority' },
  { id: 'lowest_price', label: 'Lowest Price' },
  { id: 'highest_stock', label: 'Highest Stock' },
];

const LOG_FILTERS: Array<{ id: LogFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'info', label: 'Info' },
  { id: 'warn', label: 'Warn' },
  { id: 'error', label: 'Error' },
];

export function App() {
  const {
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
  } = useConsoleDataState();
  const {
    selectedProvider,
    setSelectedProvider,
    statusMessage,
    setStatusMessage,
    busyAction,
    setBusyAction,
    activeScreen,
    setActiveScreen,
    providerView,
    setProviderView,
    activeProviderSection,
    setActiveProviderSection,
    autoRefresh,
    setAutoRefresh,
    showAdvancedEditor,
    setShowAdvancedEditor,
    compactTables,
    setCompactTables,
    messageFilter,
    setMessageFilter,
    logsFilter,
    setLogsFilter,
    logsSearch,
    setLogsSearch,
    selectorState,
    setSelectorState,
    selectorSearch,
    setSelectorSearch,
    showManifestModal,
    setShowManifestModal,
    showActivationModal,
    setShowActivationModal,
    activationForm,
    setActivationForm,
    activationBusy,
    setActivationBusy,
    activationError,
    setActivationError,
    showNotifications,
    setShowNotifications,
    notificationCursor,
    setNotificationCursor,
    appearanceTheme,
    setAppearanceTheme,
    language,
    setLanguage,
  } = useConsoleUiState();
  const [isScreenshotMode] = useState(Boolean(screenshotTarget));

  useEffect(() => {
    if (isScreenshotMode && screenshotTarget) {
      applyScreenshotScenario(getScreenshotScenario(screenshotTarget));
      return;
    }
    void Promise.all([loadSnapshot(), loadManifests(), loadNotifications(), loadRuntimeSettings()]);
  }, [isScreenshotMode]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => {
      void loadSnapshot();
      void loadNotifications();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [autoRefresh]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = appearanceTheme;
    root.dataset.language = language;
  }, [appearanceTheme, language]);

  const visibleProviders = useMemo(
    () => Object.values(manifests).filter((provider) => provider.id !== 'mock' && provider.kind !== 'mock'),
    [manifests],
  );

  useEffect(() => {
    if (visibleProviders.length === 0) return;
    if (!visibleProviders.some((provider) => provider.id === selectedProvider)) {
      const initial = visibleProviders[0].id;
      setSelectedProvider(initial);
      setActivationForm((current) => ({
        ...current,
        provider: 'auto',
      }));
    }
  }, [visibleProviders, selectedProvider]);

  const selectedManifest = manifests[selectedProvider];
  const selectedSummary = snapshot?.providers.find((provider) => provider.id === selectedProvider);
  const selectedPrices = pricePanels[selectedProvider];
  const selectedOptions = providerOptions[selectedProvider];
  const selectedStoreQuery = storeQueries[selectedProvider] ?? {
    service: selectedManifest?.defaults.service ?? '',
    country: '',
    operator: '',
    search: '',
  };

  const filteredMessages = useMemo(() => {
    const tickets = (snapshot?.tickets ?? []).filter((ticket) => ticket.provider !== 'mock');
    if (messageFilter === 'all') return tickets;
    return tickets.filter((ticket) => getTicketPhase(ticket.status) === messageFilter);
  }, [snapshot, messageFilter]);

  const filteredLogs = useMemo(() => {
    const logs = snapshot?.logs ?? [];
    return logs.filter((entry) => {
      if (logsFilter !== 'all' && entry.level.toLowerCase() !== logsFilter) return false;
      if (!logsSearch.trim()) return true;
      const term = logsSearch.trim().toLowerCase();
      return [entry.scope, entry.level, entry.message].some((value) => value.toLowerCase().includes(term));
    });
  }, [logsFilter, logsSearch, snapshot]);

  useEffect(() => {
    const waitingTicket = filteredMessages.find((ticket) => getTicketPhase(ticket.status) === 'waiting');
    if (!waitingTicket) return undefined;
    const timer = window.setInterval(() => {
      void pollTicket(waitingTicket.id);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [filteredMessages]);

  const overviewStats = useMemo(() => {
    const providers = (snapshot?.providers ?? []).filter((provider) => provider.id !== 'mock');
    const tickets = (snapshot?.tickets ?? []).filter((ticket) => ticket.provider !== 'mock');
    return {
      totalMessages: tickets.length.toLocaleString(),
      activeProviders: providers.filter((provider) => provider.enabled).length.toString(),
      successRate: `${tickets.length === 0 ? '100.0' : ((tickets.filter((ticket) => ticket.status === 'CodeReceived').length / tickets.length) * 100).toFixed(1)}%`,
    };
  }, [snapshot]);

  const recentActivity = useMemo(() => {
    const tickets = (snapshot?.tickets ?? []).filter((ticket) => ticket.provider !== 'mock');
    if (tickets.length > 0) return tickets.slice(0, 6);
    return (snapshot?.providers ?? [])
      .filter((provider) => provider.id !== 'mock')
      .slice(0, 3)
      .map((provider, index) => ({
        id: provider.id,
        provider: provider.name,
        service: provider.default_service,
        country: provider.default_country,
        phone_number: provider.primary_endpoint ?? 'No endpoint',
        status: provider.enabled ? 'Connected' : 'Standby',
        price: null,
        code: null,
        message: `Row ${index + 1}`,
      }));
  }, [snapshot]);

  const orderedProviders = useMemo(() => {
    const byId = Object.fromEntries(visibleProviders.map((provider) => [provider.id, provider]));
    const ordered = providerOrder.map((id) => byId[id]).filter(Boolean) as ProviderManifest[];
    const rest = visibleProviders.filter((provider) => !providerOrder.includes(provider.id));
    return [...ordered, ...rest];
  }, [visibleProviders, providerOrder]);

  const filteredSelectorOptions = useMemo(() => {
    if (!selectorState) return [];
    if (!selectorSearch.trim()) return selectorState.options;
    const term = selectorSearch.toLowerCase();
    return selectorState.options.filter((option) =>
      [option.label, option.value, option.hint].some((value) => value.toLowerCase().includes(term)),
    );
  }, [selectorSearch, selectorState]);

  const sortedPrices = useMemo(() => {
    const panel = selectedPrices;
    if (!panel) return [];
    const query = selectedStoreQuery;
    const sort = priceSort[selectedProvider] ?? { key: 'country' as PriceSortKey, dir: 'asc' as const };
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
  }, [priceSort, selectedPrices, selectedProvider, selectedStoreQuery]);

  async function loadSnapshot() {
    if (isScreenshotMode) return;
    try {
      const response = await fetch(`${API_BASE}/api/providers`);
      const data = (await response.json()) as Snapshot;
      startTransition(() => setSnapshot(data));
    } catch {
      setStatusMessage('Cannot connect to runtime snapshot.');
    }
  }

  async function loadManifests() {
    if (isScreenshotMode) return;
    try {
      const response = await fetch(`${API_BASE}/api/provider-manifests`);
      const data = (await response.json()) as ProviderManifestList;
      const next: Record<string, ProviderManifest> = {};
      const editors: Record<string, string> = {};
      data.manifests.forEach((manifest) => {
        next[manifest.id] = manifest;
        editors[manifest.id] = JSON.stringify(manifest, null, 2);
      });
      const sorted = data.manifests
        .filter((manifest) => manifest.kind !== 'mock')
        .sort((left, right) => (left.priority ?? 100) - (right.priority ?? 100) || left.id.localeCompare(right.id))
        .map((manifest) => manifest.id);
      startTransition(() => {
        setManifests(next);
        setRawEditors(editors);
        setProviderOrder(sorted);
      });
      const optionsList = await Promise.all(
        data.manifests
          .filter((manifest) => manifest.kind !== 'mock')
          .map((manifest) => fetchProviderOptions(manifest.id)),
      );
      setProviderOptions((current) => {
        const nextOptions = { ...current };
        optionsList.forEach((options) => {
          nextOptions[options.provider] = options;
        });
        return nextOptions;
      });
      const firstProvider = sorted[0];
      if (firstProvider) {
        const defaults = optionsList.find((item) => item.provider === firstProvider);
        setActivationForm((current) => ({
          ...current,
          service: current.service || defaults?.services[0]?.value || '',
          country: current.country || defaults?.countries[0]?.value || '',
          operator: current.operator || defaults?.operators[0]?.value || '',
        }));
      }
    } catch {
      setStatusMessage('Failed to load provider manifests.');
    }
  }

  async function fetchProviderOptions(providerId: string): Promise<ProviderDynamicOptions> {
    const response = await fetch(`${API_BASE}/api/providers/${providerId}/options`);
    if (!response.ok) throw new Error(await response.text());
    return (await response.json()) as ProviderDynamicOptions;
  }

  async function loadProviderOptions(providerId: string) {
    if (isScreenshotMode) return;
    try {
      const data = await fetchProviderOptions(providerId);
      setProviderOptions((current) => ({
        ...current,
        [providerId]: data,
      }));
    } catch {
      setStatusMessage(`Failed to load options for ${providerId}.`);
    }
  }

  async function loadNotifications() {
    if (isScreenshotMode) return;
    try {
      const response = await fetch(`${API_BASE}/api/notifications`);
      const data = (await response.json()) as NotificationFeed;
      setNotifications(data.items);
    } catch {
      setNotifications([]);
    }
  }

  function markNotificationsRead() {
    setNotificationCursor(notifications.length);
    setStatusMessage('Notifications marked as read.');
  }

  async function loadRuntimeSettings() {
    if (isScreenshotMode) return;
    try {
      const response = await fetch(`${API_BASE}/api/settings/runtime`);
      const data = (await response.json()) as RuntimeSettings;
      setRuntimeSettings(data);
    } catch {
      setStatusMessage('Failed to load routing rules.');
    }
  }

  function updateManifestField(
    providerId: string,
    section: 'root' | 'defaults' | 'handler_api' | 'five_sim' | 'mock',
    field: string,
    value: string | number | boolean,
  ) {
    setManifests((current) => {
      const manifest = current[providerId];
      if (!manifest) return current;
      const next = structuredClone(manifest) as ProviderManifest;
      if (section === 'root') {
        (next as Record<string, unknown>)[field] = value;
      } else {
        const target = (next as Record<string, unknown>)[section] as Record<string, unknown> | undefined;
        if (target) target[field] = value;
      }
      setRawEditors((editors) => ({
        ...editors,
        [providerId]: JSON.stringify(next, null, 2),
      }));
      return {
        ...current,
        [providerId]: next,
      };
    });
  }

  async function saveProvider(providerId: string) {
    if (isScreenshotMode) return;
    try {
      setBusyAction(`save-${providerId}`);
      const manifest = JSON.parse(rawEditors[providerId] ?? '{}') as ProviderManifest;
      const response = await fetch(`${API_BASE}/api/providers/${providerId}/manifest`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(manifest),
      });
      if (!response.ok) {
        const error = (await response.json()) as { message?: string };
        throw new Error(error.message ?? response.statusText);
      }
      setStatusMessage(`Saved ${providerId} and hot-reloaded.`);
      await Promise.all([loadManifests(), loadSnapshot(), loadNotifications()]);
      setShowManifestModal(false);
    } catch (error) {
      setStatusMessage(`Save failed: ${String(error)}`);
    } finally {
      setBusyAction('');
    }
  }

  async function reloadProviders() {
    if (isScreenshotMode) return;
    try {
      setBusyAction('reload');
      const response = await fetch(`${API_BASE}/api/provider-manifests/reload`, { method: 'POST' });
      if (!response.ok) throw new Error(await response.text());
      setStatusMessage('Providers reloaded.');
      await Promise.all([loadManifests(), loadSnapshot(), loadNotifications()]);
    } catch (error) {
      setStatusMessage(`Reload failed: ${String(error)}`);
    } finally {
      setBusyAction('');
    }
  }

  async function updateRuntimeSettings(next: RuntimeSettingsUpdate) {
    if (isScreenshotMode) return;
    try {
      setBusyAction('routing-settings');
      const response = await fetch(`${API_BASE}/api/settings/runtime`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (!response.ok) throw new Error(await response.text());
      const data = (await response.json()) as RuntimeSettings;
      setRuntimeSettings(data);
      setStatusMessage('Routing rules saved.');
      await loadNotifications();
    } catch (error) {
      setStatusMessage(`Failed to save routing rules: ${String(error)}`);
    } finally {
      setBusyAction('');
    }
  }

  async function fetchBalance(providerId: string) {
    if (isScreenshotMode) return;
    try {
      setBusyAction(`balance-${providerId}`);
      const response = await fetch(`${API_BASE}/api/providers/${providerId}/balance`);
      if (!response.ok) throw new Error(await response.text());
      const payload = (await response.json()) as ProviderBalance;
      setBalances((current) => ({
        ...current,
        [providerId]: `${payload.amount.toFixed(2)} ${payload.currency}`,
      }));
      setStatusMessage(`Balance fetched for ${providerId}.`);
    } catch (error) {
      setStatusMessage(`Failed to fetch balance: ${String(error)}`);
    } finally {
      setBusyAction('');
    }
  }

  async function fetchPrices(providerId: string) {
    if (isScreenshotMode) return;
    const query = storeQueries[providerId];
    const service = query?.service || manifests[providerId]?.defaults.service;
    if (!service) return;
    try {
      setBusyAction(`prices-${providerId}`);
      const response = await fetch(`${API_BASE}/api/providers/${providerId}/prices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: providerId, service }),
      });
      if (!response.ok) throw new Error(await response.text());
      const payload = (await response.json()) as ProviderPriceResponse;
      setPricePanels((current) => ({
        ...current,
        [providerId]: payload,
      }));
      setStatusMessage(`Prices loaded for ${providerId}.`);
    } catch (error) {
      setStatusMessage(`Failed to fetch prices: ${String(error)}`);
    } finally {
      setBusyAction('');
    }
  }

  async function pollTicket(ticketId: string) {
    if (isScreenshotMode) return;
    try {
      setBusyAction(`poll-${ticketId}`);
      const response = await fetch(`${API_BASE}/api/poll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_id: ticketId }),
      });
      if (!response.ok) throw new Error(await response.text());
      setStatusMessage(`Ticket ${ticketId} refreshed.`);
      await Promise.all([loadSnapshot(), loadNotifications()]);
    } catch (error) {
      setStatusMessage(`Failed to refresh ticket: ${String(error)}`);
    } finally {
      setBusyAction('');
    }
  }

  async function releaseTicket(ticketId: string, action: 'finish' | 'cancel' | 'retry') {
    if (isScreenshotMode) return;
    try {
      setBusyAction(`${action}-${ticketId}`);
      const response = await fetch(`${API_BASE}/api/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_id: ticketId, action }),
      });
      if (!response.ok) throw new Error(await response.text());
      setStatusMessage(`Ticket ${ticketId} ${action} complete.`);
      await Promise.all([loadSnapshot(), loadNotifications()]);
    } catch (error) {
      setStatusMessage(`Failed to update ticket: ${String(error)}`);
    } finally {
      setBusyAction('');
    }
  }

  async function copyToClipboard(value: string, label: string) {
    if (isScreenshotMode) return;
    try {
      await navigator.clipboard.writeText(value);
      setStatusMessage(`${label} copied.`);
    } catch (error) {
      setStatusMessage(`Copy failed: ${String(error)}`);
    }
  }

  function updateStoreQuery(providerId: string, patch: Partial<StoreQueryState>) {
    setStoreQueries((current) => ({
      ...current,
      [providerId]: {
        service: current[providerId]?.service ?? manifests[providerId]?.defaults.service ?? '',
        country: current[providerId]?.country ?? '',
        operator: current[providerId]?.operator ?? '',
        search: current[providerId]?.search ?? '',
        ...patch,
      },
    }));
  }

  async function reorderProviders(ids: string[]) {
    if (isScreenshotMode) return;
    const order = ids.map((id, index) => ({ id, priority: (index + 1) * 10 }));
    try {
      const response = await fetch(`${API_BASE}/api/providers/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order }),
      });
      if (!response.ok) throw new Error(await response.text());
      setStatusMessage('Priority order saved.');
      await Promise.all([loadManifests(), loadNotifications()]);
    } catch (error) {
      setStatusMessage(`Failed to save order: ${String(error)}`);
    }
  }

  async function submitActivation() {
    if (isScreenshotMode) return;
    setActivationBusy(true);
    setActivationError('');
    try {
      const body: Record<string, unknown> = {
        provider: activationForm.provider,
        service: activationForm.service || undefined,
        country: activationForm.country || undefined,
      };
      if (activationForm.min_price !== '') body.min_price = Number(activationForm.min_price);
      if (activationForm.max_price !== '') body.max_price = Number(activationForm.max_price);
      if (activationForm.operator) body.metadata = { operator: activationForm.operator };
      const response = await fetch(`${API_BASE}/api/acquire`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const error = (await response.json()) as { message?: string };
        throw new Error(error.message ?? response.statusText);
      }
      setShowActivationModal(false);
      setStatusMessage('Activation created, waiting for SMS code.');
      await Promise.all([loadSnapshot(), loadNotifications()]);
    } catch (error) {
      setActivationError(String(error));
    } finally {
      setActivationBusy(false);
    }
  }

  function openSelector(kind: SelectorKind) {
    let options: OptionItem[] = [];
    let title = '';
    if (kind === 'service') {
      options = selectedOptions?.services ?? [];
      title = 'Select Default Service';
    } else if (kind === 'country') {
      options = selectedOptions?.countries ?? [];
      title = 'Select Default Country';
    } else if (kind === 'provider') {
      options = visibleProviders.map((provider) => ({
        value: provider.id,
        label: provider.name,
        hint: provider.kind,
      }));
      title = 'Select Provider';
    } else if (kind === 'store-service') {
      options = selectedOptions?.services ?? [];
      title = 'Select Store Service';
    } else if (kind === 'store-country') {
      options = selectedOptions?.countries ?? [];
      title = 'Select Store Country';
    } else if (kind === 'store-operator') {
      options = selectedOptions?.operators ?? [];
      title = 'Select Store Operator';
    } else if (kind === 'activation-service') {
      if (activationForm.provider === 'auto') {
        options = mergeOptionItems(Object.values(providerOptions).map((item) => item.services));
      } else {
        options = providerOptions[activationForm.provider]?.services ?? [];
      }
      title = 'Select Activation Service';
    } else if (kind === 'activation-country') {
      if (activationForm.provider === 'auto') {
        options = mergeOptionItems(Object.values(providerOptions).map((item) => item.countries));
      } else {
        options = providerOptions[activationForm.provider]?.countries ?? [];
      }
      title = 'Select Activation Country';
    } else if (kind === 'activation-operator') {
      if (activationForm.provider === 'auto') {
        options = mergeOptionItems(Object.values(providerOptions).map((item) => item.operators));
      } else {
        options = providerOptions[activationForm.provider]?.operators ?? [];
      }
      title = 'Select Activation Operator';
    }
    setSelectorSearch('');
    setSelectorState({ kind, title, options });
  }

  function applySelectorOption(option: OptionItem) {
    if (!selectorState) return;
    if (selectorState.kind === 'service' || selectorState.kind === 'country') {
      updateManifestField(selectedProvider, 'defaults', selectorState.kind, option.value);
    } else if (selectorState.kind === 'store-service') {
      updateStoreQuery(selectedProvider, { service: option.value });
    } else if (selectorState.kind === 'store-country') {
      updateStoreQuery(selectedProvider, { country: option.value });
    } else if (selectorState.kind === 'store-operator') {
      updateStoreQuery(selectedProvider, { operator: option.value });
    } else if (selectorState.kind === 'provider') {
      const options = providerOptions[option.value];
      setActivationForm((current) => ({
        ...current,
        provider: option.value,
        service: options?.services[0]?.value ?? current.service,
        country: options?.countries[0]?.value ?? current.country,
        operator: options?.operators[0]?.value ?? current.operator,
      }));
    } else if (selectorState.kind === 'activation-service') {
      setActivationForm((current) => ({ ...current, service: option.value }));
    } else if (selectorState.kind === 'activation-country') {
      setActivationForm((current) => ({ ...current, country: option.value }));
    } else if (selectorState.kind === 'activation-operator') {
      setActivationForm((current) => ({ ...current, operator: option.value }));
    }
    setSelectorState(null);
  }

  function setApiKey(providerId: string, value: string) {
    const manifest = manifests[providerId];
    if (!manifest) return;
    if (manifest.handler_api) updateManifestField(providerId, 'handler_api', 'api_key', value);
    if (manifest.five_sim) updateManifestField(providerId, 'five_sim', 'api_key', value);
  }

  function apiKeyValue(manifest: ProviderManifest) {
    return String(manifest.handler_api?.api_key ?? manifest.five_sim?.api_key ?? '');
  }

  async function handleWindowAction(action: 'minimize' | 'maximize_toggle' | 'close') {
    if (isScreenshotMode) return;
    try {
      await invoke('window_action', { action });
    } catch (error) {
      setStatusMessage(`Window action failed: ${String(error)}`);
    }
  }

  const toolbarTitle = activeScreen === 'providers' && providerView === 'workspace'
    ? `Providers › ${manifests[selectedProvider]?.name ?? selectedProvider}`
    : NAV_ITEMS.find((item) => item.id === activeScreen)?.label ?? '';

  function applyScreenshotScenario(scenario: ScreenshotScenario) {
    const manifestMap = Object.fromEntries(
      scenario.manifests.map((manifest) => [manifest.id, manifest as ProviderManifest]),
    );
    setSnapshot(scenario.snapshot);
    setManifests(manifestMap);
    setRawEditors(
      Object.fromEntries(
        scenario.manifests.map((manifest) => [manifest.id, JSON.stringify(manifest, null, 2)]),
      ),
    );
    setProviderOrder(
      scenario.manifests
        .filter((manifest) => manifest.kind !== 'mock')
        .map((manifest) => manifest.id),
    );
    setProviderOptions(scenario.providerOptions);
    setPricePanels(scenario.pricePanels);
    setBalances(scenario.balances);
    setRuntimeSettings({
      routing_strategy: scenario.runtimeSettings.routing_strategy as RoutingStrategy,
      auto_fallback: Boolean(scenario.runtimeSettings.auto_fallback),
    });
    setSelectedProvider(scenario.selectedProvider);
    setActiveScreen(scenario.activeScreen as ScreenId);
    setProviderView(scenario.providerView as 'list' | 'workspace');
    setActiveProviderSection(scenario.activeProviderSection as ProviderSectionId);
    setNotifications(scenario.notifications);
    setShowNotifications(Boolean(scenario.showNotifications));
    setShowActivationModal(Boolean(scenario.showActivationModal));
    setActivationForm(scenario.activationForm);
    setStoreQueries(scenario.storeQueries);
    setMessageFilter(scenario.messageFilter as MessageFilter);
    setLogsFilter(scenario.logsFilter as LogFilter);
    setLogsSearch(scenario.logsSearch);
    setStatusMessage(scenario.statusMessage);
    setNotificationCursor(scenario.notificationCursor);
    setAppearanceTheme(scenario.appearanceTheme as AppearanceTheme);
    setLanguage(scenario.language as LanguageCode);
    setCompactTables(Boolean(scenario.compactTables));
    setAutoRefresh(false);
  }

  return (
    <div className={cx(`app-root${compactTables ? ' compact' : ''}`, isScreenshotMode && screenshotTarget && isIsolatedScreenshotTarget(screenshotTarget) && 'is-screenshot-isolated')}>
      <div className="mac-window">
        <aside className="d-sidebar">
          <div className="d-traffic">
            <button className="traffic red" aria-label="Close" onClick={() => void handleWindowAction('close')} />
            <button className="traffic yellow" aria-label="Minimize" onClick={() => void handleWindowAction('minimize')} />
            <button className="traffic green" aria-label="Toggle Maximize" onClick={() => void handleWindowAction('maximize_toggle')} />
          </div>
          <nav className="d-nav">
            {NAV_ITEMS.map(({ id, label, Icon }) => {
              const active = activeScreen === id;
              return (
                <button
                  key={id}
                  className={`d-nav-item${active ? ' active' : ''}`}
                  onClick={() => {
                    setActiveScreen(id);
                    if (id === 'providers') setProviderView('list');
                  }}
                >
                  <Icon size={16} opacity={active ? 1 : 0.6} />
                  <span>{label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="d-main">
          <header className="d-toolbar">
            <div className="d-toolbar-left">
              {activeScreen === 'providers' && providerView === 'workspace'
                ? (
                  <button className="d-toolbar-nav-btn" aria-label="Back to providers" onClick={() => setProviderView('list')}>
                    <ChevronLeft size={16} />
                  </button>
                )
                : (
                  <span className="d-toolbar-nav-btn d-toolbar-nav-static" aria-hidden="true">
                    <PanelLeft size={16} />
                  </span>
                )}
              <span className="d-toolbar-title">{toolbarTitle}</span>
            </div>
            <div className="d-toolbar-right">
              <div className="d-notification-wrap">
                <button className="d-icon-btn d-icon-btn-toolbar" onClick={() => setShowNotifications((current) => !current)}>
                  <Bell size={16} style={{ opacity: 0.6 }} />
                </button>
                {showNotifications && (
                  <div className="d-notification-panel">
                    <div className="d-notification-panel-head">
                      <strong>Notifications</strong>
                      <span className="d-note-link" onClick={markNotificationsRead}>Mark all read</span>
                    </div>
                    <div className="d-notification-list">
                      {notifications.length > 0 ? notifications.map((entry, index) => (
                        <div className="d-notification-item" key={`${entry.timestamp}-${index}`}>
                          <div className="d-notification-title-row">
                            <NotifIcon level={entry.level.toLowerCase()} />
                            <strong>{entry.message}</strong>
                          </div>
                          <small>{formatProviderLabel(entry.scope)} · {index < notificationCursor ? 'read' : formatRelativeTime(entry.timestamp)}</small>
                        </div>
                      )) : <div className="d-empty">No events.</div>}
                    </div>
                    <div className="d-notification-panel-foot">
                      <AppButton variant="ghost" size="utility" onClick={() => { setActiveScreen('logs'); setShowNotifications(false); }}>
                        View all in Logs →
                      </AppButton>
                    </div>
                  </div>
                )}
              </div>
              <AppButton variant="primary" onClick={() => setShowActivationModal(true)}>
                <Plus size={14} />
                <span>New Activation</span>
              </AppButton>
            </div>
          </header>

          <div className="d-content">
            {activeScreen === 'overview' && (
              <OverviewScreen
                stats={overviewStats}
                activity={recentActivity}
                statusMessage={statusMessage}
                onViewAll={() => setActiveScreen('messages')}
              />
            )}

            {activeScreen === 'providers' && providerView === 'list' && (
              <ProvidersListScreen
                providers={orderedProviders}
                onConfigure={(id) => {
                  setSelectedProvider(id);
                  setProviderView('workspace');
                  setActiveProviderSection('config');
                }}
                onReorder={(ids) => {
                  setProviderOrder(ids);
                  void reorderProviders(ids);
                }}
              />
            )}

            {activeScreen === 'providers' && providerView === 'workspace' && selectedManifest && (
              <ProviderWorkspaceScreen
                manifest={selectedManifest}
                summary={selectedSummary}
                section={activeProviderSection}
                prices={sortedPrices}
                balanceLabel={balances[selectedProvider] ?? '—'}
                busyAction={busyAction}
                rawEditor={rawEditors[selectedProvider] ?? ''}
                showAdvancedEditor={showAdvancedEditor}
                apiKeyValue={apiKeyValue(selectedManifest)}
                onSelectSection={setActiveProviderSection}
                onManifestFieldChange={(section, field, value) =>
                  updateManifestField(selectedProvider, section, field, value)
                }
                onApiKeyChange={(value) => setApiKey(selectedProvider, value)}
                onFetchBalance={() => void fetchBalance(selectedProvider)}
                onFetchPrices={() => void fetchPrices(selectedProvider)}
                onSave={() => void saveProvider(selectedProvider)}
                onOpenRawJson={() => setShowManifestModal(true)}
                onOpenSelector={openSelector}
                storeQuery={selectedStoreQuery}
                onStoreQueryChange={(patch) => updateStoreQuery(selectedProvider, patch)}
                onSortPrices={(key) => {
                  setPriceSort((current) => {
                    const existing = current[selectedProvider] ?? { key: 'country', dir: 'asc' as const };
                    const dir = existing.key === key && existing.dir === 'asc' ? 'desc' : 'asc';
                    return {
                      ...current,
                      [selectedProvider]: { key, dir },
                    };
                  });
                }}
                priceSort={priceSort[selectedProvider] ?? { key: 'country', dir: 'asc' }}
              />
            )}

            {activeScreen === 'messages' && (
              <MessagesScreen
                tickets={filteredMessages}
                filter={messageFilter}
                setFilter={setMessageFilter}
                filters={MESSAGE_FILTERS}
                busyAction={busyAction}
                onCopy={copyToClipboard}
                onRelease={(ticketId, action) => void releaseTicket(ticketId, action)}
                onBuyAnother={(ticket) => {
                  setActivationForm((current) => ({
                    ...current,
                    provider: ticket.provider,
                    service: ticket.service,
                    country: ticket.country,
                  }));
                  setShowActivationModal(true);
                }}
              />
            )}

            {activeScreen === 'settings' && (
              <SettingsScreen
                autoRefresh={autoRefresh}
                setAutoRefresh={setAutoRefresh}
                showAdvancedEditor={showAdvancedEditor}
                setShowAdvancedEditor={setShowAdvancedEditor}
                compactTables={compactTables}
                setCompactTables={setCompactTables}
                language={language}
                setLanguage={setLanguage}
                appearanceTheme={appearanceTheme}
                setAppearanceTheme={setAppearanceTheme}
                routingStrategy={runtimeSettings.routing_strategy}
                autoFallback={runtimeSettings.auto_fallback}
                onStrategyChange={(strategy) =>
                  void updateRuntimeSettings({
                    routing_strategy: strategy,
                    auto_fallback: runtimeSettings.auto_fallback,
                  })}
                onAutoFallbackChange={(enabled) =>
                  void updateRuntimeSettings({
                    routing_strategy: runtimeSettings.routing_strategy,
                    auto_fallback: enabled,
                  })}
                onReload={() => void reloadProviders()}
                reloadBusy={busyAction === 'reload'}
                apiBase={API_BASE}
                socketPath={SOCKET_PATH}
                routingStrategies={ROUTING_STRATEGIES}
              />
            )}

            {activeScreen === 'logs' && (
              <LogsScreen
                logs={filteredLogs}
                filter={logsFilter}
                setFilter={setLogsFilter}
                filters={LOG_FILTERS}
                onRefresh={() => void Promise.all([loadSnapshot(), loadNotifications()])}
                search={logsSearch}
                onSearch={setLogsSearch}
              />
            )}
          </div>
        </div>
      </div>

      {showActivationModal && (
        <NewActivationModal
          providers={visibleProviders}
          form={activationForm}
          busy={activationBusy}
          error={activationError}
          onChange={(field, value) => setActivationForm((current) => ({ ...current, [field]: value }))}
          onClose={() => {
            setShowActivationModal(false);
            setActivationError('');
          }}
          onSubmit={() => void submitActivation()}
          onOpenSelector={openSelector}
        />
      )}

      {showAdvancedEditor && showManifestModal && selectedManifest && (
        <ManifestModal
          providerName={selectedManifest.name}
          rawEditor={rawEditors[selectedProvider] ?? ''}
          busy={busyAction.includes('save')}
          onClose={() => setShowManifestModal(false)}
          onChange={(value) =>
            setRawEditors((current) => ({
              ...current,
              [selectedProvider]: value,
            }))
          }
          onSave={() => void saveProvider(selectedProvider)}
        />
      )}

      {selectorState && (
        <SearchSelectorModal
          title={selectorState.title}
          search={selectorSearch}
          options={filteredSelectorOptions}
          onClose={() => setSelectorState(null)}
          onSearch={setSelectorSearch}
          onSelect={applySelectorOption}
        />
      )}
    </div>
  );
}
