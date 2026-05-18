import {
  useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bell, Bot, ChevronLeft, Copy, LayoutDashboard,
  Loader2, MessageSquare, Plus, Search, Send, Server, Settings,
  Shield, ShoppingCart, Shuffle, Sliders, Smartphone, Square, Terminal, User, Wallet, X, LogOut,
} from 'lucide-react';
import {
  AppShell,
  AppSidebar,
  AppToolbar,
} from './components/composites';
import { NotificationPopover, Snackbar, type SnackbarTone } from './components/overlays';
import type { NotificationItem } from './components/overlays/NotificationPopover/NotificationPopover';
import { IconButton } from './components/primitives';
import {
  AppButton,
  ConfigRow,
  DataTable,
  DetailRow,
  SearchField,
} from './app/ui-bridge';
import { MessagesScreen } from './app/messages/MessagesScreen';
import { LanguageProvider } from './app/language';
import { NewActivationModal } from './app/overlays/NewActivationModal';
import { ManifestModal } from './app/overlays/ManifestModal';
import { SearchSelectorModal } from './app/overlays/SearchSelectorModal';
import { HttpLoginScreen } from './app/auth/HttpLoginScreen';
import { OverviewScreen } from './app/overview/OverviewScreen';
import { ProviderWorkspaceScreen } from './app/providers/ProviderWorkspaceScreen';
import { ProvidersListScreen } from './app/providers/ProvidersListScreen';
import { RoutingScreen } from './app/routing/RoutingScreen';
import type { RoutingItemEditorState } from './app/routing/RoutingScreen';
import {
  ANY_PROVIDER_VALUE,
  type ActivationFormState,
  type OptionCatalog,
  type OptionItem,
  type PriceSortKey,
  type ProviderManifest,
  type ProviderPriceItem,
  type ProviderSectionId,
  type ProviderSummary,
  type RoutingPlan,
  type RoutingPlanItem,
    type RoutingPlanFilter,
    type RoutingStrategy,
    type ScreenId,
    type SelectorKind,
    type SelectorOptionViewModel,
  type SelectorState,
    type Snapshot,
    type StoreQueryState,
    type TicketDecoration,
    type TicketRecord,
    type UpdateCheckResult,
  type AppearanceTheme,
  type LanguageCode,
  type LogFilter,
  type MessageFilter,
} from './app/types';
import { LogsScreen } from './app/logs/LogsScreen';
import { SettingsScreen } from './app/settings/SettingsScreen';
import {
  formatCountryLabel,
  formatProviderLabel,
  formatRelativeTime,
  formatScopeLabel,
  formatServiceLabel,
  getTicketPhase,
} from './lib/formatters';
import {
  buildOptionCatalog,
  filterCatalogItems,
  formatOperatorLabel,
} from './app/utils';
import {
  selectorOptionFromCatalogItem,
  selectorOptionFromOptionItem,
  selectorOptionFromProvider,
} from './app/selectorViewModel';
import { cx } from './lib/cx';
import { useActivationFlow } from './hooks/useActivationFlow';
import { useConsoleDataState } from './hooks/useConsoleDataState';
import { useProviderRuntime } from './hooks/useProviderRuntime';
import { useConsoleUiState } from './hooks/useConsoleUiState';
import { useSelectorFlow } from './hooks/useSelectorFlow';
import {
  API_BASE,
  IS_DESKTOP_RUNTIME,
  IS_WEB_RUNTIME,
  SOCKET_PATH,
  checkForUpdates,
  clearNotifications,
  deleteRoutingPlan,
  fetchRoutingPlans,
  fetchProviderOperators,
  fetchProviderPrices,
  fetchHttpAuthStatus,
  loginHttpAccess,
  logoutHttpAccess,
  saveRoutingPlan,
} from './services/runtimeApi';
import { getAppConfigDirectory, openAppConfigDirectory } from './services/appConfigApi';
import { openExternalUrl, windowAction } from './services/windowApi';
import { listenMenuCommand } from './services/menuBarApi';
import { i18n } from './app/i18n';
import { formatProviderErrorMessage } from './app/providerErrors';

type SidebarItem = { id: ScreenId; label: string; Icon: typeof LayoutDashboard };

const SUCCESS_STATUS_KEYWORDS = [
  'saved',
  'created',
  'copied',
  'moved',
  'deleted',
  'loaded',
  'enabled',
  'disabled',
  'refreshed',
  'reloaded',
];

const STATUS_NOTIFICATION_LIMIT = 200;

function getStatusLevel(message: string): 'info' | 'warn' | 'error' {
  const normalized = message.toLowerCase();
  if (normalized.includes('failed') || normalized.includes('error') || normalized.includes('cannot')) {
    return 'error';
  }
  if (
    normalized.includes('warning')
    || normalized.includes('denied')
    || normalized.includes('required')
    || normalized.includes('invalid')
  ) {
    return 'warn';
  }
  return 'info';
}

function getSnackbarTone(message: string): SnackbarTone {
  const normalized = message.toLowerCase();
  if (normalized.includes('failed') || normalized.includes('error') || normalized.includes('cannot')) {
    return 'danger';
  }
  if (
    normalized.includes('warning')
    || normalized.includes('denied')
    || normalized.includes('required')
    || normalized.includes('invalid')
  ) {
    return 'warning';
  }
  if (SUCCESS_STATUS_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return 'success';
  }
  return 'info';
}

