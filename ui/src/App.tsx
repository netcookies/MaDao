import {
  startTransition, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import {
  Bell, Bot, ChevronDown, ChevronLeft, ChevronsUpDown, Copy, GripVertical, LayoutDashboard,
  Loader2, MessageSquare, Minus, PanelLeft, Plus, Search, Send, Server, Settings,
  Shield, ShoppingCart, Sliders, Square, User, Wallet, X,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

type ScreenId = 'overview' | 'providers' | 'messages' | 'settings';
type ProviderSectionId = 'config' | 'store' | 'wallet';
type MessageFilter = 'all' | 'received' | 'waiting' | 'failed';
type SelectorKind = 'service' | 'country' | 'provider' | 'activation-service' | 'activation-country' | 'activation-operator';
type PriceSortKey = 'country' | 'operator' | 'price' | 'stock';
type RoutingStrategy = 'ordered_priority' | 'lowest_price' | 'highest_stock';

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
type ProviderPriceItem = { country: string; display_name: string; price: number; stock: number };
type ProviderPriceResponse = { provider: string; service: string; items: ProviderPriceItem[] };
type OptionItem = { value: string; label: string; hint: string };
type SelectorState = { kind: SelectorKind; title: string; options: OptionItem[] };
type NotificationFeed = { items: LogEntry[] };
type RuntimeSettings = { routing_strategy: RoutingStrategy; auto_fallback: boolean };
type RuntimeSettingsUpdate = { routing_strategy: RoutingStrategy; auto_fallback: boolean };
type ProviderDynamicOptions = { provider: string; services: OptionItem[]; countries: OptionItem[]; operators: OptionItem[] };
type SidebarItem = { id: ScreenId; label: string; Icon: typeof LayoutDashboard };

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

export function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [manifests, setManifests] = useState<Record<string, ProviderManifest>>({});
  const [rawEditors, setRawEditors] = useState<Record<string, string>>({});
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [pricePanels, setPricePanels] = useState<Record<string, ProviderPriceResponse>>({});
  const [priceSort, setPriceSort] = useState<Record<string, { key: PriceSortKey; dir: 'asc' | 'desc' }>>({});
  const [statusMessage, setStatusMessage] = useState<string>('控制台已就绪。');
  const [busyAction, setBusyAction] = useState<string>('');
  const [activeScreen, setActiveScreen] = useState<ScreenId>('overview');
  const [providerView, setProviderView] = useState<'list' | 'workspace'>('list');
  const [activeProviderSection, setActiveProviderSection] = useState<ProviderSectionId>('config');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showAdvancedEditor, setShowAdvancedEditor] = useState(true);
  const [compactTables, setCompactTables] = useState(false);
  const [messageFilter, setMessageFilter] = useState<MessageFilter>('all');
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
  const [runtimeSettings, setRuntimeSettings] = useState<RuntimeSettings>({
    routing_strategy: 'ordered_priority',
    auto_fallback: true,
  });
  const [providerOptions, setProviderOptions] = useState<Record<string, ProviderDynamicOptions>>({});
  const dragIndex = useRef<number | null>(null);

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

  const filteredMessages = useMemo(() => {
    const tickets = (snapshot?.tickets ?? []).filter((ticket) => ticket.provider !== 'mock');
    if (messageFilter === 'all') return tickets;
    return tickets.filter((ticket) => {
      const status = ticket.status.toLowerCase();
      if (messageFilter === 'received') return status.includes('received') || status.includes('code');
      if (messageFilter === 'waiting') return status.includes('wait') || status.includes('pending');
      return status.includes('fail') || status.includes('cancel');
    });
  }, [snapshot, messageFilter]);

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
    const sort = priceSort[selectedProvider] ?? { key: 'country' as PriceSortKey, dir: 'asc' as const };
    return [...panel.items].sort((left, right) => {
      const direction = sort.dir === 'asc' ? 1 : -1;
      switch (sort.key) {
        case 'price':
          return (left.price - right.price) * direction;
        case 'stock':
          return (left.stock - right.stock) * direction;
        case 'operator':
          return left.operator.localeCompare(right.operator) * direction;
        case 'country':
        default:
          return left.display_name.localeCompare(right.display_name) * direction;
      }
    });
  }, [priceSort, selectedPrices, selectedProvider]);

  async function loadSnapshot() {
    try {
      const response = await fetch(`${API_BASE}/api/providers`);
      const data = (await response.json()) as Snapshot;
      startTransition(() => setSnapshot(data));
    } catch {
      setStatusMessage('无法连接运行时快照。');
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
      setStatusMessage('无法加载 provider manifests。');
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
      setStatusMessage(`无法加载 ${providerId} 的动态选项。`);
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

  async function loadRuntimeSettings() {
    try {
      const response = await fetch(`${API_BASE}/api/settings/runtime`);
      const data = (await response.json()) as RuntimeSettings;
      setRuntimeSettings(data);
    } catch {
      setStatusMessage('无法加载 Routing Rules。');
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
      setStatusMessage(`已保存 ${providerId} 并热重载。`);
      await Promise.all([loadManifests(), loadSnapshot(), loadNotifications()]);
      setShowManifestModal(false);
    } catch (error) {
      setStatusMessage(`保存失败：${String(error)}`);
    } finally {
      setBusyAction('');
    }
  }

  async function reloadProviders() {
    try {
      setBusyAction('reload');
      const response = await fetch(`${API_BASE}/api/provider-manifests/reload`, { method: 'POST' });
      if (!response.ok) throw new Error(await response.text());
      setStatusMessage('Providers 已重新加载。');
      await Promise.all([loadManifests(), loadSnapshot(), loadNotifications()]);
    } catch (error) {
      setStatusMessage(`重载失败：${String(error)}`);
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
      setStatusMessage('优先级顺序已保存。');
      await loadNotifications();
    } catch (error) {
      setStatusMessage(`保存 Routing Rules 失败：${String(error)}`);
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
      setStatusMessage(`已查询 ${providerId} 余额。`);
    } catch (error) {
      setStatusMessage(`查询余额失败：${String(error)}`);
    } finally {
      setBusyAction('');
    }
  }

  async function fetchPrices(providerId: string) {
    const manifest = manifests[providerId];
    if (!manifest) return;
    try {
      setBusyAction(`prices-${providerId}`);
      const response = await fetch(`${API_BASE}/api/providers/${providerId}/prices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: providerId, service: manifest.defaults.service }),
      });
      if (!response.ok) throw new Error(await response.text());
      const payload = (await response.json()) as ProviderPriceResponse;
      setPricePanels((current) => ({
        ...current,
        [providerId]: payload,
      }));
      setStatusMessage(`已加载 ${providerId} 价格表。`);
    } catch (error) {
      setStatusMessage(`查询价格失败：${String(error)}`);
    } finally {
      setBusyAction('');
    }
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
      setStatusMessage('优先级顺序已保存。');
      await Promise.all([loadManifests(), loadNotifications()]);
    } catch (error) {
      setStatusMessage(`保存顺序失败：${String(error)}`);
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
      setStatusMessage('Activation 已创建，等待验证码。');
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
        hint: provider.protocol,
      }));
      title = 'Select Provider';
    } else if (kind === 'activation-service') {
      const target = activationForm.provider === 'auto' ? selectedProvider : activationForm.provider;
      options = providerOptions[target]?.services ?? [];
      title = 'Select Activation Service';
    } else if (kind === 'activation-country') {
      const target = activationForm.provider === 'auto' ? selectedProvider : activationForm.provider;
      options = providerOptions[target]?.countries ?? [];
      title = 'Select Activation Country';
    } else if (kind === 'activation-operator') {
      const target = activationForm.provider === 'auto' ? selectedProvider : activationForm.provider;
      options = providerOptions[target]?.operators ?? [];
      title = 'Select Activation Operator';
    }
    setSelectorSearch('');
    setSelectorState({ kind, title, options });
  }

  function applySelectorOption(option: OptionItem) {
    if (!selectorState) return;
    if (selectorState.kind === 'service' || selectorState.kind === 'country') {
      updateManifestField(selectedProvider, 'defaults', selectorState.kind, option.value);
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
      setStatusMessage(`窗口操作失败：${String(error)}`);
    }
  }

  const toolbarTitle = activeScreen === 'providers' && providerView === 'workspace'
    ? `Providers › ${manifests[selectedProvider]?.name ?? selectedProvider}`
    : NAV_ITEMS.find((item) => item.id === activeScreen)?.label ?? '';

  return (
    <div className="app-root">
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
                ? <ChevronLeft size={16} style={{ opacity: 0.6, cursor: 'pointer' }} onClick={() => setProviderView('list')} />
                : <PanelLeft size={16} style={{ opacity: 0.6 }} />}
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
                      <button className="d-btn-ghost" onClick={() => void loadNotifications()}>
                        Refresh
                      </button>
                    </div>
                    <div className="d-notification-list">
                      {notifications.length > 0 ? notifications.map((entry, index) => (
                        <div className="d-notification-item" key={`${entry.timestamp}-${index}`}>
                          <span>{entry.scope}</span>
                          <strong>{entry.message}</strong>
                          <small>{new Date(entry.timestamp).toLocaleString()}</small>
                        </div>
                      )) : <div className="d-empty">暂无事件。</div>}
                    </div>
                  </div>
                )}
              </div>
              <button className="d-btn-new-activation" onClick={() => setShowActivationModal(true)}>
                <Plus size={14} />
                <span>New Activation</span>
              </button>
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
              <MessagesScreen tickets={filteredMessages} filter={messageFilter} setFilter={setMessageFilter} />
            )}

            {activeScreen === 'settings' && (
              <SettingsScreen
                autoRefresh={autoRefresh}
                setAutoRefresh={setAutoRefresh}
                showAdvancedEditor={showAdvancedEditor}
                setShowAdvancedEditor={setShowAdvancedEditor}
                compactTables={compactTables}
                setCompactTables={setCompactTables}
                onReload={() => void reloadProviders()}
                reloadBusy={busyAction === 'reload'}
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

function OverviewScreen(props: {
  stats: { totalMessages: string; activeProviders: string; successRate: string };
  activity: TicketRecord[];
  statusMessage: string;
  onViewAll: () => void;
}) {
  return (
    <div className="d-page">
      <div className="d-page-header">
        <div>
          <h1 className="d-h1">Good morning, Developer</h1>
          <p className="d-subtitle">Here&apos;s what&apos;s happening with your SMS services today.</p>
        </div>
        <span className="d-status-note">{props.statusMessage}</span>
      </div>

      <div className="d-stats-grid">
        <StatCard title="Messages Sent" value={props.stats.totalMessages} caption="+15% from session baseline" positive />
        <StatCard title="Active Providers" value={props.stats.activeProviders} caption="All systems operational" positive />
        <StatCard title="Success Rate" value={props.stats.successRate} caption="Live delivery confidence" />
      </div>

      <div className="d-card">
        <div className="d-card-head">
          <h2 className="d-card-title">Recent Activity</h2>
          <button className="d-btn-ghost" onClick={props.onViewAll}>View All</button>
        </div>
        <div className="d-table">
          <div className="d-table-row d-table-header">
            <span>Provider</span><span>Status</span><span>Recipient</span><span>Service</span>
          </div>
          {props.activity.map((item) => (
            <div className="d-table-row" key={item.id}>
              <span>{item.provider}</span>
              <span><StatusDot status={item.status} /></span>
              <span>{item.phone_number}</span>
              <span style={{ opacity: 0.6 }}>{item.service}</span>
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
      <span style={{ fontSize: 10, color: props.positive ? '#27c93f' : '#ff5f56' }}>{props.caption}</span>
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
      <div className="d-page-header">
        <div>
          <h1 className="d-h1">SMS Providers</h1>
          <p className="d-subtitle">Manage your SMS gateway connections and routing rules.</p>
        </div>
      </div>

      <div className="d-card d-card-flush">
        <div className="d-plist-header">
          <span>Priority</span>
          <span>Provider</span>
          <span style={{ marginLeft: 'auto' }}>Status / Actions</span>
        </div>
        {props.providers.map((provider, index) => (
          <div
            key={provider.id}
            className="d-plist-row"
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={(event) => handleDragOver(event, index)}
            onDrop={handleDrop}
          >
            <div className="d-plist-left">
              <GripVertical size={14} style={{ opacity: 0.3, flexShrink: 0 }} />
              <span className="d-priority-num">{index + 1}</span>
              <span className="d-plist-name">{provider.name}</span>
            </div>
            <div className="d-plist-right">
              <span style={{ fontSize: 12, color: provider.enabled ? '#27c93f' : '#ff9500' }}>
                ● {provider.enabled ? 'Connected' : 'Standby'}
              </span>
              <button className="d-link-btn" onClick={() => props.onConfigure(provider.id)}>Configure</button>
            </div>
          </div>
        ))}
      </div>

      <div className="d-card" style={{ gap: 12 }}>
        <h3 className="d-section-title">Routing Rules</h3>
        <div className="d-detail-row">
          <span className="d-detail-label">Strategy</span>
          <div className="d-select-display">
            <span>{ROUTING_STRATEGIES.find((item) => item.value === props.routingStrategy)?.label ?? props.routingStrategy}</span>
          </div>
        </div>
        <div className="d-routing-pills">
          {ROUTING_STRATEGIES.map((item) => (
            <button
              key={item.value}
              className={props.routingStrategy === item.value ? 'provider-tab active' : 'provider-tab'}
              onClick={() => props.onStrategyChange(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="d-detail-row">
          <span className="d-detail-label">Auto-fallback</span>
          <div className={`d-toggle${props.autoFallback ? ' on' : ''}`} onClick={() => props.onAutoFallbackChange(!props.autoFallback)}>
            <div className="d-toggle-thumb" />
          </div>
        </div>
        <p style={{ fontSize: 12, opacity: 0.5, margin: 0 }}>
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
  onSortPrices: (key: PriceSortKey) => void;
  priceSort: { key: PriceSortKey; dir: 'asc' | 'desc' };
}) {
  const { manifest, section } = props;
  const isConnected = manifest.enabled;

  return (
    <div className="d-workspace">
      <div className="d-ws-nav">
        <div className="d-ws-nav-header">{manifest.name.toUpperCase()} WORKSPACE</div>
        {WORKSPACE_SECTIONS.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={`d-ws-nav-item${section === id ? ' active' : ''}`}
            onClick={() => props.onSelectSection(id)}
          >
            <Icon size={16} style={{ opacity: section === id ? 1 : 0.6 }} />
            <span>{label}</span>
          </button>
        ))}
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
      <div className="d-ws-body-header">
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <MessageSquare size={32} color="#0066cc" />
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 24, fontWeight: 600 }}>{manifest.name}</span>
              <span className={`d-badge ${props.isConnected ? 'green' : 'gray'}`}>
                {props.isConnected ? 'Connected' : 'Disabled'}
              </span>
            </div>
            <p style={{ fontSize: 13, opacity: 0.5, margin: 0 }}>
              {manifest.description ?? `${manifest.kind} provider`}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {props.showAdvancedEditor && (
            <button className="d-btn-outline" onClick={props.onOpenRawJson}>Raw JSON</button>
          )}
          <button className="d-btn-primary" onClick={props.onSave} disabled={props.busyAction.includes('save')}>
            {props.busyAction.includes('save') ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="d-form-card">
        <ConfigRow label="Provider Name">
          <input className="d-input" value={manifest.name} onChange={(event) => props.onManifestFieldChange('root', 'name', event.target.value)} />
        </ConfigRow>
        <ConfigRow label="API Key">
          <input className="d-input" type="password" value={props.apiKeyValue} onChange={(event) => props.onApiKeyChange(event.target.value)} placeholder="Paste provider API key" />
        </ConfigRow>
        <ConfigRow label="Enabled">
          <div className={`d-toggle${manifest.enabled ? ' on' : ''}`} onClick={() => props.onManifestFieldChange('root', 'enabled', !manifest.enabled)}>
            <div className="d-toggle-thumb" />
          </div>
        </ConfigRow>
        <ConfigRow label="Default Service">
          <button className="d-select-display d-select-button" onClick={() => props.onOpenSelector('service')}>
            <span>{manifest.defaults.service}</span>
            <ChevronDown size={14} style={{ opacity: 0.5 }} />
          </button>
        </ConfigRow>
        <ConfigRow label="Default Country">
          <button className="d-select-display d-select-button" onClick={() => props.onOpenSelector('country')}>
            <span>{manifest.defaults.country}</span>
            <ChevronDown size={14} style={{ opacity: 0.5 }} />
          </button>
        </ConfigRow>
        <ConfigRow label="Max Price (USD)">
          <input className="d-input" type="number" value={manifest.defaults.max_price} onChange={(event) => props.onManifestFieldChange('defaults', 'max_price', Number(event.target.value))} />
        </ConfigRow>
        <ConfigRow label="Min Price (USD)">
          <input className="d-input" type="number" value={manifest.defaults.min_price} onChange={(event) => props.onManifestFieldChange('defaults', 'min_price', Number(event.target.value))} />
        </ConfigRow>
        <ConfigRow label="Min Balance">
          <input className="d-input" type="number" value={manifest.defaults.min_balance} onChange={(event) => props.onManifestFieldChange('defaults', 'min_balance', Number(event.target.value))} />
        </ConfigRow>
        <ConfigRow label="Poll Timeout (sec)" last>
          <input className="d-input" type="number" value={manifest.defaults.poll_timeout_sec} onChange={(event) => props.onManifestFieldChange('defaults', 'poll_timeout_sec', Number(event.target.value))} />
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
  onSortPrices: (key: PriceSortKey) => void;
  priceSort: { key: PriceSortKey; dir: 'asc' | 'desc' };
}) {
  return (
    <div className="d-ws-body">
      <div className="d-ws-body-header">
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Price Inventory</h2>
          <p style={{ fontSize: 13, opacity: 0.5, margin: '4px 0 0' }}>
            Stock by service, country and operator
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="d-select-display d-select-button" onClick={() => props.onOpenSelector('service')}>
            <span>{props.manifest.defaults.service}</span>
            <ChevronDown size={14} style={{ opacity: 0.5 }} />
          </button>
          <button className="d-btn-primary" onClick={props.onFetchPrices} disabled={props.busyAction.includes('prices')}>
            Load Prices
          </button>
        </div>
      </div>

      <div className="d-search-bar">
        <Search size={14} style={{ opacity: 0.4 }} />
        <span style={{ opacity: 0.4, fontSize: 13 }}>Filter by country or operator...</span>
      </div>

      <div className="d-card d-card-flush">
        <div className="d-store-header">
          <button className="d-store-col fill sortable" onClick={() => props.onSortPrices('country')}>
            <span>Country</span>
            <ChevronsUpDown size={12} />
          </button>
          <button className="d-store-col fill sortable" onClick={() => props.onSortPrices('operator')}>
            <span>Operator</span>
            <ChevronsUpDown size={12} />
          </button>
          <button className="d-store-col w100 sortable" onClick={() => props.onSortPrices('price')}>
            <span>Price</span>
            <ChevronsUpDown size={12} />
          </button>
          <button className="d-store-col w80 right sortable" onClick={() => props.onSortPrices('stock')}>
            <span>Stock</span>
            <ChevronsUpDown size={12} />
          </button>
        </div>
        {props.prices.length > 0 ? (
          props.prices.slice(0, 20).map((item) => (
            <div className="d-store-row" key={`${item.country}-${item.display_name}`}>
              <span className="d-store-col fill">{item.display_name}</span>
              <span className="d-store-col fill" style={{ color: '#6e6e73' }}>{item.operator}</span>
              <span className="d-store-col w100" style={{ fontWeight: 500 }}>${item.price.toFixed(3)}</span>
              <span className="d-store-col w80 right">{item.stock.toLocaleString()}</span>
            </div>
          ))
        ) : (
          <div className="d-empty">点击 Load Prices 加载库存。</div>
        )}
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
        <span style={{ fontSize: 14, opacity: 0.6 }}>Current Balance</span>
        <strong style={{ fontSize: 48, fontWeight: 600, lineHeight: 1.1 }}>
          {props.balanceLabel === '—' ? '—' : props.balanceLabel}
        </strong>
        <div style={{ paddingTop: 24 }}>
          <button className="d-btn-primary" onClick={props.onFetchBalance} disabled={props.busyAction.includes('balance')}>
            Top Up / Refresh
          </button>
        </div>
      </div>

      <div className="d-card d-card-flush">
        <div className="d-pd-header">Provider Details</div>
        <DetailRow label="Protocol" value={props.summary?.protocol ?? props.manifest.kind} />
        <DetailRow label="Default Service" value={props.manifest.defaults.service} />
        <DetailRow label="Default Country" value={props.manifest.defaults.country} />
        <DetailRow label="Status" value={props.manifest.enabled ? 'Enabled' : 'Disabled'} last />
      </div>
    </div>
  );
}

function MessagesScreen(props: {
  tickets: TicketRecord[];
  filter: MessageFilter;
  setFilter: (value: MessageFilter) => void;
}) {
  const serviceIcon = (service: string) => {
    const value = service.toLowerCase();
    if (value.includes('telegram')) return <Send size={24} />;
    if (value.includes('paypal') || value.includes('shield')) return <Shield size={24} style={{ opacity: 0.6 }} />;
    return <Bot size={24} />;
  };

  return (
    <div className="d-page">
      <div className="d-page-header" style={{ alignItems: 'center' }}>
        <h1 className="d-h1" style={{ margin: 0 }}>Activations</h1>
        <div className="d-seg-tabs">
          {MESSAGE_FILTERS.map(({ id, label }) => (
            <button
              key={id}
              className={`d-seg-tab${props.filter === id ? ' active' : ''}`}
              onClick={() => props.setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="d-cards-list">
        {props.tickets.length > 0 ? props.tickets.slice(0, 8).map((ticket) => {
          const status = ticket.status.toLowerCase();
          const isReceived = status.includes('received') || status.includes('code');
          const isWaiting = status.includes('wait') || status.includes('pending');

          return (
            <div className="d-act-card" key={ticket.id}>
              <div className="d-act-head">
                <div className="d-act-service">
                  {serviceIcon(ticket.service)}
                  <strong style={{ fontSize: 17 }}>{ticket.service}</strong>
                </div>
                <div className="d-act-phone-wrap">
                  <div className="d-act-phone-pill">
                    <span style={{ fontSize: 15, fontWeight: 600 }}>{ticket.phone_number}</span>
                    <Copy size={14} color="#0066cc" style={{ cursor: 'pointer' }} />
                  </div>
                  {ticket.price && (
                    <span style={{ fontSize: 15, fontWeight: 600, opacity: 0.6 }}>
                      ${ticket.price.toFixed(2)}
                    </span>
                  )}
                  {!isReceived && !isWaiting && (
                    <span style={{ fontSize: 15, fontWeight: 600, color: '#e0443e' }}>Refunded</span>
                  )}
                </div>
              </div>

              {isReceived && (
                <div className="d-code-area received">
                  <div className="d-code-row">
                    <span className="d-code-num">{ticket.code ?? '------'}</span>
                    <button className="d-copy-btn">
                      <Copy size={20} color="#0066cc" />
                    </button>
                  </div>
                  <div style={{ height: 16 }} />
                  <span style={{ fontSize: 14, fontWeight: 500, color: '#27c93f' }}>SMS received successfully</span>
                </div>
              )}
              {isWaiting && (
                <div className="d-code-area waiting">
                  <Loader2 size={32} color="#ffbd2e" />
                  <div style={{ height: 16 }} />
                  <span style={{ fontSize: 15, fontWeight: 600, color: '#dea123' }}>Waiting for SMS...</span>
                  <span style={{ fontSize: 13, opacity: 0.5, letterSpacing: 1 }}>
                    {ticket.message ?? 'Check provider dashboard'}
                  </span>
                </div>
              )}
              {!isReceived && !isWaiting && (
                <div className="d-code-area failed">
                  <strong style={{ fontSize: 15, fontWeight: 600, opacity: 0.8 }}>
                    Activation canceled or expired
                  </strong>
                  <p style={{ fontSize: 14, opacity: 0.6, margin: 0 }}>
                    {ticket.message ?? 'You were not charged for this request.'}
                  </p>
                </div>
              )}

              <div className="d-act-footer">
                <span style={{ fontSize: 13, opacity: 0.5 }}>Provider: {ticket.provider}</span>
                <div style={{ display: 'flex', gap: 12 }}>
                  {isReceived && <button className="d-btn-primary">Finish Activation</button>}
                  {isWaiting && (
                    <>
                      <button className="d-btn-outline" style={{ color: '#e0443e', borderColor: '#e0443e' }}>
                        Cancel & Refund
                      </button>
                      <button className="d-btn-success">Buy Another</button>
                    </>
                  )}
                  {!isReceived && !isWaiting && (
                    <button className="d-btn-outline">Try Again</button>
                  )}
                </div>
              </div>
            </div>
          );
        }) : (
          <div className="d-empty">当前没有 activations。</div>
        )}
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
  onReload: () => void;
  reloadBusy: boolean;
}) {
  return (
    <div className="d-page">
      <div className="d-page-header">
        <div>
          <h1 className="d-h1">Settings</h1>
          <p className="d-subtitle">Configure global preferences and app behavior.</p>
        </div>
        <button className="d-btn-outline" onClick={props.onReload} disabled={props.reloadBusy}>
          Reload Providers
        </button>
      </div>

      <div className="d-card">
        <div className="d-settings-section">
          <h3 className="d-section-title" style={{ marginBottom: 16 }}>General</h3>
          <ToggleSetting title="Auto Refresh" description="Refresh runtime snapshot every 4 seconds." checked={props.autoRefresh} onChange={props.setAutoRefresh} />
          <ToggleSetting title="Advanced Manifest Access" description="Allow opening the raw manifest JSON editor." checked={props.showAdvancedEditor} onChange={props.setShowAdvancedEditor} />
          <ToggleSetting title="Compact Tables" description="Tighten spacing for activity and history tables." checked={props.compactTables} onChange={props.setCompactTables} last />
        </div>

        <div className="d-settings-section" style={{ borderTop: '1px solid rgba(0,0,0,0.06)', marginTop: 0 }}>
          <h3 className="d-section-title" style={{ marginBottom: 16 }}>Server Configuration</h3>
          <div className="d-detail-row">
            <span className="d-detail-label">HTTP Endpoint</span>
            <div className="d-code-box" style={{ width: 260 }}>{API_BASE}</div>
          </div>
          <div className="d-detail-row">
            <span className="d-detail-label">Socket Path</span>
            <div className="d-code-box" style={{ width: 200 }}>{SOCKET_PATH}</div>
          </div>
          <div className="d-detail-row">
            <span className="d-detail-label">Desktop Runtime</span>
            <span style={{ fontSize: 12, opacity: 0.5 }}>Tauri v2</span>
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
    ? 'Auto (Priority Routing)'
    : props.providers.find((provider) => provider.id === props.form.provider)?.name ?? props.form.provider;
  return (
    <div className="d-backdrop" onClick={props.onClose}>
      <div className="d-modal" style={{ width: 520 }} onClick={(event) => event.stopPropagation()}>
        <div className="d-modal-head">
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>New Activation</h2>
            <p style={{ fontSize: 13, opacity: 0.6, margin: '4px 0 0' }}>
              Request a phone number to receive a verification code.
            </p>
          </div>
          <button className="d-btn-ghost" onClick={props.onClose}>Close</button>
        </div>
        <div className="d-activation-form">
          <ModalField label="Provider">
            <button className="d-select-display d-select-button" onClick={() => props.onOpenSelector('provider')}>
              <span>{providerLabel}</span>
              <ChevronDown size={14} style={{ opacity: 0.5 }} />
            </button>
          </ModalField>
          <ModalField label="Service">
            <button className="d-select-display d-select-button" onClick={() => props.onOpenSelector('activation-service')}>
              <span>{props.form.service || 'Select service'}</span>
              <ChevronDown size={14} style={{ opacity: 0.5 }} />
            </button>
          </ModalField>
          <ModalField label="Country">
            <button className="d-select-display d-select-button" onClick={() => props.onOpenSelector('activation-country')}>
              <span>{props.form.country || 'Select country'}</span>
              <ChevronDown size={14} style={{ opacity: 0.5 }} />
            </button>
          </ModalField>
          <ModalField label="Operator">
            <button className="d-select-display d-select-button" onClick={() => props.onOpenSelector('activation-operator')}>
              <span>{props.form.operator || 'Select operator'}</span>
              <ChevronDown size={14} style={{ opacity: 0.5 }} />
            </button>
          </ModalField>
          <ModalField label="Min Price (USD)">
            <input className="d-input" type="number" value={props.form.min_price} onChange={(event) => props.onChange('min_price', event.target.value)} placeholder="0.00" min="0" step="0.01" />
          </ModalField>
          <ModalField label="Max Price (USD)">
            <input className="d-input" type="number" value={props.form.max_price} onChange={(event) => props.onChange('max_price', event.target.value)} placeholder="0.00" min="0" step="0.01" />
          </ModalField>
        </div>
        {props.error && <div className="d-error-box">{props.error}</div>}
        <div className="d-modal-footer">
          <button className="d-btn-outline" onClick={props.onClose} disabled={props.busy}>Cancel</button>
          <button className="d-btn-primary" onClick={props.onSubmit} disabled={props.busy}>
            {props.busy ? 'Requesting…' : 'Request Number'}
          </button>
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
            <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Advanced Manifest</h2>
            <p style={{ fontSize: 13, opacity: 0.6, margin: '4px 0 0' }}>
              {props.providerName} · JSON source of truth
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="d-btn-ghost" onClick={props.onClose}>Close</button>
            <button className="d-btn-primary" onClick={props.onSave} disabled={props.busy}>Save</button>
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
      <div className="d-modal" style={{ width: 400 }} onClick={(event) => event.stopPropagation()}>
        <div className="d-modal-head">
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>{props.title}</h2>
            <p style={{ fontSize: 13, opacity: 0.6, margin: '4px 0 0' }}>Search and pick a compatible option.</p>
          </div>
          <button className="d-btn-ghost" onClick={props.onClose}>Close</button>
        </div>
        <div style={{ padding: '12px 0' }}>
          <div className="d-search-bar" style={{ margin: 0 }}>
            <Search size={14} style={{ opacity: 0.4 }} />
            <input
              style={{ border: 0, background: 'transparent', flex: 1, outline: 'none', fontSize: 13 }}
              value={props.search}
              onChange={(event) => props.onSearch(event.target.value)}
              placeholder="Search options..."
              autoFocus
            />
          </div>
        </div>
        <div className="d-selector-list">
          {props.options.map((option) => (
            <button key={`${option.value}-${option.label}`} className="d-selector-item" onClick={() => props.onSelect(option)}>
              <strong style={{ fontSize: 14 }}>{option.label}</strong>
              <span style={{ fontSize: 12, opacity: 0.5 }}>{option.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const color = normalized.includes('connected') || normalized.includes('received')
    ? '#27c93f'
    : normalized.includes('standby') || normalized.includes('waiting') || normalized.includes('pending')
      ? '#ffbd2e'
      : normalized.includes('fail') || normalized.includes('cancel')
        ? '#ff5f56'
        : '#8e8e93';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {status}
    </span>
  );
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
      <span style={{ fontSize: 13, opacity: 0.6 }}>{props.label}</span>
      <span style={{ fontSize: 13, fontWeight: 500 }}>{props.value}</span>
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
      <div>
        <strong style={{ fontSize: 13 }}>{props.title}</strong>
        <p style={{ fontSize: 12, opacity: 0.5, margin: '3px 0 0' }}>{props.description}</p>
      </div>
      <div className={`d-toggle${props.checked ? ' on' : ''}`} onClick={() => props.onChange(!props.checked)}>
        <div className="d-toggle-thumb" />
      </div>
    </div>
  );
}

function ModalField(props: { label: string; children: ReactNode }) {
  return (
    <label className="d-modal-field">
      <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.6 }}>{props.label}</span>
      {props.children}
    </label>
  );
}
