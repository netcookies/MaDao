import { startTransition, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

type ScreenId = 'overview' | 'providers' | 'messages' | 'settings';
type ProviderSectionId = 'config' | 'store' | 'wallet';
type MessageFilter = 'all' | 'received' | 'waiting' | 'failed';
type SelectorKind = 'service' | 'country';

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

type ActivationFormState = {
  service: string;
  country: string;
  provider: string;
  min_price: string;
  max_price: string;
  operator: string;
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

type ProviderManifestList = {
  manifests: ProviderManifest[];
};

type ProviderBalance = {
  provider: string;
  amount: number;
  currency: string;
};

type ProviderPriceItem = {
  country: string;
  display_name: string;
  price: number;
  stock: number;
};

type ProviderPriceResponse = {
  provider: string;
  service: string;
  items: ProviderPriceItem[];
};

type SidebarItem = {
  id: ScreenId;
  title: string;
  subtitle: string;
};

type OptionItem = {
  value: string;
  label: string;
  hint: string;
};

type SelectorState = {
  providerId: string;
  kind: SelectorKind;
  title: string;
  options: OptionItem[];
};

const API_BASE = 'http://127.0.0.1:7822';
const SOCKET_PATH = '/tmp/madao-sms.sock';

const sidebarItems: SidebarItem[] = [
  { id: 'overview', title: 'Overview', subtitle: 'Dashboard' },
  { id: 'providers', title: 'Providers', subtitle: 'Single provider' },
  { id: 'messages', title: 'Messages', subtitle: 'Activations' },
  { id: 'settings', title: 'Settings', subtitle: 'Runtime preferences' },
];

const providerSections: Array<{ id: ProviderSectionId; label: string }> = [
  { id: 'config', label: 'Settings' },
  { id: 'store', label: 'Store' },
  { id: 'wallet', label: 'Wallet' },
];

const messageFilters: Array<{ id: MessageFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'received', label: 'Received' },
  { id: 'waiting', label: 'Waiting' },
  { id: 'failed', label: 'Failed' },
];

const handlerApiServices: OptionItem[] = [
  { value: 'dr', label: 'OpenAI / ChatGPT', hint: 'dr' },
  { value: 'tg', label: 'Telegram', hint: 'tg' },
  { value: 'wa', label: 'WhatsApp', hint: 'wa' },
  { value: 'fb', label: 'Facebook', hint: 'fb' },
  { value: 'ds', label: 'Discord', hint: 'ds' },
];

const fiveSimServices: OptionItem[] = [
  { value: 'openai', label: 'OpenAI', hint: 'openai' },
  { value: 'telegram', label: 'Telegram', hint: 'telegram' },
  { value: 'whatsapp', label: 'WhatsApp', hint: 'whatsapp' },
  { value: 'facebook', label: 'Facebook', hint: 'facebook' },
  { value: 'discord', label: 'Discord', hint: 'discord' },
];

const handlerApiCountries: OptionItem[] = [
  { value: '0', label: 'Russia', hint: '0' },
  { value: '1', label: 'Ukraine', hint: '1' },
  { value: '2', label: 'Kazakhstan', hint: '2' },
  { value: '50', label: 'United States', hint: '50' },
  { value: '86', label: 'China', hint: '86' },
  { value: '44', label: 'United Kingdom', hint: '44' },
];

const fiveSimCountries: OptionItem[] = [
  { value: 'any', label: 'Any Country', hint: 'any' },
  { value: 'usa', label: 'United States', hint: 'usa' },
  { value: 'england', label: 'United Kingdom', hint: 'england' },
  { value: 'canada', label: 'Canada', hint: 'canada' },
  { value: 'germany', label: 'Germany', hint: 'germany' },
  { value: 'japan', label: 'Japan', hint: 'japan' },
];

export function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [manifests, setManifests] = useState<Record<string, ProviderManifest>>({});
  const [rawEditors, setRawEditors] = useState<Record<string, string>>({});
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [pricePanels, setPricePanels] = useState<Record<string, ProviderPriceResponse>>({});
  const [statusMessage, setStatusMessage] = useState<string>('控制台已就绪，等待操作。');
  const [busyAction, setBusyAction] = useState<string>('');
  const [activeScreen, setActiveScreen] = useState<ScreenId>('overview');
  const [activeProviderSection, setActiveProviderSection] = useState<ProviderSectionId>('config');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showAdvancedEditor, setShowAdvancedEditor] = useState(true);
  const [compactTables, setCompactTables] = useState(false);
  const [messageFilter, setMessageFilter] = useState<MessageFilter>('all');
  const [providerSearch, setProviderSearch] = useState('');
  const [selectorState, setSelectorState] = useState<SelectorState | null>(null);
  const [selectorSearch, setSelectorSearch] = useState('');
  const [showManifestModal, setShowManifestModal] = useState(false);
  const [showActivationModal, setShowActivationModal] = useState(false);
  const [activationForm, setActivationForm] = useState<ActivationFormState>({
    service: 'openai',
    country: 'any',
    provider: 'auto',
    min_price: '',
    max_price: '',
    operator: 'any',
  });
  const [activationBusy, setActivationBusy] = useState(false);
  const [activationError, setActivationError] = useState('');
  const [providerOrder, setProviderOrder] = useState<string[]>([]);

  useEffect(() => {
    void Promise.all([loadSnapshot(), loadManifests()]);
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => void loadSnapshot(), 4000);
    return () => window.clearInterval(timer);
  }, [autoRefresh]);

  const visibleProviders = useMemo(
    () => Object.values(manifests).filter((manifest) => manifest.id !== 'mock' && manifest.kind !== 'mock'),
    [manifests],
  );

  useEffect(() => {
    if (visibleProviders.length === 0) return;
    if (!visibleProviders.some((item) => item.id === selectedProvider)) {
      setSelectedProvider(visibleProviders[0].id);
    }
  }, [visibleProviders, selectedProvider]);

  const selectedManifest = manifests[selectedProvider];
  const selectedSummary = snapshot?.providers.find((provider) => provider.id === selectedProvider);
  const selectedPrices = pricePanels[selectedProvider];

  const filteredProviderList = useMemo(() => {
    if (!providerSearch.trim()) return visibleProviders;
    const term = providerSearch.trim().toLowerCase();
    return visibleProviders.filter((provider) =>
      [provider.name, provider.id, provider.description ?? ''].some((value) =>
        value.toLowerCase().includes(term),
      ),
    );
  }, [providerSearch, visibleProviders]);

  const filteredSelectorOptions = useMemo(() => {
    if (!selectorState) return [];
    if (!selectorSearch.trim()) return selectorState.options;
    const term = selectorSearch.trim().toLowerCase();
    return selectorState.options.filter((item) =>
      [item.label, item.value, item.hint].some((value) => value.toLowerCase().includes(term)),
    );
  }, [selectorSearch, selectorState]);

  const overviewStats = useMemo(() => {
    const providers = (snapshot?.providers ?? []).filter((item) => item.id !== 'mock');
    const tickets = (snapshot?.tickets ?? []).filter((item) => item.provider !== 'mock');
    const logs = snapshot?.logs ?? [];
    return {
      totalMessages: tickets.length.toLocaleString(),
      activeProviders: providers.filter((item) => item.enabled).length.toString(),
      successRate: `${tickets.length === 0 ? '100.0' : ((tickets.filter((item) => item.status === 'CodeReceived').length / tickets.length) * 100).toFixed(1)}%`,
      logCount: logs.length.toString(),
    };
  }, [snapshot]);

  const recentActivity = useMemo(() => {
    const tickets = (snapshot?.tickets ?? []).filter((item) => item.provider !== 'mock');
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
        message: `Auto-generated overview row ${index + 1}`,
      }));
  }, [snapshot]);

  const filteredMessages = useMemo(() => {
    const tickets = (snapshot?.tickets ?? []).filter((item) => item.provider !== 'mock');
    if (messageFilter === 'all') return tickets;
    return tickets.filter((ticket) => {
      const status = ticket.status.toLowerCase();
      if (messageFilter === 'received') return status.includes('received') || status.includes('code');
      if (messageFilter === 'waiting') return status.includes('wait') || status.includes('pending');
      return status.includes('fail') || status.includes('cancel');
    });
  }, [snapshot, messageFilter]);

  async function loadSnapshot() {
    const response = await fetch(`${API_BASE}/api/providers`);
    const data = (await response.json()) as Snapshot;
    startTransition(() => setSnapshot(data));
  }

  async function loadManifests() {
    const response = await fetch(`${API_BASE}/api/provider-manifests`);
    const data = (await response.json()) as ProviderManifestList;
    const next: Record<string, ProviderManifest> = {};
    const editors: Record<string, string> = {};
    for (const manifest of data.manifests) {
      next[manifest.id] = manifest;
      editors[manifest.id] = JSON.stringify(manifest, null, 2);
    }
    const sorted = [...data.manifests]
      .filter((m) => m.kind !== 'mock')
      .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100) || a.id.localeCompare(b.id))
      .map((m) => m.id);
    startTransition(() => {
      setManifests(next);
      setRawEditors(editors);
      setProviderOrder((prev) => (prev.length === 0 ? sorted : prev));
    });
  }

  async function reorderProviders(orderedIds: string[]) {
    const order = orderedIds.map((id, index) => ({ id, priority: (index + 1) * 10 }));
    try {
      const response = await fetch(`${API_BASE}/api/providers/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order }),
      });
      if (!response.ok) throw new Error(await response.text());
      setStatusMessage('Provider 优先级顺序已保存。');
      await loadManifests();
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
      if (activationForm.provider === 'fivesim' && activationForm.operator) {
        body.metadata = { operator: activationForm.operator };
      }
      const response = await fetch(`${API_BASE}/api/acquire`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const err = (await response.json()) as { message?: string };
        throw new Error(err.message ?? response.statusText);
      }
      setShowActivationModal(false);
      setStatusMessage('Activation 已创建，等待验证码。');
      void loadSnapshot();
    } catch (error) {
      setActivationError(String(error));
    } finally {
      setActivationBusy(false);
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
      const nextManifest: ProviderManifest = structuredClone(manifest);
      if (section === 'root') {
        (nextManifest as Record<string, unknown>)[field] = value;
      } else {
        const target = (nextManifest as Record<string, unknown>)[section] as Record<string, unknown> | undefined;
        if (target) target[field] = value;
      }
      setRawEditors((rawCurrent) => ({
        ...rawCurrent,
        [providerId]: JSON.stringify(nextManifest, null, 2),
      }));
      return {
        ...current,
        [providerId]: nextManifest,
      };
    });
  }

  async function saveProvider(providerId: string) {
    try {
      setBusyAction(`save-${providerId}`);
      let manifest: ProviderManifest;
      try {
        manifest = JSON.parse(rawEditors[providerId] ?? '{}') as ProviderManifest;
      } catch (error) {
        setStatusMessage(`保存 ${providerId} 失败：高级配置 JSON 解析错误，${String(error)}`);
        return;
      }
      const response = await fetch(`${API_BASE}/api/providers/${providerId}/manifest`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(manifest),
      });
      if (!response.ok) throw new Error(await response.text());
      setStatusMessage(`已保存 ${providerId} 配置，并完成热重载。`);
      await Promise.all([loadManifests(), loadSnapshot()]);
    } catch (error) {
      setStatusMessage(`保存 ${providerId} 失败：${String(error)}`);
    } finally {
      setBusyAction('');
    }
  }

  async function reloadProviders() {
    try {
      setBusyAction('reload');
      const response = await fetch(`${API_BASE}/api/provider-manifests/reload`, { method: 'POST' });
      if (!response.ok) throw new Error(await response.text());
      setStatusMessage('协议兼容 provider 已重新加载。');
      await Promise.all([loadManifests(), loadSnapshot()]);
    } catch (error) {
      setStatusMessage(`重载失败：${String(error)}`);
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
      setStatusMessage(`已获取 ${providerId} 余额。`);
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
        body: JSON.stringify({
          provider: providerId,
          service: manifest.defaults.service,
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      const payload = (await response.json()) as ProviderPriceResponse;
      setPricePanels((current) => ({
        ...current,
        [providerId]: payload,
      }));
      setStatusMessage(`已同步 ${providerId} 价格与库存面板。`);
    } catch (error) {
      setStatusMessage(`查询价格失败：${String(error)}`);
    } finally {
      setBusyAction('');
    }
  }

  function serviceOptionsFor(manifest: ProviderManifest): OptionItem[] {
    return manifest.kind === 'five_sim' ? fiveSimServices : handlerApiServices;
  }

  function countryOptionsFor(manifest: ProviderManifest): OptionItem[] {
    return manifest.kind === 'five_sim' ? fiveSimCountries : handlerApiCountries;
  }

  function openSelector(kind: SelectorKind) {
    if (!selectedManifest) return;
    const options = kind === 'service' ? serviceOptionsFor(selectedManifest) : countryOptionsFor(selectedManifest);
    setSelectorSearch('');
    setSelectorState({
      providerId: selectedManifest.id,
      kind,
      title: kind === 'service' ? 'Select Default Service' : 'Select Default Country',
      options,
    });
  }

  function applySelectorOption(option: OptionItem) {
    if (!selectorState) return;
    updateManifestField(selectorState.providerId, 'defaults', selectorState.kind, option.value);
    setSelectorState(null);
  }

  function setApiKey(providerId: string, value: string) {
    const manifest = manifests[providerId];
    if (!manifest) return;
    if (manifest.handler_api) {
      updateManifestField(providerId, 'handler_api', 'api_key', value);
    }
    if (manifest.five_sim) {
      updateManifestField(providerId, 'five_sim', 'api_key', value);
    }
  }

  function apiKeyValue(manifest: ProviderManifest) {
    return String(manifest.handler_api?.api_key ?? manifest.five_sim?.api_key ?? '');
  }

  return (
    <main className="mac-shell">
      <div className="mac-window">
        <aside className="mac-sidebar">
          <div className="sidebar-header">
            <strong>MaDao</strong>
            <span>Internal protocol console</span>
          </div>
          <nav className="sidebar-nav">
            {sidebarItems.map((item) => (
              <button
                key={item.id}
                className={activeScreen === item.id ? 'sidebar-item active' : 'sidebar-item'}
                onClick={() => setActiveScreen(item.id)}
              >
                <strong>{item.title}</strong>
                <span>{item.subtitle}</span>
              </button>
            ))}
          </nav>
        </aside>

        <section className="mac-main">
          <header className="mac-toolbar">
            <div className="toolbar-left">
              <span className="toolbar-caption">{sidebarItems.find((item) => item.id === activeScreen)?.subtitle}</span>
              <strong>{sidebarItems.find((item) => item.id === activeScreen)?.title}</strong>
            </div>
            <div className="toolbar-right">
              <button className="toolbar-button" onClick={() => void loadSnapshot()}>
                Refresh
              </button>
              <button className="toolbar-button" onClick={() => void reloadProviders()} disabled={busyAction === 'reload'}>
                Reload
              </button>
              <button className="toolbar-button primary" onClick={() => setShowActivationModal(true)}>
                + New Activation
              </button>
            </div>
          </header>

          <div className={compactTables ? 'content-scroll compact' : 'content-scroll'}>
            {activeScreen === 'overview' && (
              <OverviewScreen stats={overviewStats} activity={recentActivity} statusMessage={statusMessage} />
            )}

            {activeScreen === 'providers' && selectedManifest && (
              <ProviderWorkspaceScreen
                providers={filteredProviderList}
                providerOrder={providerOrder}
                selectedProvider={selectedProvider}
                selectedManifest={selectedManifest}
                selectedSummary={selectedSummary}
                selectedPrices={selectedPrices}
                selectedSection={activeProviderSection}
                providerSearch={providerSearch}
                showAdvancedEditor={showAdvancedEditor}
                busyAction={busyAction}
                rawEditor={rawEditors[selectedProvider] ?? ''}
                balanceLabel={balances[selectedProvider] ?? '未查询'}
                onProviderSearch={setProviderSearch}
                onSelectProvider={(providerId) => setSelectedProvider(providerId)}
                onSelectSection={setActiveProviderSection}
                onOpenSelector={openSelector}
                onManifestFieldChange={(section, field, value) =>
                  updateManifestField(selectedProvider, section, field, value)
                }
                onApiKeyChange={(value) => setApiKey(selectedProvider, value)}
                apiKeyValue={apiKeyValue(selectedManifest)}
                onFetchBalance={() => void fetchBalance(selectedProvider)}
                onFetchPrices={() => void fetchPrices(selectedProvider)}
                onOpenAdvancedEditor={() => setShowManifestModal(true)}
                onReorder={(ids) => {
                  setProviderOrder(ids);
                  void reorderProviders(ids);
                }}
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
              />
            )}
          </div>
        </section>
      </div>

      {showActivationModal && (
        <NewActivationModal
          providers={visibleProviders}
          form={activationForm}
          busy={activationBusy}
          error={activationError}
          onChange={(field, value) => setActivationForm((prev) => ({ ...prev, [field]: value }))}
          onClose={() => { setShowActivationModal(false); setActivationError(''); }}
          onSubmit={() => void submitActivation()}
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
    </main>
  );
}

function OverviewScreen(props: {
  stats: { totalMessages: string; activeProviders: string; successRate: string; logCount: string };
  activity: TicketRecord[];
  statusMessage: string;
}) {
  return (
    <section className="screen-stack">
      <div className="screen-header">
        <div>
          <h1>Good morning, Developer</h1>
          <p>Here&apos;s what&apos;s happening with your SMS services today.</p>
        </div>
        <div className="header-note">{props.statusMessage}</div>
      </div>
      <div className="stats-grid">
        <MetricCard title="Messages Sent" value={props.stats.totalMessages} caption="+15% from current session baseline" tone="success" />
        <MetricCard title="Active Providers" value={props.stats.activeProviders} caption="All systems operational" tone="success" />
        <MetricCard title="Success Rate" value={props.stats.successRate} caption="Live protocol delivery confidence" tone="warning" />
      </div>
      <section className="panel-card">
        <div className="panel-headline">
          <h2>Recent Activity</h2>
          <span>{props.stats.logCount} log events</span>
        </div>
        <div className="table-grid">
          <div className="table-row head four-col">
            <span>Provider</span>
            <span>Status</span>
            <span>Recipient</span>
            <span>Service</span>
          </div>
          {props.activity.map((item) => (
            <div className="table-row four-col" key={item.id}>
              <span>{item.provider}</span>
              <span><StatusBadge status={item.status} /></span>
              <span>{item.phone_number}</span>
              <span>{item.service}</span>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

function ProviderWorkspaceScreen(props: {
  providers: ProviderManifest[];
  providerOrder: string[];
  selectedProvider: string;
  selectedManifest: ProviderManifest;
  selectedSummary?: ProviderSummary;
  selectedPrices?: ProviderPriceResponse;
  selectedSection: ProviderSectionId;
  providerSearch: string;
  showAdvancedEditor: boolean;
  busyAction: string;
  rawEditor: string;
  balanceLabel: string;
  onProviderSearch: (value: string) => void;
  onSelectProvider: (providerId: string) => void;
  onSelectSection: (section: ProviderSectionId) => void;
  onOpenSelector: (kind: SelectorKind) => void;
  onManifestFieldChange: (
    section: 'root' | 'defaults' | 'handler_api' | 'five_sim' | 'mock',
    field: string,
    value: string | number | boolean,
  ) => void;
  onApiKeyChange: (value: string) => void;
  apiKeyValue: string;
  onFetchBalance: () => void;
  onFetchPrices: () => void;
  onOpenAdvancedEditor: () => void;
  onReorder: (orderedIds: string[]) => void;
}) {
  const dragIndex = useRef<number | null>(null);

  const orderedProviders = useMemo(() => {
    const byId = Object.fromEntries(props.providers.map((p) => [p.id, p]));
    const ordered = props.providerOrder.map((id) => byId[id]).filter(Boolean) as ProviderManifest[];
    const extra = props.providers.filter((p) => !props.providerOrder.includes(p.id));
    return [...ordered, ...extra];
  }, [props.providers, props.providerOrder]);

  const filteredOrdered = useMemo(() => {
    if (!props.providerSearch.trim()) return orderedProviders;
    const term = props.providerSearch.trim().toLowerCase();
    return orderedProviders.filter((p) =>
      [p.name, p.id, p.description ?? ''].some((v) => v.toLowerCase().includes(term)),
    );
  }, [orderedProviders, props.providerSearch]);

  function handleDragStart(index: number) {
    dragIndex.current = index;
  }

  function handleDragOver(event: React.DragEvent, index: number) {
    event.preventDefault();
    if (dragIndex.current === null || dragIndex.current === index) return;
    const next = [...filteredOrdered];
    const [moved] = next.splice(dragIndex.current, 1);
    next.splice(index, 0, moved);
    dragIndex.current = index;
    props.onReorder(next.map((p) => p.id));
  }

  function handleDrop() {
    dragIndex.current = null;
  }

  return (
    <section className="store-shell">
      <aside className="store-pane">
        <div className="store-search-wrap">
          <span className="provider-search-icon">🔍</span>
          <input value={props.providerSearch} onChange={(event) => props.onProviderSearch(event.target.value)} placeholder="Search providers..." />
        </div>
        <div className="store-list">
          <div className="provider-list-header">
            <span>Priority</span>
            <span>Provider</span>
          </div>
          {filteredOrdered.map((provider, index) => (
            <div
              key={provider.id}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={handleDrop}
              className={`store-list-item draggable${props.selectedProvider === provider.id ? ' active' : ''}`}
              onClick={() => props.onSelectProvider(provider.id)}
            >
              <div className="store-list-item-left">
                <span className="drag-handle">⠿</span>
                <span className="priority-badge">{index + 1}</span>
                <div className="provider-glyph" />
                <strong>{provider.name}</strong>
              </div>
              <StatusBadge status={provider.enabled ? 'Connected' : 'Standby'} />
            </div>
          ))}
        </div>
        <div className="routing-rules-section">
          <h4>Routing Rules</h4>
          <div className="routing-row">
            <span>Strategy</span>
            <span className="routing-value">Priority Fallback</span>
          </div>
          <div className="routing-row">
            <span>Auto-fallback</span>
            <span className="routing-value">Enabled</span>
          </div>
          <p className="routing-hint">Drag providers above to set priority. Auto mode tries each in order.</p>
        </div>
      </aside>

      <section className="store-detail">
        <div className="screen-header">
          <div>
            <h1>{props.selectedManifest.name}</h1>
            <p>{props.selectedManifest.description ?? 'Manage provider configuration, inventory and wallet details.'}</p>
          </div>
          <div className="header-actions">
            {props.showAdvancedEditor && (
              <button className="toolbar-button" onClick={props.onOpenAdvancedEditor}>
                Edit Raw Manifest
              </button>
            )}
            <button className="toolbar-button" onClick={props.onFetchBalance} disabled={props.busyAction.includes('balance')}>
              Balance
            </button>
            <button className="toolbar-button primary" onClick={() => props.onManifestFieldChange('root', 'enabled', !props.selectedManifest.enabled)}>
              {props.selectedManifest.enabled ? 'Disable' : 'Enable'}
            </button>
          </div>
        </div>

        <div className="provider-subnav">
          {providerSections.map((item) => (
            <button
              key={item.id}
              className={props.selectedSection === item.id ? 'provider-tab active' : 'provider-tab'}
              onClick={() => props.onSelectSection(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {props.selectedSection === 'config' && (
          <section className="screen-stack">
            <div className="provider-cards">
              <article className="provider-card">
                <div className="provider-card-head">
                  <div className="provider-glyph" />
                  <StatusBadge status={props.selectedManifest.enabled ? 'Connected' : 'Standby'} />
                </div>
                <h3>Provider</h3>
                <p>{props.selectedSummary?.protocol ?? props.selectedManifest.kind}</p>
              </article>
              <article className="provider-card">
                <div className="provider-card-head">
                  <div className="provider-glyph" />
                  <StatusBadge status="Balance" />
                </div>
                <h3>Wallet</h3>
                <p>{props.balanceLabel}</p>
              </article>
              <article className="provider-card">
                <div className="provider-card-head">
                  <div className="provider-glyph" />
                  <StatusBadge status="Route" />
                </div>
                <h3>Default Route</h3>
                <p>{props.selectedManifest.defaults.service} · {props.selectedManifest.defaults.country}</p>
              </article>
            </div>

            <section className="panel-card">
              <div className="panel-headline">
                <h2>Provider Settings</h2>
                <span>Daily controls</span>
              </div>
              <div className="config-grid">
                <Field label="Provider Name">
                  <input value={props.selectedManifest.name} onChange={(event) => props.onManifestFieldChange('root', 'name', event.target.value)} />
                </Field>
                <Field label="Enabled">
                  <label className="switch-row">
                    <input type="checkbox" checked={props.selectedManifest.enabled} onChange={(event) => props.onManifestFieldChange('root', 'enabled', event.target.checked)} />
                    <span>{props.selectedManifest.enabled ? 'Enabled' : 'Disabled'}</span>
                  </label>
                </Field>
                <Field label="API Key">
                  <input value={props.apiKeyValue} onChange={(event) => props.onApiKeyChange(event.target.value)} placeholder="Paste provider key" />
                </Field>
                <Field label="Summary">
                  <input value={props.selectedSummary?.description ?? props.selectedManifest.description ?? ''} onChange={(event) => props.onManifestFieldChange('root', 'description', event.target.value)} />
                </Field>
                <Field label="Default Service">
                  <button className="selector-button" onClick={() => props.onOpenSelector('service')}>
                    <span>{props.selectedManifest.defaults.service}</span>
                    <strong>Select</strong>
                  </button>
                </Field>
                <Field label="Default Country">
                  <button className="selector-button" onClick={() => props.onOpenSelector('country')}>
                    <span>{props.selectedManifest.defaults.country}</span>
                    <strong>Select</strong>
                  </button>
                </Field>
                <Field label="Max Price">
                  <input type="number" value={props.selectedManifest.defaults.max_price} onChange={(event) => props.onManifestFieldChange('defaults', 'max_price', Number(event.target.value))} />
                </Field>
                <Field label="Min Balance">
                  <input type="number" value={props.selectedManifest.defaults.min_balance} onChange={(event) => props.onManifestFieldChange('defaults', 'min_balance', Number(event.target.value))} />
                </Field>
                <Field label="Poll Timeout">
                  <input type="number" value={props.selectedManifest.defaults.poll_timeout_sec} onChange={(event) => props.onManifestFieldChange('defaults', 'poll_timeout_sec', Number(event.target.value))} />
                </Field>
                <Field label="Reuse Max">
                  <input type="number" value={props.selectedManifest.defaults.reuse_max} onChange={(event) => props.onManifestFieldChange('defaults', 'reuse_max', Number(event.target.value))} />
                </Field>
              </div>
            </section>
          </section>
        )}

        {props.selectedSection === 'store' && (
          <section className="screen-stack">
            <section className="panel-card">
              <div className="panel-headline">
                <h2>Price Inventory</h2>
                <div className="header-actions">
                  <span>{props.selectedPrices ? `${props.selectedPrices.items.length} rows` : 'Not loaded'}</span>
                  <button className="toolbar-button primary" onClick={props.onFetchPrices} disabled={props.busyAction.includes('prices')}>
                    Load Prices
                  </button>
                </div>
              </div>
              {props.selectedPrices ? (
                <div className="table-grid">
                  <div className="table-row head four-col">
                    <span>Country</span>
                    <span>Price</span>
                    <span>Stock</span>
                    <span>Service</span>
                  </div>
                  {props.selectedPrices.items.slice(0, 10).map((item) => (
                    <div className="table-row four-col" key={`${item.country}-${item.display_name}`}>
                      <span>{item.display_name}</span>
                      <span>${item.price.toFixed(3)}</span>
                      <span>{item.stock}</span>
                      <span>{props.selectedPrices?.service}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">点击 Load Prices 后展示当前 provider 的库存与价格面板。</div>
              )}
            </section>
          </section>
        )}

        {props.selectedSection === 'wallet' && (
          <WalletInnerSection
            providerName={props.selectedManifest.name}
            providerId={props.selectedManifest.id}
            balanceLabel={props.balanceLabel}
            onFetchBalance={props.onFetchBalance}
            isBusy={props.busyAction.includes('balance')}
          />
        )}
      </section>
    </section>
  );
}

function MessagesScreen(props: {
  tickets: TicketRecord[];
  filter: MessageFilter;
  setFilter: (value: MessageFilter) => void;
}) {
  return (
    <section className="screen-stack">
      <div className="screen-header">
        <div>
          <h1>Activations</h1>
          <p>Review active message flows, verification codes and provider delivery outcomes.</p>
        </div>
        <div className="tab-strip">
          {messageFilters.map((item) => (
            <button
              key={item.id}
              className={props.filter === item.id ? 'pill-tab active' : 'pill-tab'}
              onClick={() => props.setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="message-cards">
        {props.tickets.length > 0 ? (
          props.tickets.slice(0, 8).map((ticket) => {
            const status = ticket.status.toLowerCase();
            const isReceived = status.includes('received') || status.includes('code');
            const isWaiting = status.includes('wait') || status.includes('pending');
            const isFailed = status.includes('fail') || status.includes('cancel');

            let cardClass = 'activation-card';
            if (isWaiting) cardClass += ' waiting';
            else if (isFailed) cardClass += ' failed';

            return (
              <article className={cardClass} key={ticket.id}>
                <div className="act-header">
                  <div className="act-service">
                    <div className="provider-glyph" />
                    <strong>{ticket.service}</strong>
                  </div>
                  <div className="act-meta">
                    <div className="act-phone">
                      {ticket.country} {ticket.phone_number}
                    </div>
                    {ticket.price && <span className="act-price">${ticket.price}</span>}
                    {isFailed && <span className="act-status error">Refunded</span>}
                  </div>
                </div>

                <div className="act-body">
                  {isReceived && (
                    <div className="act-code-box received">
                      <strong className="code-text">{ticket.code ?? '---'}</strong>
                      <div className="code-caption">SMS received successfully</div>
                    </div>
                  )}
                  {isWaiting && (
                    <div className="act-code-box waiting">
                      <strong className="waiting-text">Waiting for SMS...</strong>
                      <div className="code-caption">{ticket.message ?? 'Check provider dashboard'}</div>
                    </div>
                  )}
                  {isFailed && (
                    <div className="act-code-box failed">
                      <strong className="failed-text">Activation canceled or expired</strong>
                      <div className="code-caption">{ticket.message ?? 'You were not charged for this request.'}</div>
                    </div>
                  )}
                </div>

                <div className="act-footer">
                  <span className="act-provider-label">Provider: {ticket.provider}</span>
                  <div className="act-actions">
                    {isReceived && <button className="toolbar-button primary">Finish Activation</button>}
                    {isWaiting && (
                      <>
                        <button className="toolbar-button danger-outline">Cancel & Refund</button>
                        <button className="toolbar-button success">Buy Another</button>
                      </>
                    )}
                    {isFailed && <button className="toolbar-button">Try Again</button>}
                  </div>
                </div>
              </article>
            );
          })
        ) : (
          <div className="empty-state">当前没有 activations。等 provider 流量进入后，这里会按卡片流展示。</div>
        )}
      </div>
    </section>
  );
}

function WalletInnerSection(props: {
  providerName: string;
  providerId: string;
  balanceLabel: string;
  onFetchBalance: () => void;
  isBusy: boolean;
}) {
  return (
    <section className="screen-stack">
      <div className="screen-header">
        <div>
          <h1>Current Balance</h1>
          <p>Track {props.providerName} balance and provider-side transaction state.</p>
        </div>
        <div className="header-actions">
          <button className="toolbar-button primary" onClick={props.onFetchBalance} disabled={props.isBusy}>
            Top Up / Refresh
          </button>
        </div>
      </div>
      <section className="wallet-hero">
        <div>
          <span>Selected Provider</span>
          <strong>{props.providerName}</strong>
        </div>
        <div>
          <span>Current Balance</span>
          <strong>{props.balanceLabel}</strong>
        </div>
      </section>
      <section className="panel-card">
        <div className="panel-headline">
          <h2>Provider Wallet</h2>
          <span>{props.providerId}</span>
        </div>
        <div className="details-stack">
          <div className="detail-row">
            <span>Runtime source</span>
            <strong>Live provider balance API</strong>
          </div>
          <div className="detail-row">
            <span>Usage</span>
            <strong>Activation purchases and refunds</strong>
          </div>
          <div className="detail-row">
            <span>Balance</span>
            <strong>{props.balanceLabel}</strong>
          </div>
        </div>
      </section>
    </section>
  );
}

function SettingsScreen(props: {
  autoRefresh: boolean;
  setAutoRefresh: (value: boolean) => void;
  showAdvancedEditor: boolean;
  setShowAdvancedEditor: (value: boolean) => void;
  compactTables: boolean;
  setCompactTables: (value: boolean) => void;
}) {
  return (
    <section className="screen-stack">
      <div className="screen-header">
        <div>
          <h1>Settings</h1>
          <p>Configure desktop refresh, table density and editor behavior.</p>
        </div>
      </div>
      <section className="panel-card">
        <div className="settings-group">
          <h2>General</h2>
          <ToggleSetting title="Auto Refresh" description="Refresh runtime snapshot every 4 seconds." checked={props.autoRefresh} onChange={props.setAutoRefresh} />
          <ToggleSetting title="Advanced Manifest Access" description="Allow opening the raw manifest editor modal." checked={props.showAdvancedEditor} onChange={props.setShowAdvancedEditor} />
          <ToggleSetting title="Compact Tables" description="Tighten spacing for activity and history tables." checked={props.compactTables} onChange={props.setCompactTables} />
        </div>
        <div className="settings-group">
          <h2>Server Configuration</h2>
          <div className="settings-row">
            <span>HTTP Endpoint</span>
            <code>{API_BASE}</code>
          </div>
          <div className="settings-row">
            <span>Socket Path</span>
            <code>{SOCKET_PATH}</code>
          </div>
          <div className="settings-row">
            <span>Desktop Runtime</span>
            <code>Embedded HTTP auto-starts in Tauri</code>
          </div>
        </div>
      </section>
    </section>
  );
}

function MetricCard(props: { title: string; value: string; caption: string; tone: 'success' | 'warning' }) {
  return (
    <article className="metric-card">
      <header>
        <span>{props.title}</span>
        <small className={props.tone === 'success' ? 'tone-success' : 'tone-warning'}>{props.caption}</small>
      </header>
      <strong>{props.value}</strong>
    </article>
  );
}

function Field(props: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{props.label}</span>
      {props.children}
    </label>
  );
}

function ToggleSetting(props: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="toggle-setting">
      <div>
        <strong>{props.title}</strong>
        <p>{props.description}</p>
      </div>
      <label className="switch-row">
        <input type="checkbox" checked={props.checked} onChange={(event) => props.onChange(event.target.checked)} />
        <span>{props.checked ? 'On' : 'Off'}</span>
      </label>
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
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="modal-card selector-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{props.title}</h2>
            <p>Search and pick a predefined compatible option.</p>
          </div>
          <button className="toolbar-button" onClick={props.onClose}>
            Close
          </button>
        </div>
        <div className="selector-search-row">
          <input value={props.search} onChange={(event) => props.onSearch(event.target.value)} placeholder="Search options..." />
        </div>
        <div className="selector-list">
          {props.options.map((option) => (
            <button key={`${option.value}-${option.label}`} className="selector-item" onClick={() => props.onSelect(option)}>
              <strong>{option.label}</strong>
              <span>{option.hint}</span>
            </button>
          ))}
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
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Advanced Manifest</h2>
            <p>{props.providerName} · JSON source of truth</p>
          </div>
          <div className="header-actions">
            <button className="toolbar-button" onClick={props.onClose}>
              Close
            </button>
            <button className="toolbar-button primary" onClick={props.onSave} disabled={props.busy}>
              Save
            </button>
          </div>
        </div>
        <div className="advanced-editor modal-editor">
          <textarea value={props.rawEditor} onChange={(event) => props.onChange(event.target.value)} />
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
}) {
  const isFiveSim = props.form.provider === 'fivesim';

  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="modal-card activation-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>New Activation</h2>
            <p>Request a phone number from a provider to receive a verification code.</p>
          </div>
          <button className="toolbar-button" onClick={props.onClose}>
            Close
          </button>
        </div>

        <div className="activation-form">
          <Field label="Service">
            <input
              value={props.form.service}
              onChange={(e) => props.onChange('service', e.target.value)}
              placeholder="openai"
            />
          </Field>
          <Field label="Country">
            <input
              value={props.form.country}
              onChange={(e) => props.onChange('country', e.target.value)}
              placeholder="any"
            />
          </Field>
          <Field label="Provider">
            <select value={props.form.provider} onChange={(e) => props.onChange('provider', e.target.value)}>
              <option value="auto">Auto (Priority Routing)</option>
              {props.providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Min Price (USD)">
            <input
              type="number"
              value={props.form.min_price}
              onChange={(e) => props.onChange('min_price', e.target.value)}
              placeholder="0.00"
              min="0"
              step="0.01"
            />
          </Field>
          <Field label="Max Price (USD)">
            <input
              type="number"
              value={props.form.max_price}
              onChange={(e) => props.onChange('max_price', e.target.value)}
              placeholder="0.00"
              min="0"
              step="0.01"
            />
          </Field>
          {isFiveSim && (
            <Field label="Operator (FiveSim)">
              <select value={props.form.operator} onChange={(e) => props.onChange('operator', e.target.value)}>
                <option value="any">any</option>
                <option value="virtual1">virtual1</option>
                <option value="virtual2">virtual2</option>
                <option value="virtual3">virtual3</option>
              </select>
            </Field>
          )}
        </div>

        {props.error && <div className="activation-error">{props.error}</div>}

        <div className="modal-footer">
          <button className="toolbar-button" onClick={props.onClose} disabled={props.busy}>
            Cancel
          </button>
          <button className="toolbar-button primary" onClick={props.onSubmit} disabled={props.busy}>
            {props.busy ? 'Requesting…' : 'Request Number'}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge(props: { status: string }) {
  const normalized = props.status.toLowerCase();
  let tone = 'neutral';
  if (normalized.includes('connected') || normalized.includes('received') || normalized.includes('configured')) {
    tone = 'success';
  } else if (normalized.includes('standby') || normalized.includes('waiting') || normalized.includes('default')) {
    tone = 'warning';
  } else if (normalized.includes('failed') || normalized.includes('cancel') || normalized.includes('danger')) {
    tone = 'danger';
  }
  return <span className={`status-badge ${tone}`}>{props.status}</span>;
}
