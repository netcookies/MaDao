import { startTransition, useEffect, useState } from 'react';

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

const API_BASE = 'http://127.0.0.1:7822';

export function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [manifests, setManifests] = useState<Record<string, ProviderManifest>>({});
  const [rawEditors, setRawEditors] = useState<Record<string, string>>({});
  const [selectedProvider, setSelectedProvider] = useState<string>('mock');
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [pricePanels, setPricePanels] = useState<Record<string, ProviderPriceResponse>>({});
  const [statusMessage, setStatusMessage] = useState<string>('准备就绪');
  const [busyAction, setBusyAction] = useState<string>('');

  useEffect(() => {
    void Promise.all([loadSnapshot(), loadManifests()]);
    const timer = window.setInterval(() => void loadSnapshot(), 4000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const ids = Object.keys(manifests);
    if (ids.length > 0 && !manifests[selectedProvider]) {
      setSelectedProvider(ids[0]);
    }
  }, [manifests, selectedProvider]);

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
        if (target) {
          target[field] = value;
        }
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

  function syncRawEditor(providerId: string) {
    const manifest = manifests[providerId];
    if (!manifest) return;
    setRawEditors((current) => ({
        ...current,
      [providerId]: JSON.stringify(manifest, null, 2),
    }));
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
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(manifest),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
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
      if (!response.ok) {
        throw new Error(await response.text());
      }
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
      if (!response.ok) {
        throw new Error(await response.text());
      }
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
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider: providerId,
          service: manifest.defaults.service,
        }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
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

  const selectedManifest = manifests[selectedProvider];
  const selectedPrices = pricePanels[selectedProvider];

  return (
    <main className="apple-shell">
      <header className="global-nav">
        <span>MaDao</span>
        <span>Protocol Console</span>
        <span>Rust + Tauri 2</span>
      </header>

      <section className="hero-tile light">
        <div className="hero-copy">
          <p className="eyebrow">Internal Protocol Compatibility</p>
          <h1>通知与 OTP 协议兼容控制台</h1>
          <p className="hero-lead">
            为团队内部自建平台兼容 `HeroSMS / SmsBower / 5SIM` 三种协议。统一模型、统一热重载、统一桌面观测。
          </p>
          <div className="hero-actions">
            <button className="button-primary" onClick={() => void reloadProviders()} disabled={busyAction === 'reload'}>
              重新加载 Provider
            </button>
            <button className="button-secondary" onClick={() => void loadManifests()}>
              刷新配置
            </button>
          </div>
        </div>
        <aside className="hero-stats">
          <StatCard label="已加载 Provider" value={String(snapshot?.providers.length ?? 0)} />
          <StatCard label="活动会话" value={String(snapshot?.tickets.length ?? 0)} />
          <StatCard label="运行日志" value={String(snapshot?.logs.length ?? 0)} />
          <p className="status-inline">{statusMessage}</p>
        </aside>
      </section>

      <section className="sub-nav">
        {Object.values(manifests).map((manifest) => (
          <button
            key={manifest.id}
            className={selectedProvider === manifest.id ? 'chip selected' : 'chip'}
            onClick={() => setSelectedProvider(manifest.id)}
          >
            {manifest.name}
          </button>
        ))}
      </section>

      <section className="dashboard-grid">
        <article className="product-tile light">
          <div className="section-head">
            <div>
              <p className="section-label">Provider Manifest</p>
              <h2>{selectedManifest?.name ?? '选择一个 Provider'}</h2>
            </div>
            <div className="section-actions">
              <button
                className="button-secondary"
                onClick={() => selectedProvider && void fetchBalance(selectedProvider)}
                disabled={!selectedManifest || busyAction === `balance-${selectedProvider}`}
              >
                查询余额
              </button>
              <button
                className="button-secondary"
                onClick={() => selectedProvider && void fetchPrices(selectedProvider)}
                disabled={!selectedManifest || busyAction === `prices-${selectedProvider}`}
              >
                价格库存
              </button>
              <button
                className="button-primary"
                onClick={() => selectedProvider && void saveProvider(selectedProvider)}
                disabled={!selectedManifest || busyAction === `save-${selectedProvider}`}
              >
                保存并热重载
              </button>
            </div>
          </div>

          {selectedManifest && (
            <div className="editor-layout">
              <div className="form-column">
                <div className="field-grid">
                  <FormField label="Provider Name">
                    <input
                      value={selectedManifest.name}
                      onChange={(event) => updateManifestField(selectedProvider, 'root', 'name', event.target.value)}
                      onBlur={() => syncRawEditor(selectedProvider)}
                    />
                  </FormField>
                  <FormField label="Enabled">
                    <label className="toggle-line">
                      <input
                        type="checkbox"
                        checked={selectedManifest.enabled}
                        onChange={(event) =>
                          updateManifestField(selectedProvider, 'root', 'enabled', event.target.checked)
                        }
                        onBlur={() => syncRawEditor(selectedProvider)}
                      />
                      <span>{selectedManifest.enabled ? '启用' : '停用'}</span>
                    </label>
                  </FormField>
                  <FormField label="Default Service">
                    <input
                      value={selectedManifest.defaults.service}
                      onChange={(event) =>
                        updateManifestField(selectedProvider, 'defaults', 'service', event.target.value)
                      }
                      onBlur={() => syncRawEditor(selectedProvider)}
                    />
                  </FormField>
                  <FormField label="Default Country">
                    <input
                      value={selectedManifest.defaults.country}
                      onChange={(event) =>
                        updateManifestField(selectedProvider, 'defaults', 'country', event.target.value)
                      }
                      onBlur={() => syncRawEditor(selectedProvider)}
                    />
                  </FormField>
                  <FormField label="Max Price">
                    <input
                      type="number"
                      value={selectedManifest.defaults.max_price}
                      onChange={(event) =>
                        updateManifestField(selectedProvider, 'defaults', 'max_price', Number(event.target.value))
                      }
                      onBlur={() => syncRawEditor(selectedProvider)}
                    />
                  </FormField>
                  <FormField label="Min Balance">
                    <input
                      type="number"
                      value={selectedManifest.defaults.min_balance}
                      onChange={(event) =>
                        updateManifestField(selectedProvider, 'defaults', 'min_balance', Number(event.target.value))
                      }
                      onBlur={() => syncRawEditor(selectedProvider)}
                    />
                  </FormField>
                  <FormField label="Poll Timeout">
                    <input
                      type="number"
                      value={selectedManifest.defaults.poll_timeout_sec}
                      onChange={(event) =>
                        updateManifestField(
                          selectedProvider,
                          'defaults',
                          'poll_timeout_sec',
                          Number(event.target.value),
                        )
                      }
                      onBlur={() => syncRawEditor(selectedProvider)}
                    />
                  </FormField>
                  <FormField label="Protocol Endpoint">
                    <input
                      value={
                        String(
                          selectedManifest.handler_api?.base_url ??
                            selectedManifest.five_sim?.base_url ??
                            '',
                        )
                      }
                      onChange={(event) => {
                        if (selectedManifest.handler_api) {
                          updateManifestField(selectedProvider, 'handler_api', 'base_url', event.target.value);
                        }
                        if (selectedManifest.five_sim) {
                          updateManifestField(selectedProvider, 'five_sim', 'base_url', event.target.value);
                        }
                      }}
                      onBlur={() => syncRawEditor(selectedProvider)}
                    />
                  </FormField>
                </div>

                <div className="meta-ribbon">
                  <span>Protocol: {selectedManifest.kind}</span>
                  <span>Balance: {balances[selectedProvider] ?? '未查询'}</span>
                  <span>Primary endpoint: {snapshot?.providers.find((item) => item.id === selectedProvider)?.primary_endpoint ?? 'n/a'}</span>
                </div>
              </div>

              <div className="json-column">
                <label className="raw-label">Advanced Protocol Manifest</label>
                <textarea
                  value={rawEditors[selectedProvider] ?? ''}
                  onChange={(event) =>
                    setRawEditors((current) => ({
                      ...current,
                      [selectedProvider]: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
          )}
        </article>

        <article className="product-tile dark">
          <div className="section-head dark-head">
            <div>
              <p className="section-label">Runtime</p>
              <h2>统一接口与运行时快照</h2>
            </div>
          </div>
          <div className="endpoint-board">
            <EndpointRow method="GET" path="/api/providers" desc="Runtime snapshot" />
            <EndpointRow method="GET" path="/api/provider-manifests" desc="Manifest list" />
            <EndpointRow method="PUT" path="/api/providers/{id}/manifest" desc="Save manifest" />
            <EndpointRow method="POST" path="/api/provider-manifests/reload" desc="Hot reload providers" />
            <EndpointRow method="GET" path="/api/providers/{id}/balance" desc="Balance query" />
            <EndpointRow method="POST" path="/api/providers/{id}/prices" desc="Price and stock panel" />
            <EndpointRow method="SOCK" path="/tmp/madao-sms.sock" desc="Structured local command transport" />
          </div>
        </article>

        <article className="product-tile parchment">
          <div className="section-head">
            <div>
              <p className="section-label">Inventory</p>
              <h2>价格与库存面板</h2>
            </div>
          </div>
          {selectedPrices ? (
            <div className="price-table">
              <div className="price-head">
                <span>国家/区域</span>
                <span>单价</span>
                <span>库存</span>
              </div>
              {selectedPrices.items.slice(0, 10).map((item) => (
                <div className="price-row" key={`${item.country}-${item.display_name}`}>
                  <span>{item.display_name}</span>
                  <span>${item.price.toFixed(3)}</span>
                  <span>{item.stock}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-copy">点击“价格库存”后展示当前协议兼容 provider 的价格面板。</div>
          )}
        </article>

        <article className="product-tile light">
          <div className="section-head">
            <div>
              <p className="section-label">Sessions</p>
              <h2>活动号码会话</h2>
            </div>
          </div>
          <div className="ticket-table">
            <div className="ticket-head">
              <span>Provider</span>
              <span>号码</span>
              <span>服务</span>
              <span>状态</span>
            </div>
            {(snapshot?.tickets ?? []).map((ticket) => (
              <div className="ticket-row" key={ticket.id}>
                <span>{ticket.provider}</span>
                <span>{ticket.phone_number}</span>
                <span>{ticket.service}</span>
                <span>{ticket.status}</span>
              </div>
            ))}
            {(snapshot?.tickets ?? []).length === 0 && <div className="empty-copy">暂无活动号码会话。</div>}
          </div>
        </article>

        <article className="product-tile dark secondary">
          <div className="section-head dark-head">
            <div>
              <p className="section-label">Logs</p>
              <h2>运行日志</h2>
            </div>
          </div>
          <div className="log-board">
            {(snapshot?.logs ?? []).length === 0 ? (
              <div className="empty-copy dark-copy">等待服务启动并写入日志。</div>
            ) : (
              (snapshot?.logs ?? []).map((entry, index) => (
                <div className="log-row" key={`${entry.timestamp}-${index}`}>
                  <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                  <strong>{entry.scope}</strong>
                  <p>{entry.message}</p>
                </div>
              ))
            )}
          </div>
        </article>
      </section>
    </main>
  );
}

function StatCard(props: { label: string; value: string }) {
  return (
    <div className="stat-card">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function FormField(props: { label: string; children: React.ReactNode }) {
  return (
    <label className="form-field">
      <span>{props.label}</span>
      {props.children}
    </label>
  );
}

function EndpointRow(props: { method: string; path: string; desc: string }) {
  return (
    <div className="endpoint-row">
      <span className="endpoint-method">{props.method}</span>
      <code>{props.path}</code>
      <p>{props.desc}</p>
    </div>
  );
}
