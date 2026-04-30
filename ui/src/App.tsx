import {
  startTransition, useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
} from 'react';
import {
  Bell, Bot, ChevronDown, ChevronLeft, ChevronsUpDown, Copy, GripVertical, LayoutDashboard,
  Loader2, MessageSquare, Minus, PanelLeft, Plus, Search, Send, Server, Settings,
  Shield, ShoppingCart, Sliders, Smartphone, Square, Terminal, User, Wallet, X,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

type ScreenId = 'overview' | 'providers' | 'messages' | 'settings' | 'logs';
type ProviderSectionId = 'config' | 'store' | 'wallet';
type MessageFilter = 'all' | 'received' | 'waiting' | 'failed';
type LogFilter = 'all' | 'info' | 'warn' | 'error';
type SelectorKind =
  | 'service'
  | 'country'
  | 'provider'
  | 'store-service'
  | 'store-country'
  | 'store-operator'
  | 'activation-service'
  | 'activation-country'
  | 'activation-operator';
type PriceSortKey = 'country' | 'price' | 'stock';
type RoutingStrategy = 'ordered_priority' | 'lowest_price' | 'highest_stock';
type TicketPhase = 'received' | 'waiting' | 'failed';
type AppearanceTheme = 'light' | 'dark' | 'system';
type LanguageCode = 'en' | 'zh';
type ButtonVariant = 'primary' | 'outline' | 'success' | 'ghost' | 'danger-outline' | 'text';
type ButtonSize = 'default' | 'utility' | 'compact';

type ProviderSummary = {
  id: string;
  name: string;
  enabled: boolean;
  kind: string;
  protocol: string;
  primary_endpoint?: string | null;
  default_service: string;
  default_country: string;
  homepage?: string | null;
  description?: string | null;
  priority: number;
};

type TicketRecord = {
  id: string;
  provider: string;
  service: string;
  country: string;
  phone_number: string;
  status: string;
  price?: number | null;
  code?: string | null;
  message?: string | null;
};

type LogEntry = {
  timestamp: string;
  scope: string;
  level: string;
  message: string;
};

type Snapshot = {
  providers: ProviderSummary[];
  tickets: TicketRecord[];
  logs: LogEntry[];
};

type ProviderManifest = {
  id: string;
  name: string;
  kind: string;
  enabled: boolean;
  priority: number;
  homepage?: string | null;
  description?: string | null;
  service_aliases: Record<string, string>;
  defaults: {
    service: string;
    country: string;
    auto_pick_country: boolean;
    verify_on_register: boolean;
    reuse_phone: boolean;
    max_price: number;
    min_price: number;
    min_balance: number;
    max_tries: number;
    poll_timeout_sec: number;
    reuse_max: number;
  };
  handler_api?: Record<string, unknown>;
  five_sim?: Record<string, unknown>;
  mock?: Record<string, unknown>;
};

type ProviderManifestList = { manifests: ProviderManifest[] };
type ProviderBalance = { provider: string; amount: number; currency: string };
type ProviderPriceItem = { country: string; display_name: string; operator: string; price: number; stock: number };
type ProviderPriceResponse = { provider: string; service: string; items: ProviderPriceItem[] };
type OptionItem = { value: string; label: string; hint: string };
type SelectorState = { kind: SelectorKind; title: string; options: OptionItem[] };
type NotificationFeed = { items: LogEntry[] };
type RuntimeSettings = { routing_strategy: RoutingStrategy; auto_fallback: boolean };
type RuntimeSettingsUpdate = { routing_strategy: RoutingStrategy; auto_fallback: boolean };
type ProviderDynamicOptions = { provider: string; services: OptionItem[]; countries: OptionItem[]; operators: OptionItem[] };
type SidebarItem = { id: ScreenId; label: string; Icon: typeof LayoutDashboard };
type StoreQueryState = { service: string; country: string; operator: string; search: string };

type ActivationFormState = {
  service: string;
  country: string;
  provider: string;
  operator: string;
  min_price: string;
  max_price: string;
};

const API_BASE = 'http://127.0.0.1:7822';
const SOCKET_PATH = '/tmp/madao-sms.sock';

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

const ROUTING_STRATEGIES: Array<{ value: RoutingStrategy; label: string }> = [
  { value: 'ordered_priority', label: 'Ordered Priority' },
  { value: 'lowest_price', label: 'Lowest Price' },
  { value: 'highest_stock', label: 'Highest Stock' },
];

const LOG_FILTERS: Array<{ id: LogFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'info', label: 'Info' },
  { id: 'warn', label: 'Warn' },
  { id: 'error', label: 'Error' },
];

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

function normalizeTicketStatus(status: string) {
  return status
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase();
}

function getTicketPhase(status: string): TicketPhase {
  const normalized = normalizeTicketStatus(status);
  if (normalized === 'code_received' || normalized === 'finished') return 'received';
  if (normalized === 'pending' || normalized === 'waiting_code') return 'waiting';
  return 'failed';
}

function mergeOptionItems(optionGroups: OptionItem[][]) {
  const merged = new Map<string, OptionItem>();
  optionGroups.flat().forEach((item) => {
    if (!merged.has(item.value)) merged.set(item.value, item);
  });
  return [...merged.values()];
}