export function App() {
  const { t } = useTranslation();
  const [configDirectory, setConfigDirectory] = useState(IS_DESKTOP_RUNTIME ? 'Loading…' : 'Unavailable');
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [statusSequence, setStatusSequence] = useState(0);
  const [updateCheckBusy, setUpdateCheckBusy] = useState(false);
  const [runtimeSettingsLoaded, setRuntimeSettingsLoaded] = useState(false);
  const [updateCheckResult, setUpdateCheckResult] = useState<UpdateCheckResult | null>(null);
  const [runtimeAccessInfo, setRuntimeAccessInfo] = useState({
    http_port: 7822,
    http_secret_overridden: false,
    requires_http_login: true,
  });
  const [httpSecretInput, setHttpSecretInput] = useState('');
  const [httpAuthBusy, setHttpAuthBusy] = useState(false);
  const [httpAuthReady, setHttpAuthReady] = useState(IS_DESKTOP_RUNTIME);
  const [httpAuthenticated, setHttpAuthenticated] = useState(IS_DESKTOP_RUNTIME);
  const [httpAuthError, setHttpAuthError] = useState('');
  const hasAutoCheckedUpdatesRef = useRef(false);
  const notificationsPopoverRef = useRef<HTMLDivElement | null>(null);
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
    optionCacheOverview,
    setOptionCacheOverview,
    providerOptions,
    setProviderOptions,
    storeQueries,
    setStoreQueries,
    routingPlans,
    setRoutingPlans,
  } = useConsoleDataState();
  const {
    selectedProvider,
    setSelectedProvider,
    statusMessage,
    setStatusMessage: setStatusMessageState,
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
    sidebarCollapsed,
    setSidebarCollapsed,
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
  const translate = i18n.getFixedT(language);
  const formatError = (error: unknown) => formatProviderErrorMessage(error, language);
  const navItems: SidebarItem[] = [
    { id: 'overview', label: t('Overview'), Icon: LayoutDashboard },
    { id: 'providers', label: t('Providers'), Icon: Server },
    { id: 'routing', label: t('Routing'), Icon: Shuffle },
    { id: 'messages', label: t('Messages'), Icon: MessageSquare },
    { id: 'settings', label: t('Settings'), Icon: Settings },
    { id: 'logs', label: t('Logs'), Icon: Terminal },
  ];
  const messageFilters: Array<{ id: MessageFilter; label: string }> = [
    { id: 'all', label: t('All') },
    { id: 'received', label: t('Received') },
    { id: 'waiting', label: t('Pending') },
    { id: 'failed', label: t('Failed') },
  ];
  const logFilters: Array<{ id: LogFilter; label: string }> = [
    { id: 'all', label: t('All') },
    { id: 'info', label: t('Info') },
    { id: 'warn', label: t('Warn') },
    { id: 'error', label: t('Error') },
  ];
  const anyRouteCountryOption: OptionItem = {
    value: '',
    label: t('Any country'),
    hint: t('Allow the provider to auto pick country'),
  };
  const anyRouteOperatorOption: OptionItem = {
    value: '',
    label: t('Any carrier'),
    hint: t('Allow any operator for this provider'),
  };
  const anyProviderOption: OptionItem = {
    value: ANY_PROVIDER_VALUE,
    label: t('Any provider'),
    hint: t('Expand this candidate across all enabled providers'),
  };

  function dedupeSelectorOptions(options: SelectorOptionViewModel[]) {
    const seen = new Set<string>();
    return options.filter((option) => {
      const normalizedValue = option.commitValue.trim().toLowerCase();
      const key = normalizedValue === 'any' ? '' : normalizedValue;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function pushStatusMessage(message: string) {
    setStatusMessageState(message);
    setStatusSequence((current) => current + 1);
    setNotifications((current) => {
      const droppedCount = Math.max(0, current.length + 1 - STATUS_NOTIFICATION_LIMIT);
      if (droppedCount > 0) {
        setNotificationCursor((cursor) => Math.max(0, cursor - droppedCount));
      }
      return [
        ...current.slice(-(STATUS_NOTIFICATION_LIMIT - 1)),
        {
          timestamp: new Date().toISOString(),
          scope: 'status',
          level: getStatusLevel(message),
          message,
        },
      ];
    });
  }

  async function handleCheckForUpdates(source: 'manual' | 'startup' = 'manual') {
    try {
      if (source === 'manual') {
        setBusyAction('check-updates');
      }
      setUpdateCheckBusy(true);
      const result = await checkForUpdates(__APP_VERSION__);
      setUpdateCheckResult(result);
      if (result.has_update) {
        pushStatusMessage(translate('update_available', {
          latest: result.latest_version,
          current: result.current_version,
        }));
      } else if (source === 'manual') {
        pushStatusMessage(translate('already_latest_version', {
          current: result.current_version,
        }));
      }
    } catch (error) {
      setUpdateCheckResult(null);
      if (source === 'manual') {
        pushStatusMessage(translate('failed_check_updates', { error: formatError(error) }));
      }
    } finally {
      setUpdateCheckBusy(false);
      if (source === 'manual') {
        setBusyAction('');
      }
    }
  }

  const snackbarTone = useMemo(() => getSnackbarTone(statusMessage), [statusMessage]);
  const {
    visibleProviders,
    manageableProviders,
    orderedProviders,
    selectedManifest,
    selectedSummary,
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
    reloadRuntimeAccessInfo,
    refreshHttpSecret,
    fetchBalance,
    fetchVisibleBalances,
    refreshProvider,
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
      optionCacheOverview,
      setOptionCacheOverview,
      providerOptions,
      setProviderOptions,
      storeQueries,
      setStoreQueries,
    },
    {
      selectedProvider,
      setSelectedProvider,
      setActivationForm,
      setStatusMessage: pushStatusMessage,
      setBusyAction,
      setShowManifestModal,
      language,
    },
  );
  const visibleProviderIds = useMemo(
    () => visibleProviders.map((provider) => provider.id).join('|'),
    [visibleProviders],
  );
  const operatorSelectableProviderIds = useMemo(
    () => new Set(
      visibleProviders
        .filter((provider) => provider.behavior?.operator_selectable !== false)
        .map((provider) => provider.id),
    ),
    [visibleProviders],
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
      setStatusMessage: pushStatusMessage,
      setMessageFilter,
      language,
    },
    {
      loadSnapshot,
      refreshBalancesAfterAcquire: async (providerId?: string) => {
        await fetchVisibleBalances(providerId ? [providerId] : undefined);
      },
    },
  );

  const optionCatalog = useMemo<OptionCatalog>(
    () => buildOptionCatalog(providerOptions, pricePanels),
    [providerOptions, pricePanels],
  );
  const manifestsById = manifests;

  const {
    openSelector,
    applySelectorOption,
  } = useSelectorFlow(
    {
      selectorState,
      setSelectorState,
      setSelectorSearch,
      activationForm,
      storeQuery: selectedStoreQuery,
      setActivationForm,
      selectedProvider,
      language,
    },
    {
      selectedOptions,
      visibleProviders,
      providerOptions,
      optionCatalog,
      setProviderOptions,
      updateManifestField,
      updateStoreQuery,
    },
  );

  useEffect(() => {
    void Promise.all([loadSnapshot(), loadManifests(), loadRuntimeSettings(), loadRoutingPlans()])
      .finally(() => setRuntimeSettingsLoaded(true));
  }, []);

  useEffect(() => {
    void reloadRuntimeAccessInfo().then((info) => {
      if (info) setRuntimeAccessInfo(info);
    });
  }, []);

  useEffect(() => {
    if (!IS_WEB_RUNTIME) return;
    void fetchHttpAuthStatus()
      .then((status) => {
        setHttpAuthenticated(status.authenticated);
      })
      .catch(() => {
        setHttpAuthenticated(false);
      })
      .finally(() => setHttpAuthReady(true));
  }, []);

  useEffect(() => {
    if (!runtimeSettingsLoaded) return;
    if (hasAutoCheckedUpdatesRef.current) return;
    if (!runtimeSettings.check_updates_on_launch) return;
    hasAutoCheckedUpdatesRef.current = true;
    void handleCheckForUpdates('startup');
  }, [runtimeSettings.check_updates_on_launch, runtimeSettingsLoaded]);

  useEffect(() => {
    void getAppConfigDirectory()
      .then(setConfigDirectory)
      .catch(() => setConfigDirectory('Unavailable'));
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => {
      void loadSnapshot();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [autoRefresh]);

  useEffect(() => {
    if (activeScreen !== 'providers' || providerView !== 'list') return;
    void fetchVisibleBalances();
  }, [activeScreen, providerView, visibleProviderIds]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = appearanceTheme;
    root.dataset.language = language;
    window.localStorage.setItem('madao-theme', appearanceTheme);
    window.localStorage.setItem('madao-language', language);
  }, [appearanceTheme, language]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    function handleMenuCommand(payload: Parameters<Parameters<typeof listenMenuCommand>[0]>[0]) {
      if (payload.kind === 'new_activation') {
        openActivationModal();
        return;
      }

      if (payload.kind === 'open_screen') {
        setActiveScreen(payload.screen);
        if (payload.screen === 'providers') {
          setProviderView('list');
        }
        setShowNotifications(false);
        return;
      }

      setSelectedProvider(payload.provider_id);
      setActiveScreen('providers');
      setProviderView('workspace');
      setActiveProviderSection(payload.section);
      setShowNotifications(false);
    }

    void listenMenuCommand(handleMenuCommand).then((nextUnlisten) => {
      if (disposed) {
        nextUnlisten();
        return;
      }
      unlisten = nextUnlisten;
    }).catch(() => {});

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (orderedProviders.length === 0) return;
    if (!orderedProviders.some((provider) => provider.id === selectedProvider)) {
      setSelectedProvider(orderedProviders[0].id);
    }
  }, [orderedProviders, selectedProvider]);

  useEffect(() => {
    if (!statusMessage || statusMessage === 'Ready.') {
      setSnackbarOpen(false);
      return undefined;
    }
    setSnackbarOpen(true);
    const timeoutMs = snackbarTone === 'danger' ? 5600 : snackbarTone === 'warning' ? 4600 : 3200;
    const timer = window.setTimeout(() => {
      setSnackbarOpen(false);
    }, timeoutMs);
    return () => window.clearTimeout(timer);
  }, [snackbarTone, statusMessage, statusSequence]);

  useEffect(() => {
    if (!activationForm.provider) return;
    if (activationForm.provider === ANY_PROVIDER_VALUE) return;
    if (visibleProviders.some((provider) => provider.id === activationForm.provider)) return;
    setActivationForm((current) => ({
      ...current,
      provider: '',
    }));
  }, [activationForm.provider, visibleProviders, setActivationForm]);

  const filteredMessages = useMemo(() => {
    const tickets = (snapshot?.tickets ?? []).filter((ticket) => ticket.provider !== 'mock');
    if (messageFilter === 'all') return tickets;
    return tickets.filter((ticket) => getTicketPhase(ticket.status) === messageFilter);
  }, [snapshot, messageFilter]);

  const filteredLogs = useMemo(() => {
    const logs = [...(snapshot?.logs ?? []), ...notifications];
    return logs.filter((entry) => {
      if (logsFilter !== 'all' && entry.level.toLowerCase() !== logsFilter) return false;
      if (!logsSearch.trim()) return true;
      const term = logsSearch.trim().toLowerCase();
      return [entry.scope, entry.level, entry.message].some((value) => value.toLowerCase().includes(term));
    });
  }, [logsFilter, logsSearch, notifications, snapshot]);

  const waitingTicketIds = useMemo(() => (
    (snapshot?.tickets ?? [])
      .filter((ticket) => ticket.provider !== 'mock')
      .filter((ticket) => getTicketPhase(ticket.status) === 'waiting')
      .map((ticket) => ticket.id)
  ), [snapshot]);

  useEffect(() => {
    if (waitingTicketIds.length === 0) return undefined;
    const timer = window.setInterval(() => {
      waitingTicketIds.forEach((ticketId) => {
        void pollTicket(ticketId, { silent: true });
      });
    }, 8000);
    return () => window.clearInterval(timer);
  }, [pollTicket, waitingTicketIds]);

  useEffect(() => {
    if (!showNotifications) return undefined;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (notificationsPopoverRef.current?.contains(target)) return;
      setShowNotifications(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setShowNotifications(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [setShowNotifications, showNotifications]);

  async function handleClearLogs() {
    try {
      const feed = await clearNotifications();
      setNotifications(feed.items.filter((entry) => !(
        entry.scope === 'http' && entry.message.includes('POST /api/notifications -> 200')
      )));
      setLogsSearch('');
      pushStatusMessage(translate('logs_cleared'));
    } catch (error) {
      pushStatusMessage(translate('failed_clear_logs', { error: formatError(error) }));
    }
  }

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
    const tickets = (snapshot?.tickets ?? [])
      .filter((ticket) => ticket.provider !== 'mock')
      .sort((left, right) => {
        const leftTime = new Date(left.updated_at ?? left.created_at ?? 0).getTime();
        const rightTime = new Date(right.updated_at ?? right.created_at ?? 0).getTime();
        return rightTime - leftTime;
      });
    return tickets.slice(0, 6);
  }, [snapshot]);

  const ticketDecorations = useMemo<Record<string, TicketDecoration>>(() => {
    const next: Record<string, TicketDecoration> = {};
    const sharedServiceIcons = new Map<string, string>();
    for (const item of optionCatalog.services) {
      const firstProviderWithIcon = item.providers.find((providerId) => item.provider_icon_urls?.[providerId]);
      const iconUrl = firstProviderWithIcon
        ? item.provider_icon_urls?.[firstProviderWithIcon]
        : item.icon_url;
      if (iconUrl && !sharedServiceIcons.has(item.value)) {
        sharedServiceIcons.set(item.value, iconUrl);
      }
    }
    for (const ticket of snapshot?.tickets ?? []) {
      const providerOptionSet = providerOptions[ticket.provider];
      const serviceOption = providerOptionSet?.services.find((item) => item.value === ticket.service);
      const countryOption = providerOptionSet?.countries.find((item) => item.value === ticket.country);
      next[ticket.id] = {
        service_icon_url: serviceOption?.icon_url
          ?? serviceOption?.provider_icon_url
          ?? sharedServiceIcons.get(ticket.service)
          ?? null,
        country_icon_url: countryOption?.icon_url ?? countryOption?.provider_icon_url ?? null,
      };
    }
    return next;
  }, [optionCatalog.services, providerOptions, snapshot?.tickets]);

  const filteredSelectorOptions = useMemo(() => {
    if (!selectorState) return [];
    if (!selectorSearch.trim()) return selectorState.options;
    const term = selectorSearch.toLowerCase();
    return selectorState.options.filter((option) =>
      option.searchableText.some((value) => value.toLowerCase().includes(term)),
    );
  }, [selectorSearch, selectorState]);

  const routingServiceOptions = useMemo(() => {
    const services = new Map<string, string>();
    Object.values(providerOptions).forEach((options) => {
      options.services.forEach((service) => {
        if (!services.has(service.value)) {
          services.set(service.value, service.label);
        }
      });
    });
    return [...services.entries()].map(([id, label]) => ({ id, label }));
  }, [providerOptions]);

  const sharedServiceIconUrls = useMemo<Record<string, string>>(() => {
    const next: Record<string, string> = {};
    optionCatalog.services.forEach((item) => {
      const firstProviderWithIcon = item.providers.find((providerId) => item.provider_icon_urls?.[providerId]);
      const iconUrl = firstProviderWithIcon
        ? item.provider_icon_urls?.[firstProviderWithIcon]
        : item.icon_url;
      if (iconUrl) {
        if (!next[item.value]) next[item.value] = iconUrl;
        Object.values(item.provider_values).forEach((providerValue) => {
          if (providerValue && !next[providerValue]) next[providerValue] = iconUrl;
        });
      }
    });
    return next;
  }, [optionCatalog.services]);

  const sharedCountryIconUrls = useMemo<Record<string, string>>(() => {
    const next: Record<string, string> = {};
    optionCatalog.countries.forEach((item) => {
      const firstProviderWithIcon = item.providers.find((providerId) => item.provider_icon_urls?.[providerId]);
      const iconUrl = firstProviderWithIcon
        ? item.provider_icon_urls?.[firstProviderWithIcon]
        : item.icon_url;
      if (iconUrl) {
        if (!next[item.value]) next[item.value] = iconUrl;
        Object.values(item.provider_values).forEach((providerValue) => {
          if (providerValue && !next[providerValue]) next[providerValue] = iconUrl;
        });
      }
    });
    return next;
  }, [optionCatalog.countries]);

  const [routingView, setRoutingView] = useState<'matrix' | 'detail'>('matrix');
  const [selectedRoutingPlanId, setSelectedRoutingPlanId] = useState('');
  const [routingFilter, setRoutingFilter] = useState<RoutingPlanFilter>('all');
  const [routingSearch, setRoutingSearch] = useState('');
  const [routingEditorState, setRoutingEditorState] = useState<{
    itemId: string;
    field: 'provider' | 'country' | 'operator' | 'price';
    providerId: string;
    source: 'row' | 'editor';
  } | null>(null);
  const [activationRoutingPlanPickerOpen, setActivationRoutingPlanPickerOpen] = useState(false);
  const [routingItemEditor, setRoutingItemEditor] = useState<RoutingItemEditorState | null>(null);
  const [routingItemPriceOptions, setRoutingItemPriceOptions] = useState<ProviderPriceItem[]>([]);
  const [routingItemPriceLoading, setRoutingItemPriceLoading] = useState(false);

  async function loadRoutingPlans() {
    try {
      const payload = await fetchRoutingPlans();
      setRoutingPlans(payload.plans);
      setSelectedRoutingPlanId((current) => current && payload.plans.some((plan) => plan.id === current)
        ? current
        : payload.plans[0]?.id || '');
    } catch (error) {
      pushStatusMessage(translate('failed_load_routing_plans', { error: formatError(error) }));
    }
  }

  function createDraftRoutingPlan(): RoutingPlan {
    const defaultProvider = visibleProviders[0];
    return {
      id: '',
      name: `Plan ${routingPlans.length + 1}`,
      service: defaultProvider?.defaults.service ?? '',
      description: '',
      enabled: true,
      execution_mode: 'sequential',
      execution_rounds: 1,
      items: defaultProvider ? [{
        id: `draft-item-${Date.now()}`,
        provider: defaultProvider.id,
        country: defaultProvider.defaults.country,
        operator: '',
        enabled: true,
        price_mode: 'any',
        min_price: null,
        max_price: null,
        fixed_price: null,
      }] : [],
    };
  }

  async function persistRoutingPlan(plan: RoutingPlan) {
    if (!plan.name.trim()) {
      pushStatusMessage(translate('routing_plan_name_required'));
      return;
    }
    if (!plan.service.trim()) {
      pushStatusMessage(translate('routing_plan_service_required'));
      return;
    }
    if (plan.items.length === 0) {
      pushStatusMessage(translate('routing_plan_items_required'));
      return;
    }
    if (plan.enabled && !plan.items.some((item) => item.enabled)) {
      pushStatusMessage(translate('routing_plan_enabled_items_required'));
      return;
    }
    try {
      setBusyAction('save-routing-plan');
      const saved = await saveRoutingPlan(plan);
      setRoutingPlans((current) => {
        if (!plan.id) {
          return [...current.filter((item) => item.id !== ''), saved];
        }
        const existing = current.find((item) => item.id === saved.id);
        if (existing) {
          return current.map((item) => item.id === saved.id ? saved : item);
        }
        return [...current, saved];
      });
      setSelectedRoutingPlanId(saved.id);
      setRoutingView('matrix');
      setRoutingEditorState(null);
      setRoutingItemEditor(null);
      setRoutingItemPriceOptions([]);
      setRoutingItemPriceLoading(false);
      pushStatusMessage(translate('saved_routing_plan', { name: saved.name }));
    } catch (error) {
      pushStatusMessage(translate('failed_save_routing_plan', { error: formatError(error) }));
    } finally {
      setBusyAction('');
    }
  }

  async function removeRoutingPlan(planId: string) {
    if (!planId) return;
    try {
      setBusyAction('delete-routing-plan');
      const payload = await deleteRoutingPlan(planId);
      setRoutingPlans(payload.plans);
      setSelectedRoutingPlanId(payload.plans[0]?.id ?? '');
      setRoutingView('matrix');
      setRoutingItemEditor(null);
      pushStatusMessage(translate('deleted_routing_plan', { plan: planId }));
    } catch (error) {
      pushStatusMessage(translate('failed_delete_routing_plan', { error: formatError(error) }));
    } finally {
      setBusyAction('');
    }
  }

  function updateRoutingPlanDraft(plan: RoutingPlan) {
    if (!plan.id) {
      setRoutingPlans((current) => {
        const draftIndex = current.findIndex((item) => item.id === '');
        if (draftIndex >= 0) {
          return current.map((item, index) => index === draftIndex ? plan : item);
        }
        return [...current, plan];
      });
      return;
    }
    setRoutingPlans((current) => current.map((item) => item.id === plan.id ? plan : item));
  }

  function selectedRoutingPlanMatcher(plan: RoutingPlan) {
    return plan.id === selectedRoutingPlanId || (!plan.id && selectedRoutingPlanId === '');
  }

  function openRoutingPlanDetail(planId: string) {
    setSelectedRoutingPlanId(planId);
    setRoutingView('detail');
    setActiveScreen('routing');
  }

  function closeRoutingPlanDetail() {
    setRoutingView('matrix');
    setRoutingItemEditor(null);
    setRoutingItemPriceOptions([]);
  }

  function createRoutingPlan() {
    const draft = createDraftRoutingPlan();
    setRoutingPlans((current) => [...current.filter((item) => item.id !== ''), draft]);
    setSelectedRoutingPlanId(draft.id);
    setRoutingView('detail');
    setActiveScreen('routing');
  }

  function addRoutingPlanItem() {
    setRoutingPlans((current) => current.map((plan) => {
      const isSelected = selectedRoutingPlanMatcher(plan);
      if (!isSelected) return plan;
      return {
        ...plan,
        items: [
          ...plan.items,
          {
            id: `draft-item-${Date.now()}-${plan.items.length + 1}`,
            provider: ANY_PROVIDER_VALUE,
            country: '',
            operator: '',
            enabled: true,
            price_mode: 'any',
            min_price: null,
            max_price: null,
            fixed_price: null,
          },
        ],
      };
    }));
  }

  function removeRoutingPlanItem(itemId: string) {
    setRoutingPlans((current) => current.map((plan) => {
      if (!selectedRoutingPlanMatcher(plan)) return plan;
      return {
        ...plan,
        items: plan.items.filter((item) => item.id !== itemId),
      };
    }));
  }

  function duplicateRoutingPlanItem(itemId: string) {
    setRoutingPlans((current) => current.map((plan) => {
      if (!selectedRoutingPlanMatcher(plan)) return plan;
      const index = plan.items.findIndex((item) => item.id === itemId);
      if (index < 0) return plan;
      const source = plan.items[index];
      const duplicate: RoutingPlanItem = {
        ...source,
        id: `${source.id}-copy-${Math.random().toString(36).slice(2, 8)}`,
      };
      const nextItems = [...plan.items];
      nextItems.splice(index + 1, 0, duplicate);
      return {
        ...plan,
        items: nextItems,
      };
    }));
  }

  function moveRoutingPlanItem(itemId: string, direction: 'up' | 'down') {
    setRoutingPlans((current) => current.map((plan) => {
      const isSelected = selectedRoutingPlanMatcher(plan);
      if (!isSelected) return plan;
      const index = plan.items.findIndex((item) => item.id === itemId);
      if (index < 0) return plan;
      const nextIndex = direction === 'up' ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= plan.items.length) return plan;
      const nextItems = [...plan.items];
      const [moved] = nextItems.splice(index, 1);
      nextItems.splice(nextIndex, 0, moved);
      return {
        ...plan,
        items: nextItems,
      };
    }));
  }

  function updateRoutingPlanItem(itemId: string, updater: (item: RoutingPlanItem) => RoutingPlanItem) {
    setRoutingPlans((current) => current.map((plan) => {
      if (!selectedRoutingPlanMatcher(plan)) return plan;
      return {
        ...plan,
        items: plan.items.map((item) => item.id === itemId ? updater(item) : item),
      };
    }));
  }

  function openRoutingItemEditor(itemId: string) {
    const plan = routingPlans.find((item) => selectedRoutingPlanMatcher(item));
    const item = plan?.items.find((entry) => entry.id === itemId);
    if (!item) return;

    setRoutingItemEditor({
      itemId,
      providerId: item.provider,
      country: item.country,
      operator: item.operator,
      minPrice: item.min_price != null ? String(item.min_price) : '',
      maxPrice: item.max_price != null ? String(item.max_price) : '',
    });
    setRoutingItemPriceOptions([]);
  }

  function closeRoutingItemEditor() {
    setRoutingItemEditor(null);
    setRoutingItemPriceOptions([]);
    setRoutingItemPriceLoading(false);
  }

  function updateRoutingItemEditor(patch: Partial<RoutingItemEditorState>) {
    setRoutingItemEditor((current) => current ? { ...current, ...patch } : current);
  }

  function applyRoutingItemEditor() {
    if (!routingItemEditor) return;
    if (!routingItemEditor.providerId.trim()) {
      pushStatusMessage(translate('provider_required_each_route_candidate'));
      return;
    }

    const minPrice = routingItemEditor.minPrice.trim() === '' ? null : Number(routingItemEditor.minPrice);
    const maxPrice = routingItemEditor.maxPrice.trim() === '' ? null : Number(routingItemEditor.maxPrice);
    if ((minPrice != null && Number.isNaN(minPrice)) || (maxPrice != null && Number.isNaN(maxPrice))) {
      pushStatusMessage(translate('price_must_valid'));
      return;
    }
    if (minPrice != null && maxPrice != null && minPrice > maxPrice) {
      pushStatusMessage(translate('min_price_cannot_gt_max'));
      return;
    }

    updateRoutingPlanItem(routingItemEditor.itemId, (item) => {
      const nextPriceMode = minPrice == null && maxPrice == null
        ? 'any'
        : minPrice != null && maxPrice != null && minPrice === maxPrice
          ? 'fixed'
          : 'range';
      const fixedPrice = nextPriceMode === 'fixed' ? minPrice : null;
      return {
        ...item,
        provider: routingItemEditor.providerId,
        country: routingItemEditor.country.trim(),
        operator: routingItemEditor.operator.trim(),
        price_mode: nextPriceMode,
        min_price: minPrice,
        max_price: maxPrice,
        fixed_price: fixedPrice,
      };
    });
    closeRoutingItemEditor();
  }

  async function loadRoutingItemPriceOptions() {
    if (!routingItemEditor) return;
    if (routingItemEditor.providerId === ANY_PROVIDER_VALUE) {
      pushStatusMessage(translate('choose_specific_provider_before_loading_candidate_prices'));
      return;
    }
    const plan = routingPlans.find((item) => selectedRoutingPlanMatcher(item));
    const service = plan?.service || visibleProviders.find((provider) => provider.id === routingItemEditor.providerId)?.defaults.service;
    if (!service) {
      pushStatusMessage(translate('select_service_before_loading_prices'));
      return;
    }
    try {
      setRoutingItemPriceLoading(true);
      const prices = await fetchProviderPrices(routingItemEditor.providerId, service, {
        country: routingItemEditor.country.trim() ? routingItemEditor.country : undefined,
        operator: routingItemEditor.operator || undefined,
      });
      setRoutingItemPriceOptions(prices.items);
      pushStatusMessage(translate('loaded_prices_for_provider', { provider: routingItemEditor.providerId }));
    } catch (error) {
      pushStatusMessage(translate('failed_load_prices_for_provider', { provider: routingItemEditor.providerId, error: formatError(error) }));
    } finally {
      setRoutingItemPriceLoading(false);
    }
  }

  function quickFillRoutingItemPrice(kind: 'min' | 'max', price: number) {
    setRoutingItemEditor((current) => {
      if (!current) return current;
      return {
        ...current,
        minPrice: kind === 'min' ? String(price) : current.minPrice,
        maxPrice: kind === 'max' ? String(price) : current.maxPrice,
      };
    });
  }

  function useExactRoutingItemPrice(price: number) {
    setRoutingItemEditor((current) => {
      if (!current) return current;
      const nextValue = String(price);
      return {
        ...current,
        minPrice: nextValue,
        maxPrice: nextValue,
      };
    });
  }

  async function openRoutingItemSelector(
    itemId: string,
    field: 'provider' | 'country' | 'operator',
    source: 'row' | 'editor' = 'row',
  ) {
    const plan = routingPlans.find((item) => selectedRoutingPlanMatcher(item));
    const item = plan?.items.find((entry) => entry.id === itemId);
    if (!plan || !item) return;
    const editorProviderId = routingItemEditor?.itemId === itemId ? routingItemEditor.providerId : item.provider;
    const providerId = editorProviderId || item.provider || ANY_PROVIDER_VALUE;
    setRoutingEditorState({ itemId, field, providerId, source });

    setSelectorSearch('');
    if (field === 'provider') {
      setSelectorState({
        kind: 'routing-item-provider',
        title: t('Select Candidate Provider'),
        resourceKind: 'provider',
        options: [
          selectorOptionFromOptionItem({
            option: anyProviderOption,
            language,
            resourceKind: 'provider',
            source: 'synthetic',
            scope: 'cross_provider',
            isSynthetic: true,
            syntheticKind: 'any_provider',
          }),
          ...visibleProviders.map((provider) => selectorOptionFromProvider(provider, language)),
        ],
      });
      return;
    }

    if (field === 'country') {
      setSelectorState({
        kind: 'routing-item-country',
        title: t('Select Candidate Country'),
        resourceKind: 'country',
        options: dedupeSelectorOptions([
          selectorOptionFromOptionItem({
            option: anyRouteCountryOption,
            language,
            resourceKind: 'country',
            source: 'synthetic',
            scope: 'single_provider',
            isSynthetic: true,
            syntheticKind: 'any_country',
          }),
          ...filterCatalogItems(optionCatalog.countries, providerId).map((option) => selectorOptionFromCatalogItem({
            item: option,
            language,
            resourceKind: 'country',
            providerId,
          })),
        ]),
      });
      return;
    }

    let liveOperatorOptions: SelectorOptionViewModel[] = [];
    if (providerId && providerId !== ANY_PROVIDER_VALUE) {
      try {
        const operatorCountry = routingItemEditor?.itemId === itemId
          ? routingItemEditor.country
          : item.country;
        const priceService = plan.service || visibleProviders.find((provider) => provider.id === providerId)?.defaults.service;
        let priceDerivedOperatorOptions: SelectorOptionViewModel[] = [];
        if (priceService?.trim()) {
          const priceResponse = await fetchProviderPrices(providerId, priceService, {
            country: operatorCountry.trim() ? operatorCountry : undefined,
          });
          priceDerivedOperatorOptions = dedupeSelectorOptions(
            priceResponse.items
              .filter((entry) => {
                const value = entry.operator.trim().toLowerCase();
                return value !== '' && value !== 'any' && value !== 'default';
              })
              .map((entry) => selectorOptionFromOptionItem({
                option: {
                  value: entry.operator,
                  label: entry.operator_label ?? entry.operator,
                  hint: 'price-derived',
                  provider_value: entry.provider_operator ?? entry.operator,
                },
                language,
                providerId,
              })),
          );
        }
        const response = await fetchProviderOperators(providerId, {
          country: operatorCountry.trim() ? operatorCountry : undefined,
        });
        const liveOperators = response.items
          .map((option) => ({
            ...option,
            label: formatOperatorLabel(option.value, language),
          }))
          .filter((option) => {
            const value = option.value.trim().toLowerCase();
            return value !== '' && value !== 'any' && value !== 'default';
          });
        if (liveOperators.length > 0) {
          setProviderOptions((current) => {
            const existing = current[providerId];
            if (!existing) return current;
            return {
              ...current,
              [providerId]: {
                ...existing,
                raw_operators: liveOperators,
                operators: liveOperators,
              },
            };
          });
          liveOperatorOptions = dedupeSelectorOptions(
            [
              ...priceDerivedOperatorOptions,
              ...liveOperators.map((option) => selectorOptionFromOptionItem({
                option,
                language,
                providerId,
              })),
            ],
          );
        } else {
          liveOperatorOptions = priceDerivedOperatorOptions;
        }
      } catch {
        if (routingItemPriceOptions.length > 0) {
          liveOperatorOptions = dedupeSelectorOptions(
            routingItemPriceOptions
              .filter((entry) => {
                const value = entry.operator.trim().toLowerCase();
                return value !== '' && value !== 'any' && value !== 'default';
              })
              .map((entry) => selectorOptionFromOptionItem({
                option: {
                  value: entry.operator,
                  label: entry.operator_label ?? entry.operator,
                  hint: 'price-derived',
                  provider_value: entry.provider_operator ?? entry.operator,
                },
                language,
                providerId,
              })),
          );
        }
      }
    }

    const routingPriceOperatorOptions = liveOperatorOptions.length > 0
      ? liveOperatorOptions
      : dedupeSelectorOptions(
        routingItemPriceOptions
          .filter((entry) => {
            const value = entry.operator.trim().toLowerCase();
            return value !== '' && value !== 'any' && value !== 'default';
          })
          .map((entry) => selectorOptionFromOptionItem({
            option: {
              value: entry.operator,
              label: entry.operator_label ?? entry.operator,
              hint: 'price-derived',
              provider_value: entry.provider_operator ?? entry.operator,
            },
            language,
            providerId,
          })),
      );

    setSelectorState({
      kind: 'routing-item-operator',
      title: t('Select Candidate Carrier'),
      options: dedupeSelectorOptions([
        selectorOptionFromOptionItem({
          option: anyRouteOperatorOption,
          language,
          source: 'synthetic',
          scope: 'single_provider',
          isSynthetic: true,
          syntheticKind: 'all_operators',
        }),
        ...routingPriceOperatorOptions,
        ...filterCatalogItems(optionCatalog.operators, providerId).map((option) => selectorOptionFromCatalogItem({
          item: option,
          language,
          providerId,
        })),
      ]),
    });
  }

  function openRoutingServiceSelector() {
    setSelectorSearch('');
    setSelectorState({
      kind: 'routing-service',
      title: t('Select Routing Service'),
      resourceKind: 'service',
      options: optionCatalog.services.map((service) => selectorOptionFromCatalogItem({
        item: {
          ...service,
          hint: t('Routing service'),
        },
        language,
        resourceKind: 'service',
      })),
    });
  }

  function applyRoutingSelectorOption(option: SelectorOptionViewModel) {
    if (!routingEditorState) return;
    const { itemId, field, source } = routingEditorState;
    const commitValue = option.commitValue;

    if (field === 'provider') {
      if (source === 'editor') {
        setRoutingItemEditor((current) => current && current.itemId === itemId
          ? {
            ...current,
            providerId: commitValue,
            country: '',
            operator: '',
            minPrice: '',
            maxPrice: '',
          }
          : current);
      } else {
        updateRoutingPlanItem(itemId, (item) => ({
          ...item,
          provider: commitValue,
          country: '',
          operator: '',
          price_mode: 'any',
          min_price: null,
          max_price: null,
          fixed_price: null,
        }));
        setRoutingItemEditor((current) => current && current.itemId === itemId
          ? {
            ...current,
            providerId: commitValue,
            country: '',
            operator: '',
            minPrice: '',
            maxPrice: '',
          }
          : current);
      }
      setRoutingItemPriceOptions([]);
    } else if (field === 'country') {
      if (source === 'editor') {
        setRoutingItemEditor((current) => current && current.itemId === itemId
          ? {
            ...current,
            country: commitValue,
          }
          : current);
      } else {
        updateRoutingPlanItem(itemId, (item) => ({
          ...item,
          country: commitValue,
        }));
      }
    } else if (field === 'operator') {
      if (source === 'editor') {
        setRoutingItemEditor((current) => current && current.itemId === itemId
          ? {
            ...current,
            operator: commitValue,
          }
          : current);
      } else {
        updateRoutingPlanItem(itemId, (item) => ({
          ...item,
          operator: commitValue,
        }));
      }
    }

    setRoutingEditorState(null);
    setSelectorState(null);
  }

  function reorderRoutingPlanItem(fromIndex: number, toIndex: number) {
    let reordered = false;
    setRoutingPlans((current) => current.map((plan) => {
      if (!selectedRoutingPlanMatcher(plan)) return plan;
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= plan.items.length || toIndex >= plan.items.length) return plan;
      const nextItems = [...plan.items];
      const [moved] = nextItems.splice(fromIndex, 1);
      nextItems.splice(toIndex, 0, moved);
      reordered = true;
      return {
        ...plan,
        items: nextItems,
      };
    }));
    if (reordered) {
      pushStatusMessage(translate('candidate_order_updated_save_to_persist'));
    }
  }

  function openActivationModal() {
    if (
      activationForm.provider
      && activationForm.provider !== ANY_PROVIDER_VALUE
      && !visibleProviders.some((provider) => provider.id === activationForm.provider)
    ) {
      setActivationForm((current) => ({
        ...current,
        provider: '',
      }));
    }
    setActivationError(
      visibleProviders.length === 0
        ? translate('no_enabled_providers_available')
        : '',
    );
    setShowActivationModal(true);
  }

  function openActivationRoutingPlanSelector() {
    setSelectorSearch('');
    setActivationRoutingPlanPickerOpen(true);
    setSelectorState({
      kind: 'activation-routing-plan',
      title: t('Select Routing Plan'),
      options: [
        selectorOptionFromOptionItem({
          option: {
            value: '',
            label: t('No routing plan'),
            hint: t('Use manual provider, service, and country controls'),
          },
          language,
          source: 'synthetic',
          scope: 'cross_provider',
        }),
        ...routingPlans.filter((plan) => plan.enabled).map((plan) => selectorOptionFromOptionItem({
          option: {
            value: plan.id,
            label: plan.name,
            hint: `${formatServiceLabel(plan.service, language)} · ${plan.execution_mode === 'random' ? t('Random') : t('Sequential')} · ${plan.execution_rounds === 0 ? t('Unlimited rounds') : t('{{count}} rounds', { count: plan.execution_rounds })}`,
          },
          language,
          source: 'synthetic',
          scope: 'cross_provider',
        })),
      ],
    });
  }

  function handleSubmitActivation() {
    if (visibleProviders.length === 0) {
      setActivationError(translate('no_enabled_providers_available'));
      return;
    }
    if (
      activationForm.provider
      && activationForm.provider !== ANY_PROVIDER_VALUE
      && !visibleProviders.some((provider) => provider.id === activationForm.provider)
    ) {
      setActivationForm((current) => ({
        ...current,
        provider: '',
      }));
      setActivationError(translate('provider_no_longer_enabled_pick_another', { provider: activationForm.provider }));
      return;
    }
    void submitActivation();
  }

  function markNotificationsRead() {
    setNotificationCursor(notifications.length);
  }

  async function handleWindowAction(action: 'minimize' | 'maximize_toggle' | 'close') {
    try {
      await windowAction(action);
    } catch (error) {
      pushStatusMessage(translate('window_action_failed', { error: formatError(error) }));
    }
  }

  const selectedRoutingPlan = routingPlans.find((item) => selectedRoutingPlanMatcher(item));
  const toolbarTitle = activeScreen === 'providers' && providerView === 'workspace'
    ? `${t('Providers')} › ${manifests[selectedProvider]?.name ?? selectedProvider}`
    : activeScreen === 'routing' && routingView === 'detail'
      ? `${t('Routing Plans')} › ${selectedRoutingPlan?.name || t('Untitled Plan')}`
      : navItems.find((item) => item.id === activeScreen)?.label ?? activeScreen;

  const notificationItems = useMemo<NotificationItem[]>(() => (
    notifications
      .map((entry, index) => ({ entry, index }))
      .slice()
      .reverse()
      .map(({ entry, index }) => {
        const level: NotificationItem['level'] = entry.level.toLowerCase() === 'error'
          ? 'danger'
          : entry.level.toLowerCase() === 'warn'
            ? 'warning'
            : 'info';
        return {
          id: `${entry.timestamp}-${index}`,
          title: entry.message,
          meta: `${formatScopeLabel(entry.scope, language)} · ${index < notificationCursor ? t('read') : formatRelativeTime(entry.timestamp, language)}`,
          level,
        };
      })
  ), [language, notificationCursor, notifications]);

  const sidebar = (
    <AppSidebar
      items={navItems.map(({ id, label, Icon }) => ({ id, label, icon: Icon }))}
      activeId={activeScreen}
      collapsed={sidebarCollapsed}
      onToggleCollapsed={() => setSidebarCollapsed((current) => !current)}
      onSelect={(id) => {
        setActiveScreen(id);
        if (id === 'providers') setProviderView('list');
      }}
      footer={IS_WEB_RUNTIME ? (
        <div className="mt-auto px-3 pb-4 pt-2">
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2 text-left text-[13px] text-ds-text-secondary transition-colors duration-fast ease-[var(--ds-motion-transition-fast)] hover:bg-[var(--ds-color-interactive-hover)] hover:text-ds-text-primary"
            onClick={() => {
              void logoutHttpAccess()
                .then(() => {
                  setHttpAuthenticated(false);
                  setHttpSecretInput('');
                  setHttpAuthError('');
                })
                .catch((error) => {
                  pushStatusMessage(translate('failed_logout_http_access', { error: formatError(error) }));
                });
            }}
          >
            <LogOut size={15} />
            <span>{t('Logout')}</span>
          </button>
        </div>
      ) : null}
    />
  );

  async function handleHttpLogin() {
    try {
      setHttpAuthBusy(true);
      setHttpAuthError('');
      const status = await loginHttpAccess(httpSecretInput);
      setHttpAuthenticated(status.authenticated);
      setHttpSecretInput('');
      await Promise.all([loadSnapshot(), loadManifests(), loadRuntimeSettings(), loadRoutingPlans()]);
    } catch (error) {
      setHttpAuthError(formatError(error));
    } finally {
      setHttpAuthBusy(false);
    }
  }

  const toolbarNavigation = activeScreen === 'providers' && providerView === 'workspace'
    ? (
      <button
        type="button"
        aria-label={t('Back to providers')}
        className="inline-flex h-7 w-7 items-center justify-center rounded-pill text-ds-text-secondary transition-colors duration-fast ease-[var(--ds-motion-transition-fast)] hover:bg-[var(--ds-color-interactive-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent-focus"
        onClick={() => setProviderView('list')}
      >
        <ChevronLeft size={16} />
      </button>
    )
    : activeScreen === 'routing' && routingView === 'detail'
      ? (
        <button
          type="button"
          aria-label={t('Back to routing plans')}
          className="inline-flex h-7 w-7 items-center justify-center rounded-pill text-ds-text-secondary transition-colors duration-fast ease-[var(--ds-motion-transition-fast)] hover:bg-[var(--ds-color-interactive-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent-focus"
          onClick={closeRoutingPlanDetail}
        >
          <ChevronLeft size={16} />
        </button>
      )
      : undefined;

  const toolbarActions = (
    <>
      {activeScreen === 'routing' && routingView === 'matrix' ? (
        <SearchField
          compact
          className="w-full min-[760px]:w-48"
          value={routingSearch}
          onChange={(event) => setRoutingSearch(event.target.value)}
          placeholder={t('Search plans...')}
        />
      ) : activeScreen === 'logs' ? (
        <SearchField
          compact
          className="w-full min-[760px]:w-[200px]"
          value={logsSearch}
          onChange={(event) => setLogsSearch(event.target.value)}
          placeholder={t('Search logs...')}
        />
      ) : null}
      {updateCheckResult?.has_update ? (
        <button
          type="button"
          className="inline-flex min-h-0 items-center rounded-pill bg-ds-state-danger px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white transition-opacity duration-fast ease-[var(--ds-motion-transition-fast)] hover:opacity-85"
          onClick={() => void openExternalUrl('https://github.com/netcookies/MaDao/releases')}
        >
          NEW
        </button>
      ) : null}
      <div ref={notificationsPopoverRef} className="relative">
        <IconButton
          variant="toolbar"
          icon={(
            <span className="relative inline-flex h-4 w-[22px] items-center justify-center">
              <Bell size={16} className="opacity-60" />
              {notifications.length > notificationCursor ? (
                <span className="absolute right-0 top-0 h-2 w-2 rounded-pill border border-white bg-[#e0443e]" />
              ) : null}
            </span>
          )}
          aria-label={t('Toggle notifications')}
          aria-expanded={showNotifications}
          onClick={() => setShowNotifications((current) => !current)}
        />
        {showNotifications && (
          <div className="absolute right-0 top-[calc(100%+8px)] z-30">
            <NotificationPopover
              markAllAction={(
                <button
                  type="button"
                  className="font-text text-[13px] font-medium text-ds-accent-focus transition-opacity duration-fast ease-[var(--ds-motion-transition-fast)] hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent-focus"
                  onClick={markNotificationsRead}
                >
                  {t('Mark all read')}
                </button>
              )}
              items={notificationItems}
              footer={(
                <AppButton
                  variant="ghost"
                  size="utility"
                  onClick={() => {
                    setActiveScreen('logs');
                    setShowNotifications(false);
                  }}
                >
                  {t('View all in Logs →')}
                </AppButton>
              )}
            />
          </div>
        )}
      </div>
      {activeScreen === 'routing' && routingView === 'matrix' ? (
        <AppButton variant="primary" size="utility" onClick={createRoutingPlan}>
          <Plus size={14} />
          <span>{t('New Plan')}</span>
        </AppButton>
      ) : activeScreen === 'routing' && routingView === 'detail' ? (
        <AppButton
          variant="primary"
          size="utility"
          onClick={() => {
            const plan = routingPlans.find((item) => selectedRoutingPlanMatcher(item));
            if (plan) void persistRoutingPlan(plan);
          }}
          disabled={busyAction === 'save-routing-plan'}
        >
          {busyAction === 'save-routing-plan' ? t('Saving...') : t('Save Changes')}
        </AppButton>
      ) : activeScreen === 'providers' && providerView === 'workspace' && activeProviderSection === 'config' ? (
        <AppButton
          variant="primary"
          size="utility"
          onClick={() => void saveProvider(selectedProvider)}
          disabled={busyAction.includes('save')}
        >
          {busyAction.includes('save') ? t('Saving…') : t('Save')}
        </AppButton>
      ) : activeScreen === 'providers' && providerView === 'workspace' && activeProviderSection === 'store' ? (
        <AppButton
          variant="primary"
          size="utility"
          onClick={() => void fetchPrices(selectedProvider)}
          disabled={busyAction.includes('prices')}
        >
          {busyAction.includes('prices') ? t('Loading…') : t('Load Prices')}
        </AppButton>
      ) : activeScreen === 'providers' && providerView === 'list' ? (
        <AppButton
          variant="primary"
          size="utility"
          onClick={() => void reloadProviders()}
          disabled={busyAction === 'reload'}
        >
          {busyAction === 'reload' ? t('Reloading…') : t('Reload Providers')}
        </AppButton>
      ) : activeScreen === 'settings' ? (
        <AppButton
          variant="primary"
          size="utility"
          onClick={() => void openAppConfigDirectory()}
          disabled={!IS_DESKTOP_RUNTIME}
        >
          {IS_DESKTOP_RUNTIME ? t('Open Folder') : t('Managed in container')}
        </AppButton>
      ) : activeScreen === 'logs' ? (
        <AppButton
          variant="primary"
          size="utility"
          onClick={() => void loadSnapshot()}
        >
          {t('Refresh')}
        </AppButton>
      ) : activeScreen === 'providers' && providerView === 'workspace' ? null : (
        <AppButton variant="primary" size="utility" onClick={openActivationModal}>
          <Plus size={14} />
          <span>{t('New Activation')}</span>
        </AppButton>
      )}
    </>
  );

  if (IS_WEB_RUNTIME && !httpAuthReady) {
    return null;
  }

  if (IS_WEB_RUNTIME && !httpAuthenticated) {
    return (
      <LanguageProvider language={language}>
        <HttpLoginScreen
          secret={httpSecretInput}
          setSecret={setHttpSecretInput}
          busy={httpAuthBusy}
          error={httpAuthError}
          onSubmit={() => void handleHttpLogin()}
        />
      </LanguageProvider>
    );
  }

  return (
    <LanguageProvider language={language}>
    <>
      <AppShell
        sidebar={sidebar}
        sidebarCollapsed={sidebarCollapsed}
        toolbar={(
          <AppToolbar
            title={toolbarTitle}
            navigation={toolbarNavigation}
            actions={toolbarActions}
          />
        )}
        compact
        noPadding={activeScreen === 'providers' && providerView === 'workspace'}
        contentClassName="max-[760px]:pt-5"
      >
            {activeScreen === 'overview' && (
              <OverviewScreen
                stats={overviewStats}
                activity={recentActivity}
                providers={manifestsById}
                decorations={ticketDecorations}
                onViewAll={() => setActiveScreen('messages')}
              />
            )}

            {activeScreen === 'providers' && providerView === 'list' && (
                <ProvidersListScreen
                  providers={orderedProviders}
                  summaries={snapshot?.providers}
                balances={balances}
                onRefreshBalance={(id) => {
                  void fetchBalance(id);
                }}
                onToggleEnabled={(id, enabled) => {
                  void toggleProviderEnabled(id, enabled);
                }}
                onConfigure={(id) => {
                  setShowManifestModal(false);
                  setSelectedProvider(id);
                  setProviderView('workspace');
                  setActiveProviderSection('config');
                }}
                onReorder={() => {}}
              />
            )}

            {activeScreen === 'routing' && (
              <RoutingScreen
                view={routingView}
                plans={routingPlans}
                providers={orderedProviders}
                serviceOptions={routingServiceOptions}
                serviceIconUrls={sharedServiceIconUrls}
                countryIconUrls={sharedCountryIconUrls}
                selectedPlanId={selectedRoutingPlanId}
                routingFilter={routingFilter}
                routingSearch={routingSearch}
                itemEditor={routingItemEditor}
                itemEditorLoading={routingItemPriceLoading}
                itemPriceOptions={routingItemPriceOptions}
                onSelectPlan={openRoutingPlanDetail}
                onBackToList={closeRoutingPlanDetail}
                onCreatePlan={createRoutingPlan}
                onDeletePlan={(planId) => void removeRoutingPlan(planId)}
                onUpdatePlan={updateRoutingPlanDraft}
                onUpdateRoutingFilter={setRoutingFilter}
                onUpdateRoutingSearch={setRoutingSearch}
                onOpenServicePicker={openRoutingServiceSelector}
                onOpenProviderPicker={(itemId) => void openRoutingItemSelector(itemId, 'provider')}
                onOpenItemSelector={(itemId, field, source) => void openRoutingItemSelector(itemId, field, source)}
                onAddItem={addRoutingPlanItem}
                onDuplicateItem={duplicateRoutingPlanItem}
                onRemoveItem={removeRoutingPlanItem}
                onReorderItem={reorderRoutingPlanItem}
                onOpenItemEditor={openRoutingItemEditor}
                onCloseItemEditor={closeRoutingItemEditor}
                onItemEditorChange={updateRoutingItemEditor}
                onApplyItemEditor={applyRoutingItemEditor}
                onLoadItemPriceOptions={() => void loadRoutingItemPriceOptions()}
                onUseItemPriceQuickFill={quickFillRoutingItemPrice}
                onUseItemExactPrice={useExactRoutingItemPrice}
                busyAction={busyAction}
                operatorSelectableProviderIds={operatorSelectableProviderIds}
              />
            )}

            {activeScreen === 'providers' && providerView === 'workspace' && selectedManifest && (
              <ProviderWorkspaceScreen
                key={selectedProvider}
                manifest={selectedManifest}
                summary={selectedSummary}
                section={activeProviderSection}
                compact
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
                onToggleEnabled={(enabled) => {
                  void toggleProviderEnabled(selectedProvider, enabled);
                }}
                onRefresh={() => void refreshProvider(selectedProvider)}
                onFetchPrices={() => void fetchPrices(selectedProvider)}
                onSave={() => void saveProvider(selectedProvider)}
                onOpenRawJson={() => setShowManifestModal(true)}
                onOpenSelector={openSelector}
                storeQuery={selectedStoreQuery}
                serviceOptions={filterCatalogItems(optionCatalog.services, selectedProvider).map((item) => ({
                  value: item.value,
                  label: item.label,
                  hint: item.hint,
                  provider_value: item.provider_values[selectedProvider] ?? item.provider_values[item.providers[0]],
                  icon_url: item.provider_icon_urls?.[selectedProvider] ?? item.icon_url,
                  provider_icon_url: item.provider_icon_urls?.[selectedProvider] ?? item.icon_url,
                }))}
                countryOptions={filterCatalogItems(optionCatalog.countries, selectedProvider).map((item) => ({
                  value: item.value,
                  label: item.label,
                  hint: item.hint,
                  provider_value: item.provider_values[selectedProvider] ?? item.provider_values[item.providers[0]],
                  icon_url: item.provider_icon_urls?.[selectedProvider] ?? item.icon_url,
                  provider_icon_url: item.provider_icon_urls?.[selectedProvider] ?? item.icon_url,
                }))}
                serviceIconUrls={sharedServiceIconUrls}
                countryIconUrls={sharedCountryIconUrls}
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
                  providers={manifestsById}
                  decorations={ticketDecorations}
                  filter={messageFilter}
                  setFilter={setMessageFilter}
                  filters={messageFilters}
                  busyAction={busyAction}
                  onCopy={copyToClipboard}
                  onRelease={(ticket, action) => void releaseTicket(ticket, action)}
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
                language={language}
                setLanguage={setLanguage}
                appearanceTheme={appearanceTheme}
                setAppearanceTheme={setAppearanceTheme}
                optionCacheEnabled={runtimeSettings.option_cache_enabled}
                optionCachePollIntervalMinutes={runtimeSettings.option_cache_poll_interval_minutes}
                optionCacheOverview={optionCacheOverview}
                checkUpdatesOnLaunch={runtimeSettings.check_updates_on_launch}
                updateCheckBusy={updateCheckBusy}
                isDesktopRuntime={IS_DESKTOP_RUNTIME}
                isWebRuntime={IS_WEB_RUNTIME}
                httpPort={runtimeSettings.http_port}
                httpSecret={runtimeSettings.http_secret}
                httpSecretOverridden={runtimeAccessInfo.http_secret_overridden}
                onOptionCacheEnabledChange={(enabled) =>
                  void updateRuntimeSettings({
                    routing_strategy: runtimeSettings.routing_strategy,
                    auto_fallback: runtimeSettings.auto_fallback,
                    option_cache_enabled: enabled,
                    option_cache_poll_interval_minutes: runtimeSettings.option_cache_poll_interval_minutes,
                    check_updates_on_launch: runtimeSettings.check_updates_on_launch,
                    http_port: runtimeSettings.http_port,
                  })}
                onOptionCachePollIntervalChange={(minutes) =>
                  void updateRuntimeSettings({
                    routing_strategy: runtimeSettings.routing_strategy,
                    auto_fallback: runtimeSettings.auto_fallback,
                    option_cache_enabled: runtimeSettings.option_cache_enabled,
                    option_cache_poll_interval_minutes: minutes,
                    check_updates_on_launch: runtimeSettings.check_updates_on_launch,
                    http_port: runtimeSettings.http_port,
                  })}
                onCheckUpdatesOnLaunchChange={(enabled) =>
                  void updateRuntimeSettings({
                    routing_strategy: runtimeSettings.routing_strategy,
                    auto_fallback: runtimeSettings.auto_fallback,
                    option_cache_enabled: runtimeSettings.option_cache_enabled,
                    option_cache_poll_interval_minutes: runtimeSettings.option_cache_poll_interval_minutes,
                    check_updates_on_launch: enabled,
                    http_port: runtimeSettings.http_port,
                  })}
                onHttpPortChange={(port) =>
                  void updateRuntimeSettings({
                    routing_strategy: runtimeSettings.routing_strategy,
                    auto_fallback: runtimeSettings.auto_fallback,
                    option_cache_enabled: runtimeSettings.option_cache_enabled,
                    option_cache_poll_interval_minutes: runtimeSettings.option_cache_poll_interval_minutes,
                    check_updates_on_launch: runtimeSettings.check_updates_on_launch,
                    http_port: port,
                  })}
                onRegenerateHttpSecret={() =>
                  void refreshHttpSecret().then((info) => {
                    if (info) setRuntimeAccessInfo(info);
                  })}
                regenerateSecretBusy={busyAction === 'regenerate-http-secret'}
                onCheckForUpdates={() => void handleCheckForUpdates('manual')}
                apiBase={API_BASE}
                socketPath={SOCKET_PATH}
                configDirectory={configDirectory}
              />
            )}

              {activeScreen === 'logs' && (
                <LogsScreen
                  logs={filteredLogs}
                  filter={logsFilter}
                  setFilter={setLogsFilter}
                  filters={logFilters}
                  search={logsSearch}
                  onSearch={setLogsSearch}
                  onClearLogs={() => void handleClearLogs()}
                />
              )}
      </AppShell>

      {showActivationModal && (
        <NewActivationModal
          providers={visibleProviders}
          routingPlans={routingPlans}
          form={activationForm}
          busy={activationBusy}
          error={activationError}
          operatorHint={undefined}
          serviceOptions={filterCatalogItems(optionCatalog.services, activationForm.provider).map((item) => ({
            value: item.value,
            label: item.label,
            hint: item.hint,
            provider_value: item.provider_values[activationForm.provider] ?? item.provider_values[item.providers[0]],
            icon_url: item.provider_icon_urls?.[activationForm.provider] ?? item.icon_url,
            provider_icon_url: item.provider_icon_urls?.[activationForm.provider] ?? item.icon_url,
          }))}
          countryOptions={filterCatalogItems(optionCatalog.countries, activationForm.provider).map((item) => ({
            value: item.value,
            label: item.label,
            hint: item.hint,
            provider_value: item.provider_values[activationForm.provider] ?? item.provider_values[item.providers[0]],
            icon_url: item.provider_icon_urls?.[activationForm.provider] ?? item.icon_url,
            provider_icon_url: item.provider_icon_urls?.[activationForm.provider] ?? item.icon_url,
          }))}
          onChange={updateActivationField}
          onClose={closeActivationModal}
          onSubmit={handleSubmitActivation}
          onOpenSelector={openSelector}
          onOpenRoutingPlanSelector={openActivationRoutingPlanSelector}
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
          language={language}
          resourceKind={selectorState.resourceKind}
          onClose={() => setSelectorState(null)}
          onSearch={setSelectorSearch}
          onSelect={(option) => {
            if (selectorState.kind.startsWith('routing-item-')) {
              applyRoutingSelectorOption(option);
              return;
            }
            if (selectorState.kind === 'routing-service') {
              const plan = routingPlans.find((item) => selectedRoutingPlanMatcher(item));
              if (plan) updateRoutingPlanDraft({ ...plan, service: option.commitValue });
              setSelectorState(null);
              return;
            }
            if (activationRoutingPlanPickerOpen && selectorState.kind === 'activation-routing-plan') {
              setActivationForm((current) => ({
                ...current,
                routing_plan_id: option.commitValue,
                service: option.commitValue
                  ? routingPlans.find((plan) => plan.id === option.commitValue)?.service ?? current.service
                  : current.service,
              }));
              setActivationRoutingPlanPickerOpen(false);
              setSelectorState(null);
              return;
            }
            applySelectorOption(option);
          }}
        />
      )}

      <Snackbar
        open={snackbarOpen}
        message={statusMessage}
        tone={snackbarTone}
      />

    </>
    </LanguageProvider>
  );
}
