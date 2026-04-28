import { startTransition, useEffect, useMemo, useState, type ReactNode } from 'react';

type ScreenId = 'overview' | 'providers' | 'messages' | 'store' | 'wallet' | 'settings';
type MessageFilter = 'all' | 'received' | 'waiting' | 'failed';

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

const API_BASE = 'http://127.0.0.1:7822';
const SOCKET_PATH = '/tmp/madao-sms.sock';
const sidebarItems: SidebarItem[] = [
  { id: 'overview', title: 'Overview', subtitle: 'Dashboard' },
  { id: 'providers', title: 'Providers', subtitle: 'Single provider' },
  { id: 'messages', title: 'Messages', subtitle: 'Activations' },
  { id: 'store', title: 'Store', subtitle: 'Provider catalog' },
  { id: 'wallet', title: 'Wallet', subtitle: 'Balances' },
  { id: 'settings', title: 'Settings', subtitle: 'Runtime preferences' },
];

const messageFilters: Array<{ id: MessageFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'received', label: 'Received' },
  { id: 'waiting', label: 'Waiting' },
  { id: 'failed', label: 'Failed' },
];

export function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [manifests, setManifests] = useState<Record<string, ProviderManifest>>({});
  const [rawEditors, setRawEditors] = useState<Record<string, string>>({});
  const [selectedProvider, setSelectedProvider] = useState<string>('mock');
  const [storeSelection, setStoreSelection] = useState<string>('mock');
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [pricePanels, setPricePanels] = useState<Record<string, ProviderPriceResponse>>({});
  const [statusMessage, setStatusMessage] = useState<string>('控制台已就绪，等待操作。');
  const [busyAction, setBusyAction] = useState<string>('');
  const [activeScreen, setActiveScreen] = useState<ScreenId>('overview');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showAdvancedEditor, setShowAdvancedEditor] = useState(true);
  const [compactTables, setCompactTables] = useState(false);
  const [messageFilter, setMessageFilter] = useState<MessageFilter>('all');
  const [storeSearch, setStoreSearch] = useState('');

  useEffect(() => {
    void Promise.all([loadSnapshot(), loadManifests()]);
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => void loadSnapshot(), 4000);
    return () => window.clearInterval(timer);
  }, [autoRefresh]);

  useEffect(() => {
    const ids = Object.keys(manifests);
    if (ids.length > 0 && !manifests[selectedProvider]) {
      setSelectedProvider(ids[0]);
    }
    if (ids.length > 0 && !manifests[storeSelection]) {
      setStoreSelection(ids[0]);
    }
  }, [manifests, selectedProvider, storeSelection]);

  const selectedManifest = manifests[selectedProvider];
  const selectedSummary = snapshot?.providers.find((provider) => provider.id === selectedProvider);
  const selectedPrices = pricePanels[selectedProvider];
  const storeManifest = manifests[storeSelection];
  const storeSummary = snapshot?.providers.find((provider) => provider.id === storeSelection);
  const filteredStoreProviders = useMemo(() => {
    const items = Object.values(manifests);
    if (!storeSearch.trim()) return items;
    const term = storeSearch.trim().toLowerCase();
    return items.filter((manifest) =>
      [manifest.name, manifest.id, manifest.description ?? ''].some((value) =>
        value.toLowerCase().includes(term),
      ),
    );
  }, [manifests, storeSearch]);

  const overviewStats = useMemo(() => {
    const providers = snapshot?.providers ?? [];
    const tickets = snapshot?.tickets ?? [];
    const logs = snapshot?.logs ?? [];
    return {
      totalMessages: tickets.length.toLocaleString(),
      activeProviders: providers.filter((item) => item.enabled).length.toString(),
      successRate: `${tickets.length === 0 ? '100.0' : ((tickets.filter((item) => item.status === 'CodeReceived').length / tickets.length) * 100).toFixed(1)}%`,
      logCount: logs.length.toString(),
    };
  }, [snapshot]);

  const recentActivity = useMemo(() => {
    const tickets = snapshot?.tickets ?? [];
    if (tickets.length > 0) return tickets.slice(0, 6);
    return (snapshot?.providers ?? []).slice(0, 3).map((provider, index) => ({
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
    const tickets = snapshot?.tickets ?? [];
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
    startTransition(() => {
      setManifests(next);
      setRawEditors(editors);
    });
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
              <button className="toolbar-button primary" onClick={() => void reloadProviders()} disabled={busyAction === 'reload'}>
                Reload
              </button>
            </div>
          </header>

          <div className={compactTables ? 'content-scroll compact' : 'content-scroll'}>
            {activeScreen === 'overview' && (
              <OverviewScreen stats={overviewStats} activity={recentActivity} statusMessage={statusMessage} />
            )}
            {activeScreen === 'providers' && selectedManifest && (
              <ProvidersScreen
                providers={Object.values(manifests)}
                manifest={selectedManifest}
                summary={selectedSummary}
                rawEditor={rawEditors[selectedProvider] ?? ''}
                balanceLabel={balances[selectedProvider] ?? '未查询'}
                busyAction={busyAction}
                showAdvancedEditor={showAdvancedEditor}
                selectedProvider={selectedProvider}
                onSelectProvider={(providerId) => {
                  setSelectedProvider(providerId);
                  setStoreSelection(providerId);
                }}
                onManifestFieldChange={(section, field, value) =>
                  updateManifestField(selectedProvider, section, field, value)
                }
                onRawChange={(value) =>
                  setRawEditors((current) => ({
                    ...current,
                    [selectedProvider]: value,
                  }))
                }
                onSave={() => void saveProvider(selectedProvider)}
                onFetchBalance={() => void fetchBalance(selectedProvider)}
              />
            )}
            {activeScreen === 'messages' && (
              <MessagesScreen tickets={filteredMessages} filter={messageFilter} setFilter={setMessageFilter} />
            )}
            {activeScreen === 'store' && (
              <StoreScreen
                providers={filteredStoreProviders}
                selectedManifest={storeManifest}
                selectedSummary={storeSummary}
                search={storeSearch}
                onSearch={setStoreSearch}
                onSelect={(providerId) => {
                  setStoreSelection(providerId);
                  setSelectedProvider(providerId);
                }}
              />
            )}
            {activeScreen === 'wallet' && (
              <WalletScreen
                selectedProvider={selectedProvider}
                balanceLabel={balances[selectedProvider] ?? '未查询'}
                logs={snapshot?.logs ?? []}
                onFetchBalance={() => void fetchBalance(selectedProvider)}
                isBusy={busyAction === `balance-${selectedProvider}`}
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
              />
            )}
          </div>
        </section>
      </div>
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

function ProvidersScreen(props: {
  providers: ProviderManifest[];
  manifest: ProviderManifest;
  summary?: ProviderSummary;
  rawEditor: string;
  balanceLabel: string;
  busyAction: string;
  showAdvancedEditor: boolean;
  selectedProvider: string;
  onSelectProvider: (providerId: string) => void;
  onManifestFieldChange: (
    section: 'root' | 'defaults' | 'handler_api' | 'five_sim' | 'mock',
    field: string,
    value: string | number | boolean,
  ) => void;
  onRawChange: (value: string) => void;
  onSave: () => void;
  onFetchBalance: () => void;
}) {
  return (
    <section className="screen-stack">
      <div className="screen-header">
        <div>
          <h1>{props.manifest.name}</h1>
          <p>Manage a single provider route, protocol endpoint and activation defaults.</p>
        </div>
        <div className="header-actions">
          <button className="toolbar-button" onClick={props.onFetchBalance} disabled={props.busyAction.includes('balance')}>
            Balance
          </button>
          <button className="toolbar-button primary" onClick={props.onSave} disabled={props.busyAction.includes('save')}>
            Save
          </button>
        </div>
      </div>

      <section className="provider-switcher">
        {props.providers.map((provider) => (
          <button
            key={provider.id}
            className={props.selectedProvider === provider.id ? 'provider-chip active' : 'provider-chip'}
            onClick={() => props.onSelectProvider(provider.id)}
          >
            <strong>{provider.name}</strong>
            <span>{provider.kind}</span>
          </button>
        ))}
      </section>

      <section className="panel-card">
        <div className="panel-headline">
          <h2>Provider Settings</h2>
          <span>Balance: {props.balanceLabel}</span>
        </div>
        <div className="config-grid">
          <Field label="Provider Name">
            <input value={props.manifest.name} onChange={(event) => props.onManifestFieldChange('root', 'name', event.target.value)} />
          </Field>
          <Field label="Enabled">
            <label className="switch-row">
              <input
                type="checkbox"
                checked={props.manifest.enabled}
                onChange={(event) => props.onManifestFieldChange('root', 'enabled', event.target.checked)}
              />
              <span>{props.manifest.enabled ? 'Enabled' : 'Disabled'}</span>
            </label>
          </Field>
          <Field label="Default Service">
            <input value={props.manifest.defaults.service} onChange={(event) => props.onManifestFieldChange('defaults', 'service', event.target.value)} />
          </Field>
          <Field label="Default Country">
            <input value={props.manifest.defaults.country} onChange={(event) => props.onManifestFieldChange('defaults', 'country', event.target.value)} />
          </Field>
          <Field label="Primary Endpoint">
            <input
              value={String(props.manifest.handler_api?.base_url ?? props.manifest.five_sim?.base_url ?? '')}
              onChange={(event) => {
                if (props.manifest.handler_api) props.onManifestFieldChange('handler_api', 'base_url', event.target.value);
                if (props.manifest.five_sim) props.onManifestFieldChange('five_sim', 'base_url', event.target.value);
              }}
            />
          </Field>
          <Field label="Summary">
            <input value={props.summary?.description ?? props.manifest.description ?? ''} onChange={(event) => props.onManifestFieldChange('root', 'description', event.target.value)} />
          </Field>
        </div>
      </section>

      {props.showAdvancedEditor && (
        <section className="panel-card">
          <div className="panel-headline">
            <h2>Advanced Manifest</h2>
            <span>JSON source of truth</span>
          </div>
          <div className="advanced-editor">
            <textarea value={props.rawEditor} onChange={(event) => props.onRawChange(event.target.value)} />
          </div>
        </section>
      )}
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
          props.tickets.slice(0, 8).map((ticket) => (
            <article className="message-card" key={ticket.id}>
              <div className="message-card-top">
                <div>
                  <strong>{ticket.provider}</strong>
                  <p>{ticket.phone_number}</p>
                </div>
                <StatusBadge status={ticket.status} />
              </div>
              <div className="message-meta">
                <span>Service: {ticket.service}</span>
                <span>Country: {ticket.country}</span>
              </div>
              <div className="message-body">
                <div>
                  <label>Message</label>
                  <p>{ticket.message ?? 'Waiting for provider payload...'}</p>
                </div>
                <div>
                  <label>Code</label>
                  <p>{ticket.code ?? '—'}</p>
                </div>
              </div>
            </article>
          ))
        ) : (
          <div className="empty-state">当前没有 activations。等 provider 流量进入后，这里会按卡片流展示。</div>
        )}
      </div>
    </section>
  );
}

function StoreScreen(props: {
  providers: ProviderManifest[];
  selectedManifest?: ProviderManifest;
  selectedSummary?: ProviderSummary;
  search: string;
  onSearch: (value: string) => void;
  onSelect: (providerId: string) => void;
}) {
  return (
    <section className="store-shell">
      <aside className="store-pane">
        <div className="store-search">
          <label>Search Providers</label>
          <input value={props.search} onChange={(event) => props.onSearch(event.target.value)} placeholder="Search by id, name or description" />
        </div>
        <div className="store-list">
          {props.providers.map((provider) => (
            <button key={provider.id} className="store-list-item" onClick={() => props.onSelect(provider.id)}>
              <strong>{provider.name}</strong>
              <span>{provider.description ?? provider.kind}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="store-detail">
        {props.selectedManifest ? (
          <>
            <div className="screen-header">
              <div>
                <h1>{props.selectedManifest.name}</h1>
                <p>{props.selectedManifest.description ?? 'Provider detail view'}</p>
              </div>
              <StatusBadge status={props.selectedManifest.enabled ? 'Connected' : 'Standby'} />
            </div>

            <div className="provider-cards">
              <article className="provider-card">
                <div className="provider-card-head">
                  <div className="provider-glyph" />
                  <StatusBadge status={props.selectedManifest.kind} />
                </div>
                <h3>Protocol</h3>
                <p>{props.selectedSummary?.protocol ?? props.selectedManifest.kind}</p>
              </article>
              <article className="provider-card">
                <div className="provider-card-head">
                  <div className="provider-glyph" />
                  <StatusBadge status="Default Route" />
                </div>
                <h3>Default Route</h3>
                <p>{props.selectedManifest.defaults.service} · {props.selectedManifest.defaults.country}</p>
              </article>
              <article className="provider-card">
                <div className="provider-card-head">
                  <div className="provider-glyph" />
                  <StatusBadge status="Endpoint" />
                </div>
                <h3>Endpoint</h3>
                <p>{props.selectedSummary?.primary_endpoint ?? 'No endpoint configured'}</p>
              </article>
            </div>

            <section className="panel-card">
              <div className="panel-headline">
                <h2>Provider Details</h2>
                <span>Catalog detail pane</span>
              </div>
              <div className="details-stack">
                <div className="detail-row">
                  <span>Description</span>
                  <strong>{props.selectedManifest.description ?? 'No description'}</strong>
                </div>
                <div className="detail-row">
                  <span>Service Aliases</span>
                  <strong>{Object.keys(props.selectedManifest.service_aliases).length > 0 ? Object.entries(props.selectedManifest.service_aliases).map(([key, value]) => `${key} → ${value}`).join(', ') : 'No aliases configured'}</strong>
                </div>
                <div className="detail-row">
                  <span>Reuse Policy</span>
                  <strong>{props.selectedManifest.defaults.reuse_phone ? `Reuse up to ${props.selectedManifest.defaults.reuse_max} times` : 'Reuse disabled'}</strong>
                </div>
              </div>
            </section>
          </>
        ) : (
          <div className="empty-state">选择左侧 provider 查看详情。</div>
        )}
      </section>
    </section>
  );
}

function WalletScreen(props: {
  selectedProvider: string;
  balanceLabel: string;
  logs: LogEntry[];
  onFetchBalance: () => void;
  isBusy: boolean;
}) {
  return (
    <section className="screen-stack">
      <div className="screen-header">
        <div>
          <h1>Current Balance</h1>
          <p>Track internal protocol provider balance snapshots and runtime events.</p>
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
          <strong>{props.selectedProvider}</strong>
        </div>
        <div>
          <span>Current Balance</span>
          <strong>{props.balanceLabel}</strong>
        </div>
      </section>
      <section className="panel-card">
        <div className="panel-headline">
          <h2>Transaction History</h2>
          <span>{props.logs.length} log entries</span>
        </div>
        <div className="table-grid">
          <div className="table-row head four-col">
            <span>Time</span>
            <span>Scope</span>
            <span>Message</span>
            <span>Level</span>
          </div>
          {props.logs.slice(0, 8).map((entry, index) => (
            <div className="table-row four-col" key={`${entry.timestamp}-${index}`}>
              <span>{new Date(entry.timestamp).toLocaleString()}</span>
              <span>{entry.scope}</span>
              <span>{entry.message}</span>
              <span>{entry.level}</span>
            </div>
          ))}
          {props.logs.length === 0 && <div className="empty-state">当前还没有账务或运行记录。</div>}
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
          <ToggleSetting title="Advanced Manifest Editor" description="Show full manifest JSON editor." checked={props.showAdvancedEditor} onChange={props.setShowAdvancedEditor} />
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
