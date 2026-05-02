import {
  useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import {
  Bell, Bot, ChevronLeft, ChevronsUpDown, Copy, GripVertical, LayoutDashboard,
  Loader2, MessageSquare, Minus, PanelLeft, Plus, Search, Send, Server, Settings,
  Shield, ShoppingCart, Sliders, Smartphone, Square, Terminal, User, Wallet, X,
} from 'lucide-react';
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
  ProviderManifest,
  ProviderPriceItem,
  ProviderSectionId,
  ProviderSummary,
  RoutingStrategy,
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
import { useActivationFlow } from './hooks/useActivationFlow';
import { useConsoleDataState } from './hooks/useConsoleDataState';
import { useProviderRuntime } from './hooks/useProviderRuntime';
import { useConsoleUiState } from './hooks/useConsoleUiState';
import { useSelectorFlow } from './hooks/useSelectorFlow';
import {
  API_BASE,
  SOCKET_PATH,
} from './services/runtimeApi';
import { windowAction } from './services/windowApi';

type SidebarItem = { id: ScreenId; label: string; Icon: typeof LayoutDashboard };

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
  const {
    visibleProviders,
    orderedProviders,
    selectedManifest,
    selectedSummary,
    selectedOptions,
    selectedStoreQuery,
    sortedPrices,
    loadSnapshot,
    loadManifests,
    loadProviderOptions,
    loadNotifications,
    loadRuntimeSettings,
    updateManifestField,
    saveProvider,
    reloadProviders,
    updateRuntimeSettings,
    fetchBalance,
    fetchPrices,
    updateStoreQuery,
    reorderProviders,
    setApiKey,
    apiKeyValue,
  } = useProviderRuntime(
    {
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
    },
    {
      selectedProvider,
      setSelectedProvider,
      setActivationForm,
      setStatusMessage,
      setBusyAction,
      setShowManifestModal,
    },
  );

  const {
    pollTicket,
    releaseTicket,
    copyToClipboard,
    submitActivation,
    primeActivationFromTicket,
    closeActivationModal,
    updateActivationField,
  } = useActivationFlow(
    {
      activationForm,
      setActivationForm,
      activationBusy,
      setActivationBusy,
      activationError,
      setActivationError,
      showActivationModal,
      setShowActivationModal,
      busyAction,
      setBusyAction,
      setStatusMessage,
    },
    {
      loadSnapshot,
      loadNotifications,
    },
  );

  const {
    openSelector,
    applySelectorOption,
  } = useSelectorFlow(
    {
      selectorState,
      setSelectorState,
      setSelectorSearch,
      activationForm,
      setActivationForm,
      selectedProvider,
    },
    {
      selectedOptions,
      visibleProviders,
      providerOptions,
      updateManifestField,
      updateStoreQuery,
    },
  );

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

  const filteredSelectorOptions = useMemo(() => {
    if (!selectorState) return [];
    if (!selectorSearch.trim()) return selectorState.options;
    const term = selectorSearch.toLowerCase();
    return selectorState.options.filter((option) =>
      [option.label, option.value, option.hint].some((value) => value.toLowerCase().includes(term)),
    );
  }, [selectorSearch, selectorState]);

  function markNotificationsRead() {
    setNotificationCursor(notifications.length);
    setStatusMessage('Notifications marked as read.');
  }

  async function handleWindowAction(action: 'minimize' | 'maximize_toggle' | 'close') {
    try {
      await windowAction(action);
    } catch (error) {
      setStatusMessage(`Window action failed: ${String(error)}`);
    }
  }

  const toolbarTitle = activeScreen === 'providers' && providerView === 'workspace'
    ? `Providers › ${manifests[selectedProvider]?.name ?? selectedProvider}`
    : NAV_ITEMS.find((item) => item.id === activeScreen)?.label ?? '';

  return (
    <div className={cx(`app-root${compactTables ? ' compact' : ''}`)}>
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
                  primeActivationFromTicket(ticket);
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
          onChange={updateActivationField}
          onClose={closeActivationModal}
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