function formatRelativeTime(input: string) {
  const timestamp = new Date(input).getTime();
  const diff = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes === 1) return '1 min ago';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hr ago`;
}

function countryBadge(country: string) {
  const normalized = country.toLowerCase();
  const map: Record<string, string> = {
    usa: '🇺🇸',
    us: '🇺🇸',
    '50': '🇺🇸',
    england: '🇬🇧',
    uk: '🇬🇧',
    '44': '🇬🇧',
    germany: '🇩🇪',
    japan: '🇯🇵',
    canada: '🇨🇦',
    australia: '🇦🇺',
    '61': '🇦🇺',
    russia: '🇷🇺',
    '0': '🇷🇺',
  };
  return map[normalized] ?? '🌐';
}

function formatServiceLabel(service: string) {
  const normalized = service.toLowerCase();
  const labels: Record<string, string> = {
    openai: 'OpenAI (ChatGPT)',
    dr: 'OpenAI (ChatGPT)',
    telegram: 'Telegram',
    tg: 'Telegram',
    whatsapp: 'WhatsApp',
    wa: 'WhatsApp',
    paypal: 'PayPal',
    discord: 'Discord',
  };
  return labels[normalized] ?? service;
}

function formatProviderLabel(provider: string) {
  const normalized = provider.toLowerCase();
  const labels: Record<string, string> = {
    fivesim: 'FiveSim',
    herosms: 'HeroSMS',
    smsbower: 'SMSBower',
  };
  return labels[normalized] ?? provider;
}

function formatCountryLabel(country: string) {
  const normalized = country.toLowerCase();
  const labels: Record<string, string> = {
    any: 'any — auto select',
    usa: 'usa',
    england: 'uk',
    uk: 'uk',
    '50': 'usa',
    '44': 'uk',
    local: 'local',
  };
  return labels[normalized] ?? country;
}

export function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [manifests, setManifests] = useState<Record<string, ProviderManifest>>({});
  const [rawEditors, setRawEditors] = useState<Record<string, string>>({});
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [pricePanels, setPricePanels] = useState<Record<string, ProviderPriceResponse>>({});
  const [priceSort, setPriceSort] = useState<Record<string, { key: PriceSortKey; dir: 'asc' | 'desc' }>>({});
  const [statusMessage, setStatusMessage] = useState<string>('Console ready.');
  const [busyAction, setBusyAction] = useState<string>('');
  const [activeScreen, setActiveScreen] = useState<ScreenId>('overview');
  const [providerView, setProviderView] = useState<'list' | 'workspace'>('list');
  const [activeProviderSection, setActiveProviderSection] = useState<ProviderSectionId>('config');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showAdvancedEditor, setShowAdvancedEditor] = useState(true);
  const [compactTables, setCompactTables] = useState(false);
  const [messageFilter, setMessageFilter] = useState<MessageFilter>('all');
  const [logsFilter, setLogsFilter] = useState<LogFilter>('all');
  const [logsSearch, setLogsSearch] = useState('');
  const [selectorState, setSelectorState] = useState<SelectorState | null>(null);
  const [selectorSearch, setSelectorSearch] = useState('');
  const [showManifestModal, setShowManifestModal] = useState(false);
  const [showActivationModal, setShowActivationModal] = useState(false);
  const [activationForm, setActivationForm] = useState<ActivationFormState>({
    service: '',
    country: '',
    provider: 'auto',
    operator: '',
    min_price: '',
    max_price: '',
  });
  const [activationBusy, setActivationBusy] = useState(false);
  const [activationError, setActivationError] = useState('');
  const [providerOrder, setProviderOrder] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<LogEntry[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationCursor, setNotificationCursor] = useState(0);
  const [runtimeSettings, setRuntimeSettings] = useState<RuntimeSettings>({
    routing_strategy: 'ordered_priority',
    auto_fallback: true,
  });
  const [appearanceTheme, setAppearanceTheme] = useState<AppearanceTheme>('light');
  const [language, setLanguage] = useState<LanguageCode>('en');
  const [providerOptions, setProviderOptions] = useState<Record<string, ProviderDynamicOptions>>({});
  const [storeQueries, setStoreQueries] = useState<Record<string, StoreQueryState>>({});

  useEffect(() => {
    void Promise.all([loadSnapshot(), loadManifests(), loadNotifications(), loadRuntimeSettings()]);
  }, []);

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
    try {
      const response = await fetch(`${API_BASE}/api/providers`);
      const data = (await response.json()) as Snapshot;
      startTransition(() => setSnapshot(data));
    } catch {
      setStatusMessage('Cannot connect to runtime snapshot.');
    }
  }

  async function loadManifests() {
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
    try {
      await invoke('window_action', { action });
    } catch (error) {
      setStatusMessage(`Window action failed: ${String(error)}`);
    }
  }

  const toolbarTitle = activeScreen === 'providers' && providerView === 'workspace'
    ? `Providers › ${manifests[selectedProvider]?.name ?? selectedProvider}`
    : NAV_ITEMS.find((item) => item.id === activeScreen)?.label ?? '';

  return (
    <div className={`app-root${compactTables ? ' compact' : ''}`}>
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
                <button className="d-icon-btn" onClick={() => setShowNotifications((current) => !current)}>
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
                routingStrategy={runtimeSettings.routing_strategy}
                autoFallback={runtimeSettings.auto_fallback}
                onConfigure={(id) => {
                  setSelectedProvider(id);
                  setProviderView('workspace');
                  setActiveProviderSection('config');
                }}
                onReorder={(ids) => {
                  setProviderOrder(ids);
                  void reorderProviders(ids);
                }}
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
              />
            )}

            {activeScreen === 'logs' && (
              <LogsScreen
                logs={filteredLogs}
                filter={logsFilter}
                setFilter={setLogsFilter}
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

function AppButton(props: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  const {
    variant = 'primary',
    size = 'default',
    className,
    type = 'button',
    ...rest
  } = props;
  const variantClass = {
    primary: 'd-btn-primary',
    outline: 'd-btn-outline',
    success: 'd-btn-success',
    ghost: 'd-btn-ghost',
    'danger-outline': 'd-btn-outline d-btn-danger-outline',
    text: 'd-btn-text',
  }[variant];
  return (
    <button
      type={type}
      className={cx(variantClass, size !== 'default' && `d-btn-${size}`, className)}
      {...rest}
    />
  );
}

function PageHeader(props: {
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  actions?: ReactNode;
  align?: 'start' | 'center';
}) {
  return (
    <div className={cx('d-page-header', props.align === 'center' && 'is-center')}>
      <div className="d-page-title-block">
        <h1 className="d-h1">{props.title}</h1>
        {props.subtitle && <p className="d-subtitle">{props.subtitle}</p>}
      </div>
      {(props.meta || props.actions) && (
        <div className="d-page-header-side">
          {props.meta}
          {props.actions}
        </div>
      )}
    </div>
  );
}

function SectionHeader(props: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <div className="d-section-header">
      <div className="d-section-header-main">
        {props.icon && <div className="d-section-header-icon">{props.icon}</div>}
        <div className="d-section-header-copy">
          {props.eyebrow && <span className="d-eyebrow">{props.eyebrow}</span>}
          <div className="d-section-header-title-row">
            <h2 className="d-section-header-title">{props.title}</h2>
            {props.badge}
          </div>
          {props.description && <p className="d-section-header-description">{props.description}</p>}
        </div>
      </div>
      {props.actions && <div className="d-section-header-actions">{props.actions}</div>}
    </div>
  );
}

function SegmentedControl<T extends string>(props: {
  items: Array<{ id: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cx('d-seg-tabs', props.className)}>
      {props.items.map((item) => (
        <button
          key={item.id}
          className={`d-seg-tab${props.value === item.id ? ' active' : ''}`}
          onClick={() => props.onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function SearchField(props: InputHTMLAttributes<HTMLInputElement> & {
  compact?: boolean;
  className?: string;
}) {
  const { compact = false, className, ...inputProps } = props;
  return (
    <label className={cx('d-search-bar', compact && 'is-compact', className)}>
      <Search size={14} style={{ opacity: 0.4 }} />
      <input {...inputProps} />
    </label>
  );
}

function SelectTrigger(props: {
  value: string;
  placeholder?: string;
  onClick: () => void;
  compact?: boolean;
  muted?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      className={cx('d-select-display d-select-button', props.compact && 'is-compact', props.className)}
      onClick={props.onClick}
      disabled={props.disabled}
    >
      <span className={cx(!props.value && 'placeholder-text', props.muted && 'placeholder-text')}>
        {props.value || props.placeholder}
      </span>
      <ChevronDown size={14} style={{ opacity: 0.5 }} />
    </button>
  );
}

function StatusBadge(props: { tone: 'green' | 'gray' | 'orange'; children: ReactNode }) {
  return <span className={`d-badge ${props.tone}`}>{props.children}</span>;
}

function StatusPill(props: { status: string }) {
  const normalized = props.status.toLowerCase();
  const tone = normalized.includes('connected') || normalized.includes('received')
    ? 'green'
    : normalized.includes('standby') || normalized.includes('waiting') || normalized.includes('pending')
      ? 'orange'
      : 'gray';
  return (
    <span className={`d-status-pill ${tone}`}>
      <span className="d-status-pill-dot" />
      {props.status}
    </span>
  );
}

function DataTable(props: {
  className?: string;
  headerClassName?: string;
  header: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={cx('d-data-table', props.className)}>
      <div className={cx('d-data-table-head', props.headerClassName)}>
        {props.header}
      </div>
      <div className="d-data-table-body">
        {props.children}
      </div>
    </div>
  );
}

function OverviewScreen(props: {
  stats: { totalMessages: string; activeProviders: string; successRate: string };
  activity: TicketRecord[];
  statusMessage: string;
  onViewAll: () => void;
}) {
  return (
    <div className="d-page">
      <PageHeader
        title="Good morning, Developer"
        subtitle="Here&apos;s what&apos;s happening with your SMS services today."
        meta={<span className="d-status-note">{props.statusMessage}</span>}
      />

      <div className="d-stats-grid">
        <StatCard title="Messages Sent" value={props.stats.totalMessages} caption="+15% from session baseline" positive />
        <StatCard title="Active Providers" value={props.stats.activeProviders} caption="All systems operational" positive />
        <StatCard title="Success Rate" value={props.stats.successRate} caption="Live delivery confidence" />
      </div>

      <div className="d-card">
        <div className="d-card-head">
          <h2 className="d-card-title">Recent Activity</h2>
          <AppButton variant="ghost" size="utility" onClick={props.onViewAll}>View All</AppButton>
        </div>
        <div className="d-table">
          <div className="d-table-row d-table-header">
            <span>Provider</span><span>Status</span><span>Recipient</span><span>Service</span>
          </div>
          {props.activity.map((item) => (
            <div className="d-table-row" key={item.id}>
              <span>{item.provider}</span>
              <span><StatusPill status={item.status} /></span>
              <span>{item.phone_number}</span>
              <span className="d-table-service">{formatServiceLabel(item.service)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard(props: { title: string; value: string; caption: string; positive?: boolean }) {
  return (
    <div className="d-stat-card">
      <div className="d-stat-head">
        <span className="d-stat-label">{props.title}</span>
      </div>
      <strong className="d-stat-value">{props.value}</strong>
      <span className={cx('d-stat-caption', props.positive ? 'positive' : 'negative')}>{props.caption}</span>
    </div>
  );
}

function ProvidersListScreen(props: {
  providers: ProviderManifest[];
  routingStrategy: RoutingStrategy;
  autoFallback: boolean;
  onConfigure: (id: string) => void;
  onReorder: (ids: string[]) => void;
  onStrategyChange: (value: RoutingStrategy) => void;
  onAutoFallbackChange: (enabled: boolean) => void;
}) {
  const dragIndex = useRef<number | null>(null);

  function handleDragStart(index: number) {
    dragIndex.current = index;
  }

  function handleDragOver(event: React.DragEvent, index: number) {
    event.preventDefault();
    if (dragIndex.current === null || dragIndex.current === index) return;
    const next = [...props.providers];
    const [moved] = next.splice(dragIndex.current, 1);
    next.splice(index, 0, moved);
    dragIndex.current = index;
    props.onReorder(next.map((provider) => provider.id));
  }

  function handleDrop() {
    dragIndex.current = null;
  }

  return (
    <div className="d-page">
      <PageHeader
        title="SMS Providers"
        subtitle="Manage your SMS gateway connections and routing rules."
      />

      <div className="d-card d-card-flush">
        <DataTable
          className="d-provider-table"
          headerClassName="d-provider-table-grid d-provider-table-labels"
          header={(
            <>
              <span>Priority</span>
              <span>Provider</span>
              <span className="d-provider-table-actions-head">Status / Actions</span>
            </>
          )}
        >
          {props.providers.map((provider, index) => (
            <div
              key={provider.id}
              className="d-provider-table-grid d-provider-table-row"
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(event) => handleDragOver(event, index)}
              onDrop={handleDrop}
            >
              <div className="d-provider-priority-cell">
                <GripVertical size={14} className="d-provider-grip" />
                <span className="d-priority-num">{index + 1}</span>
              </div>
              <div className="d-provider-name-cell">
                <span className="d-plist-name">{provider.name}</span>
                <span className="d-provider-subcopy">
                  {provider.protocol} · {formatServiceLabel(provider.defaults.service)}
                </span>
              </div>
              <div className="d-provider-actions-cell">
                <StatusBadge tone={provider.enabled ? 'green' : 'orange'}>
                  {provider.enabled ? 'Connected' : 'Standby'}
                </StatusBadge>
                <AppButton variant="ghost" size="utility" onClick={() => props.onConfigure(provider.id)}>Configure</AppButton>
              </div>
            </div>
          ))}
        </DataTable>
      </div>

      <div className="d-card" style={{ gap: 12 }}>
        <h3 className="d-section-title">Routing Rules</h3>
        <div className="d-detail-row">
          <span className="d-detail-label">Strategy</span>
          <div className="d-select-display">
            <span>{ROUTING_STRATEGIES.find((item) => item.value === props.routingStrategy)?.label ?? props.routingStrategy}</span>
          </div>
        </div>
        <SegmentedControl items={ROUTING_STRATEGIES} value={props.routingStrategy} onChange={props.onStrategyChange} className="d-routing-pills" />
        <div className="d-detail-row">
          <span className="d-detail-label">Auto-fallback</span>
          <ToggleSwitch checked={props.autoFallback} onChange={props.onAutoFallbackChange} ariaLabel="Toggle auto-fallback" />
        </div>
        <p className="d-page-note">
          Try providers in priority order. Skip to next if insufficient stock or request fails.
        </p>
      </div>
    </div>
  );
}

function ProviderWorkspaceScreen(props: {
  manifest: ProviderManifest;
  summary?: ProviderSummary;
  section: ProviderSectionId;
  prices: ProviderPriceItem[];
  balanceLabel: string;
  busyAction: string;
  rawEditor: string;
  showAdvancedEditor: boolean;
  apiKeyValue: string;
  onSelectSection: (section: ProviderSectionId) => void;
  onManifestFieldChange: (
    section: 'root' | 'defaults' | 'handler_api' | 'five_sim' | 'mock',
    field: string,
    value: string | number | boolean,
  ) => void;
  onApiKeyChange: (value: string) => void;
  onFetchBalance: () => void;
  onFetchPrices: () => void;
  onSave: () => void;
  onOpenRawJson: () => void;
  onOpenSelector: (kind: SelectorKind) => void;
  storeQuery: StoreQueryState;
  onStoreQueryChange: (patch: Partial<StoreQueryState>) => void;
  onSortPrices: (key: PriceSortKey) => void;
  priceSort: { key: PriceSortKey; dir: 'asc' | 'desc' };
}) {
  const { manifest, section } = props;
  const isConnected = manifest.enabled;

  return (
    <div className="d-workspace">
      <div className="d-ws-tabs-bar">
        <div className="d-ws-tabs-title">{manifest.name.toUpperCase()} WORKSPACE</div>
        <div className="d-ws-tabs-list">
          {WORKSPACE_SECTIONS.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`d-ws-tab${section === id ? ' active' : ''}`}
              onClick={() => props.onSelectSection(id)}
            >
              <Icon size={16} style={{ opacity: section === id ? 1 : 0.6 }} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="d-ws-detail">
        {section === 'config' && (
          <WorkspaceConfig
            manifest={manifest}
            isConnected={isConnected}
            busyAction={props.busyAction}
            apiKeyValue={props.apiKeyValue}
            showAdvancedEditor={props.showAdvancedEditor}
            onManifestFieldChange={props.onManifestFieldChange}
            onApiKeyChange={props.onApiKeyChange}
            onSave={props.onSave}
            onOpenRawJson={props.onOpenRawJson}
            onOpenSelector={props.onOpenSelector}
          />
        )}
        {section === 'store' && (
          <WorkspaceStore
            manifest={manifest}
            prices={props.prices}
            busyAction={props.busyAction}
            onFetchPrices={props.onFetchPrices}
            onOpenSelector={props.onOpenSelector}
            storeQuery={props.storeQuery}
            onStoreQueryChange={props.onStoreQueryChange}
            onSortPrices={props.onSortPrices}
            priceSort={props.priceSort}
          />
        )}
        {section === 'wallet' && (
          <WorkspaceWallet
            manifest={manifest}
            balanceLabel={props.balanceLabel}
            summary={props.summary}
            busyAction={props.busyAction}
            onFetchBalance={props.onFetchBalance}
          />
        )}
      </div>
    </div>
  );
}

function WorkspaceConfig(props: {
  manifest: ProviderManifest;
  isConnected: boolean;
  busyAction: string;
  apiKeyValue: string;
  showAdvancedEditor: boolean;
  onManifestFieldChange: (
    section: 'root' | 'defaults' | 'handler_api' | 'five_sim' | 'mock',
    field: string,
    value: string | number | boolean,
  ) => void;
  onApiKeyChange: (value: string) => void;
  onSave: () => void;
  onOpenRawJson: () => void;
  onOpenSelector: (kind: SelectorKind) => void;
}) {
  const { manifest } = props;

  return (
    <div className="d-ws-body">
      <SectionHeader
        eyebrow="Provider Workspace"
        title={manifest.name}
        description={manifest.description ?? `${manifest.kind} provider`}
        icon={<MessageSquare size={28} color="#0066cc" />}
        badge={<StatusBadge tone={props.isConnected ? 'green' : 'gray'}>{props.isConnected ? 'Connected' : 'Disabled'}</StatusBadge>}
        actions={(
          <>
            {props.showAdvancedEditor && (
              <AppButton variant="outline" size="utility" onClick={props.onOpenRawJson}>Raw JSON</AppButton>
            )}
            <AppButton variant="primary" size="utility" onClick={props.onSave} disabled={props.busyAction.includes('save')}>
              {props.busyAction.includes('save') ? 'Saving…' : 'Save'}
            </AppButton>
          </>
        )}
      />

      <div className="d-form-card">
        <ConfigRow label="Provider Name">
          <input className="d-input" value={manifest.name} onChange={(event) => props.onManifestFieldChange('root', 'name', event.target.value)} />
        </ConfigRow>
        <ConfigRow label="API Key" last>
          <input className="d-input" type="password" value={props.apiKeyValue} onChange={(event) => props.onApiKeyChange(event.target.value)} placeholder="Paste provider API key" />
        </ConfigRow>
      </div>
    </div>
  );
}

function WorkspaceStore(props: {
  manifest: ProviderManifest;
  prices: ProviderPriceItem[];
  busyAction: string;
  onFetchPrices: () => void;
  onOpenSelector: (kind: SelectorKind) => void;
  storeQuery: StoreQueryState;
  onStoreQueryChange: (patch: Partial<StoreQueryState>) => void;
  onSortPrices: (key: PriceSortKey) => void;
  priceSort: { key: PriceSortKey; dir: 'asc' | 'desc' };
}) {
  return (
    <div className="d-ws-body">
      <SectionHeader
        eyebrow="Store"
        title="Price Inventory"
        description="Stock by service, country and operator"
        actions={(
          <div className="d-inline-actions d-inline-actions-wrap">
            <SelectTrigger
              value={formatServiceLabel(props.storeQuery.service || props.manifest.defaults.service)}
              onClick={() => props.onOpenSelector('store-service')}
            />
            <SelectTrigger
              value={props.storeQuery.country ? formatCountryLabel(props.storeQuery.country) : ''}
              placeholder="All countries"
              muted={!props.storeQuery.country}
              onClick={() => props.onOpenSelector('store-country')}
            />
            <SelectTrigger
              value={props.storeQuery.operator}
              placeholder="All operators"
              muted={!props.storeQuery.operator}
              onClick={() => props.onOpenSelector('store-operator')}
            />
            <AppButton variant="primary" size="utility" onClick={props.onFetchPrices} disabled={props.busyAction.includes('prices')}>
              Load Prices
            </AppButton>
          </div>
        )}
      />

      <SearchField
        value={props.storeQuery.search}
        onChange={(event) => props.onStoreQueryChange({ search: event.target.value })}
        placeholder="Filter by country or operator..."
      />

      <div className="d-card d-card-flush">
        <DataTable
          className="d-store-table"
          headerClassName="d-store-grid d-store-head"
          header={(
            <>
              <button className="sortable" onClick={() => props.onSortPrices('country')}>
                <span>Country</span>
                <ChevronsUpDown size={12} />
              </button>
              <span>Operator</span>
              <button className="sortable is-right" onClick={() => props.onSortPrices('price')}>
                <span>Price</span>
                <ChevronsUpDown size={12} />
              </button>
              <button className="sortable is-right" onClick={() => props.onSortPrices('stock')}>
                <span>Stock</span>
                <ChevronsUpDown size={12} />
              </button>
            </>
          )}
        >
          {props.prices.length > 0 ? props.prices.slice(0, 20).map((item) => (
            <div className="d-store-grid d-store-table-row" key={`${item.country}-${item.display_name}`}>
              <span className="d-store-country-cell">
                <span className="d-store-country-flag">{countryBadge(item.country)}</span>
                <span className="d-store-country-copy">{item.display_name}</span>
              </span>
              <span className="d-store-operator-cell">{item.operator || 'any'}</span>
              <span className="d-store-price-cell">${item.price.toFixed(3)}</span>
              <span className="d-store-stock-cell">{item.stock.toLocaleString()}</span>
            </div>
          )) : (
            <div className="d-empty">Click Load Prices to fetch inventory.</div>
          )}
        </DataTable>
      </div>
    </div>
  );
}

function WorkspaceWallet(props: {
  manifest: ProviderManifest;
  balanceLabel: string;
  summary?: ProviderSummary;
  busyAction: string;
  onFetchBalance: () => void;
}) {
  return (
    <div className="d-ws-body">
      <div className="d-balance-card">
        <span className="d-balance-kicker">Current Balance</span>
        <strong className="d-balance-value">
          {props.balanceLabel === '—' ? '—' : props.balanceLabel}
        </strong>
        <div className="d-balance-actions">
          <AppButton variant="primary" onClick={props.onFetchBalance} disabled={props.busyAction.includes('balance')}>
            Top Up / Refresh
          </AppButton>
        </div>
      </div>

      <div className="d-card d-card-flush">
        <div className="d-pd-header">Provider Details</div>
        <DetailRow label="Protocol" value={props.summary?.protocol ?? props.manifest.kind} />
        <DetailRow label="Default Service" value={formatServiceLabel(props.manifest.defaults.service)} />
        <DetailRow label="Default Country" value={formatCountryLabel(props.manifest.defaults.country)} />
        <DetailRow label="Status" value={props.manifest.enabled ? 'Enabled' : 'Disabled'} last />
      </div>
    </div>
  );
}

function MessagesScreen(props: {
  tickets: TicketRecord[];
  filter: MessageFilter;
  setFilter: (value: MessageFilter) => void;
  busyAction: string;
  onCopy: (value: string, label: string) => void;
  onRelease: (ticketId: string, action: 'finish' | 'cancel' | 'retry') => void;
  onBuyAnother: (ticket: TicketRecord) => void;
}) {
  const serviceIcon = (service: string) => {
    const value = service.toLowerCase();
    if (value.includes('telegram')) return <Send size={24} />;
    if (value.includes('paypal') || value.includes('shield')) return <Shield size={24} className="d-icon-soft" />;
    return <Bot size={24} />;
  };

  return (
    <div className="d-page">
      <PageHeader
        title="Activations"
        align="center"
        actions={<SegmentedControl items={MESSAGE_FILTERS} value={props.filter} onChange={props.setFilter} />}
      />

      <div className="d-cards-list">
        {props.tickets.length > 0 ? props.tickets.slice(0, 8).map((ticket) => {
          const phase = getTicketPhase(ticket.status);
          const isReceived = phase === 'received';
          const isWaiting = phase === 'waiting';

          return (
            <div className="d-act-card" key={ticket.id}>
              <div className="d-act-head">
                <div className="d-act-service">
                  {serviceIcon(ticket.service)}
                  <strong className="d-act-service-title">{formatServiceLabel(ticket.service)}</strong>
                </div>
                <div className="d-act-phone-wrap">
                  <div className="d-act-phone-pill">
                    <span className="d-act-phone-text">
                      <Smartphone size={14} className="d-icon-soft" />{ticket.phone_number}
                    </span>
                    <button className="d-inline-icon" onClick={() => props.onCopy(ticket.phone_number, 'Phone number')} aria-label="Copy phone number">
                      <Copy size={14} color="#0066cc" />
                    </button>
                  </div>
                  {ticket.price && (
                    <span className="d-act-price">
                      ${ticket.price.toFixed(2)}
                    </span>
                  )}
                  {!isReceived && !isWaiting && (
                    <span className="d-act-refunded">Refunded</span>
                  )}
                </div>
              </div>

              {isReceived && (
                <div className="d-code-area received">
                  <div className="d-code-row">
                    <span className="d-code-num">{ticket.code ?? '------'}</span>
                    <button className="d-copy-btn" onClick={() => props.onCopy(ticket.code ?? '', 'SMS code')} disabled={!ticket.code}>
                      <Copy size={20} color="#0066cc" />
                    </button>
                  </div>
                  <span className="d-code-state-copy success">SMS received successfully</span>
                </div>
              )}
              {isWaiting && (
                <div className="d-code-area waiting">
                  <Loader2 size={32} color="#ffbd2e" className="d-code-loader" />
                  <span className="d-code-state-copy warning">Waiting for SMS...</span>
                  <span className="d-code-state-meta">
                    {ticket.message ?? 'Check provider dashboard'}
                  </span>
                </div>
              )}
              {!isReceived && !isWaiting && (
                <div className="d-code-area failed">
                  <strong className="d-code-state-title">Activation canceled or expired</strong>
                  <p className="d-code-state-meta">
                    {ticket.message ?? 'You were not charged for this request.'}
                  </p>
                </div>
              )}

              <div className="d-act-footer">
                <span className="d-act-footer-copy">Provider: {formatProviderLabel(ticket.provider)}</span>
                <div className="d-act-footer-actions">
                  {isReceived && (
                    <AppButton
                      variant="primary"
                      size="utility"
                      onClick={() => props.onRelease(ticket.id, 'finish')}
                      disabled={props.busyAction === `finish-${ticket.id}`}
                    >
                      Finish Activation
                    </AppButton>
                  )}
                  {isWaiting && (
                    <>
                      <AppButton
                        variant="danger-outline"
                        size="utility"
                        onClick={() => props.onRelease(ticket.id, 'cancel')}
                        disabled={props.busyAction === `cancel-${ticket.id}`}
                      >
                        Cancel & Refund
                      </AppButton>
                      <AppButton variant="success" size="utility" onClick={() => props.onBuyAnother(ticket)}>
                        Buy Another
                      </AppButton>
                    </>
                  )}
                  {!isReceived && !isWaiting && (
                    <AppButton variant="outline" size="utility" onClick={() => props.onRelease(ticket.id, 'retry')} disabled={props.busyAction === `retry-${ticket.id}`}>
                      Try Again
                    </AppButton>
                  )}
                </div>
              </div>
            </div>
          );
        }) : (
          <div className="d-empty">No activations.</div>
        )}
      </div>
    </div>
  );
}

function LogsScreen(props: {
  logs: LogEntry[];
  filter: LogFilter;
  setFilter: (value: LogFilter) => void;
  onRefresh: () => void;
  search: string;
  onSearch: (value: string) => void;
}) {
  return (
    <div className="d-page">
      <PageHeader
        title="System Logs"
        subtitle="Real-time event stream for debugging and monitoring."
        align="center"
        actions={(
          <div className="d-inline-actions">
            <AppButton variant="outline" size="utility" onClick={props.onRefresh}>Refresh</AppButton>
            <AppButton variant="outline" size="utility" onClick={() => props.onSearch('')}>Clear Search</AppButton>
          </div>
        )}
      />

      <div className="d-detail-row d-detail-row-wrap">
        <SegmentedControl items={LOG_FILTERS} value={props.filter} onChange={props.setFilter} />
        <SearchField
          className="d-logs-search"
          value={props.search}
          onChange={(event) => props.onSearch(event.target.value)}
          placeholder="Search logs..."
        />
      </div>

      <div className="d-card d-card-flush">
        <DataTable
          className="d-logs-table"
          headerClassName="d-logs-table-grid d-logs-table-head"
          header={(
            <>
              <span>Level</span>
              <span>Time</span>
              <span>Scope</span>
              <span>Message</span>
            </>
          )}
        >
          {props.logs.length > 0 ? props.logs.map((entry, index) => (
            <div className="d-logs-table-grid d-logs-table-row" key={`${entry.timestamp}-${index}`}>
              <span><span className={`d-log-badge ${entry.level.toLowerCase()}`}>{entry.level.toUpperCase()}</span></span>
              <span className="d-logs-time">{new Date(entry.timestamp).toLocaleTimeString()}</span>
              <span>{entry.scope}</span>
              <span>{entry.message}</span>
            </div>
          )) : <div className="d-empty">No log events.</div>}
        </DataTable>
      </div>
    </div>
  );
}

function SettingsScreen(props: {
  autoRefresh: boolean;
  setAutoRefresh: (value: boolean) => void;
  showAdvancedEditor: boolean;
  setShowAdvancedEditor: (value: boolean) => void;
  compactTables: boolean;
  setCompactTables: (value: boolean) => void;
  language: LanguageCode;
  setLanguage: (value: LanguageCode) => void;
  appearanceTheme: AppearanceTheme;
  setAppearanceTheme: (value: AppearanceTheme) => void;
  routingStrategy: RoutingStrategy;
  autoFallback: boolean;
  onStrategyChange: (value: RoutingStrategy) => void;
  onAutoFallbackChange: (enabled: boolean) => void;
  onReload: () => void;
  reloadBusy: boolean;
}) {
  return (
    <div className="d-page">
      <PageHeader
        title="Settings"
        subtitle="Configure global preferences and app behavior."
      />

      <div className="d-card">
        <div className="d-settings-section first">
          <h3 className="d-section-title">Appearance</h3>
          <div className="d-detail-row">
            <span className="d-detail-label">Language</span>
            <SegmentedControl items={[{ id: 'en', label: 'English' }, { id: 'zh', label: '中文' }]} value={props.language} onChange={props.setLanguage} className="d-routing-pills" />
          </div>
          <div className="d-detail-row">
            <span className="d-detail-label">Theme</span>
            <SegmentedControl items={[{ id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }, { id: 'system', label: 'System' }]} value={props.appearanceTheme} onChange={props.setAppearanceTheme} className="d-routing-pills" />
          </div>
        </div>

        <div className="d-settings-section">
          <h3 className="d-section-title">General</h3>
          <ToggleSetting title="Auto Refresh" description="Refresh runtime snapshot every 4 seconds." checked={props.autoRefresh} onChange={props.setAutoRefresh} />
          <ToggleSetting title="Advanced Manifest Access" description="Allow opening the raw manifest editor modal." checked={props.showAdvancedEditor} onChange={props.setShowAdvancedEditor} />
          <ToggleSetting title="Compact Tables" description="Tighten spacing for activity, provider and inventory tables." checked={props.compactTables} onChange={props.setCompactTables} last />
        </div>

        <div className="d-settings-section">
          <div className="d-card-head">
            <h3 className="d-section-title">Server Configuration</h3>
            <AppButton variant="outline" size="utility" onClick={props.onReload} disabled={props.reloadBusy}>
              {props.reloadBusy ? 'Reloading…' : 'Reload Providers'}
            </AppButton>
          </div>
          <div className="d-detail-row">
            <span className="d-detail-label">HTTP Endpoint</span>
            <div className="d-code-box">{API_BASE}</div>
          </div>
          <div className="d-detail-row">
            <span className="d-detail-label">Socket Path</span>
            <div className="d-code-box">{SOCKET_PATH}</div>
          </div>
          <div className="d-detail-row">
            <span className="d-detail-label">Desktop Runtime</span>
            <span className="d-detail-caption">Tauri v2</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function NewActivationModal(props: {
  providers: ProviderManifest[];
  form: ActivationFormState;
  busy: boolean;
  error: string;
  onChange: (field: keyof ActivationFormState, value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  onOpenSelector: (kind: SelectorKind) => void;
}) {
  const providerLabel = props.form.provider === 'auto'
    ? 'Auto — follow routing rules'
    : props.providers.find((provider) => provider.id === props.form.provider)?.name ?? props.form.provider;
  return (
    <div className="d-backdrop" onClick={props.onClose}>
      <div className="d-modal d-modal-activation" onClick={(event) => event.stopPropagation()}>
        <div className="d-modal-head-activation">
          <h2 className="d-modal-title">New Activation</h2>
          <button className="d-icon-btn-activation" onClick={props.onClose} aria-label="Close">
            <X size={20} style={{ opacity: 0.4 }} />
          </button>
        </div>
        <div className="d-modal-divider" />
        <div className="d-activation-form">
          <ModalField label="SERVICE">
            <SelectTrigger
              compact
              value={props.form.service ? formatServiceLabel(props.form.service) : ''}
              placeholder="e.g. telegram, openai, whatsapp"
              onClick={() => props.onOpenSelector('activation-service')}
            />
          </ModalField>
          <ModalField label="COUNTRY">
            <SelectTrigger compact value={props.form.country ? formatCountryLabel(props.form.country) : ''} placeholder="any — auto select" onClick={() => props.onOpenSelector('activation-country')} />
          </ModalField>
          <ModalField label="PROVIDER">
            <SelectTrigger compact value={providerLabel} muted={props.form.provider === 'auto'} onClick={() => props.onOpenSelector('provider')} />
          </ModalField>
          <ModalField label="PRICE RANGE">
            <div className="d-price-inputs">
              <input className="d-input-activation" type="number" value={props.form.min_price} onChange={(event) => props.onChange('min_price', event.target.value)} placeholder="Min $" min="0" step="0.01" />
              <span className="d-price-sep">–</span>
              <input className="d-input-activation" type="number" value={props.form.max_price} onChange={(event) => props.onChange('max_price', event.target.value)} placeholder="Max $" min="0" step="0.01" />
            </div>
          </ModalField>
          <ModalField label="OPERATOR" hint={props.form.provider !== 'auto' ? `${providerLabel} only` : undefined}>
            <SelectTrigger compact value={props.form.operator} placeholder="any" onClick={() => props.onOpenSelector('activation-operator')} className="is-disabled-look" />
          </ModalField>
        </div>
        {props.error && <div className="d-error-box">{props.error}</div>}
        <div className="d-modal-footer-activation">
          <AppButton variant="text" size="utility" onClick={props.onClose} disabled={props.busy}>Cancel</AppButton>
          <AppButton variant="primary" size="utility" className="d-btn-submit-activation" onClick={props.onSubmit} disabled={props.busy}>
            {props.busy ? 'Starting…' : 'Start Activation'}
          </AppButton>
        </div>
      </div>
    </div>
  );
}

function ManifestModal(props: {
  providerName: string;
  rawEditor: string;
  busy: boolean;
  onClose: () => void;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <div className="d-backdrop" onClick={props.onClose}>
      <div className="d-modal d-modal-wide" onClick={(event) => event.stopPropagation()}>
        <div className="d-modal-head">
          <div>
            <h2 className="d-modal-title">Advanced Manifest</h2>
            <p className="d-modal-subtitle">
              {props.providerName} · JSON source of truth
            </p>
          </div>
          <div className="d-inline-actions">
            <AppButton variant="ghost" size="utility" onClick={props.onClose}>Close</AppButton>
            <AppButton variant="primary" size="utility" onClick={props.onSave} disabled={props.busy}>Save</AppButton>
          </div>
        </div>
        <textarea className="d-json-editor" value={props.rawEditor} onChange={(event) => props.onChange(event.target.value)} />
      </div>
    </div>
  );
}

function SearchSelectorModal(props: {
  title: string;
  search: string;
  options: OptionItem[];
  onClose: () => void;
  onSearch: (value: string) => void;
  onSelect: (option: OptionItem) => void;
}) {
  return (
    <div className="d-backdrop" onClick={props.onClose}>
      <div className="d-modal d-modal-selector" onClick={(event) => event.stopPropagation()}>
        <div className="d-modal-head">
          <div>
            <h2 className="d-modal-title">{props.title}</h2>
            <p className="d-modal-subtitle">Search and pick a compatible option.</p>
          </div>
          <AppButton variant="ghost" size="utility" onClick={props.onClose}>Close</AppButton>
        </div>
        <div className="d-selector-search-wrap">
          <SearchField
            compact
            value={props.search}
            onChange={(event) => props.onSearch(event.target.value)}
            placeholder="Search options..."
            autoFocus
          />
        </div>
        <div className="d-selector-list">
          {props.options.map((option) => (
            <button key={`${option.value}-${option.label}`} className="d-selector-item" onClick={() => props.onSelect(option)}>
              <div className="d-selector-copy">
                <strong className="d-selector-label">{option.label}</strong>
                <span className="d-selector-hint">{option.hint}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function NotifIcon({ level }: { level: string }) {
  const symbol = level === 'error' ? '⊘' : level === 'warn' ? '?' : 'i';
  return <span className={`d-notif-icon ${level}`}>{symbol}</span>;
}

function ConfigRow(props: { label: string; children: ReactNode; last?: boolean }) {
  return (
    <div className={`d-config-row${props.last ? ' last' : ''}`}>
      <span className="d-config-label">{props.label}</span>
      <div className="d-config-value">{props.children}</div>
    </div>
  );
}

function DetailRow(props: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`d-pd-row${props.last ? '' : ' border'}`}>
      <span className="d-detail-label">{props.label}</span>
      <span className="d-detail-value">{props.value}</span>
    </div>
  );
}

function ToggleSetting(props: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  last?: boolean;
}) {
  return (
    <div className={`d-toggle-row${props.last ? '' : ' border'}`}>
      <div className="d-toggle-copy">
        <strong className="d-toggle-title">{props.title}</strong>
        <p className="d-toggle-description">{props.description}</p>
      </div>
      <ToggleSwitch checked={props.checked} onChange={props.onChange} ariaLabel={props.title} />
    </div>
  );
}

function ToggleSwitch(props: {
  checked: boolean;
  onChange: (value: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      className={`d-toggle${props.checked ? ' on' : ''}`}
      onClick={() => props.onChange(!props.checked)}
      aria-label={props.ariaLabel}
      aria-pressed={props.checked}
    >
      <span className="d-toggle-thumb" />
    </button>
  );
}

function ModalField(props: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="d-modal-field">
      <div className="d-modal-field-label-wrap">
        <span className="d-modal-field-label">{props.label}</span>
        {props.hint && <span className="d-field-hint">{props.hint}</span>}
      </div>
      {props.children}
    </label>
  );
}
