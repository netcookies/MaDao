import {
  useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import {
  Bell, Bot, ChevronLeft, Copy, LayoutDashboard,
  Loader2, MessageSquare, Plus, Search, Send, Server, Settings,
  Shield, ShoppingCart, Shuffle, Sliders, Smartphone, Square, Terminal, User, Wallet, X,
} from 'lucide-react';
import {
  AppShell,
  AppSidebar,
  AppToolbar,
} from './components/composites';
import { NotificationPopover, Snackbar, type SnackbarTone } from './components/overlays';
import { IconButton } from './components/primitives';
import {
  AppButton,
  ConfigRow,
  DataTable,
  DetailRow,
  SearchField,
} from './app/ui-bridge';
import { MessagesScreen } from './app/messages/MessagesScreen';
import { NewActivationModal } from './app/overlays/NewActivationModal';
import { ManifestModal } from './app/overlays/ManifestModal';
import { SearchSelectorModal } from './app/overlays/SearchSelectorModal';
import { OverviewScreen } from './app/overview/OverviewScreen';
import { ProviderWorkspaceScreen } from './app/providers/ProviderWorkspaceScreen';
import { ProvidersListScreen } from './app/providers/ProvidersListScreen';
import { RoutingScreen } from './app/routing/RoutingScreen';
import type { RoutingItemEditorState } from './app/routing/RoutingScreen';
import type {
  ActivationFormState,
  AppearanceTheme,
  LanguageCode,
  LogFilter,
  MessageFilter,
  OptionItem,
  PriceSortKey,
  ProviderManifest,
  ProviderPriceItem,
  ProviderSectionId,
  ProviderSummary,
  RoutingPlan,
  RoutingPlanItem,
  RoutingPlanFilter,
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
  deleteRoutingPlan,
  fetchRoutingPlans,
  fetchProviderPrices,
  saveRoutingPlan,
} from './services/runtimeApi';
import { getAppConfigDirectory, openAppConfigDirectory } from './services/appConfigApi';
import { windowAction } from './services/windowApi';
import { listenMenuCommand } from './services/menuBarApi';

type SidebarItem = { id: ScreenId; label: string; Icon: typeof LayoutDashboard };

const NAV_ITEMS: SidebarItem[] = [
  { id: 'overview', label: 'Overview', Icon: LayoutDashboard },
  { id: 'providers', label: 'Providers', Icon: Server },
  { id: 'routing', label: 'Routing', Icon: Shuffle },
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

const ANY_ROUTE_COUNTRY_OPTION: OptionItem = {
  value: '',
  label: 'Any country',
  hint: 'Allow the provider to auto pick country',
};

const ANY_ROUTE_OPERATOR_OPTION: OptionItem = {
  value: '',
  label: 'Any carrier',
  hint: 'Allow any operator for this provider',
};

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
  const [configDirectory, setConfigDirectory] = useState('Loading…');
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [statusSequence, setStatusSequence] = useState(0);
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
    compactTables,
    setCompactTables,
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
    fetchBalance,
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
      setStatusMessage: pushStatusMessage,
      setMessageFilter,
    },
    {
      loadSnapshot,
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
    void Promise.all([loadSnapshot(), loadManifests(), loadRuntimeSettings(), loadRoutingPlans()]);
  }, []);

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
    const root = document.documentElement;
    root.dataset.theme = appearanceTheme;
    root.dataset.language = language;
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
    return tickets.slice(0, 6);
  }, [snapshot]);

  const filteredSelectorOptions = useMemo(() => {
    if (!selectorState) return [];
    if (!selectorSearch.trim()) return selectorState.options;
    const term = selectorSearch.toLowerCase();
    return selectorState.options.filter((option) =>
      [option.label, option.value, option.hint].some((value) => value.toLowerCase().includes(term)),
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
      pushStatusMessage(`Failed to load routing plans: ${String(error)}`);
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
      pushStatusMessage('Routing plan name is required.');
      return;
    }
    if (!plan.service.trim()) {
      pushStatusMessage('Routing plan service is required.');
      return;
    }
    if (plan.items.length === 0) {
      pushStatusMessage('Routing plan must contain at least one item.');
      return;
    }
    if (plan.enabled && !plan.items.some((item) => item.enabled)) {
      pushStatusMessage('Enabled routing plan must contain at least one enabled item.');
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
      pushStatusMessage(`Saved routing plan ${saved.name}.`);
    } catch (error) {
      pushStatusMessage(`Failed to save routing plan: ${String(error)}`);
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
      pushStatusMessage(`Deleted routing plan ${planId}.`);
    } catch (error) {
      pushStatusMessage(`Failed to delete routing plan: ${String(error)}`);
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
            provider: visibleProviders[0]?.id ?? '',
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
      pushStatusMessage('Provider is required for each route candidate.');
      return;
    }

    const minPrice = routingItemEditor.minPrice.trim() === '' ? null : Number(routingItemEditor.minPrice);
    const maxPrice = routingItemEditor.maxPrice.trim() === '' ? null : Number(routingItemEditor.maxPrice);
    if ((minPrice != null && Number.isNaN(minPrice)) || (maxPrice != null && Number.isNaN(maxPrice))) {
      pushStatusMessage('Price must be a valid number.');
      return;
    }
    if (minPrice != null && maxPrice != null && minPrice > maxPrice) {
      pushStatusMessage('Min price cannot be greater than max price.');
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
    const plan = routingPlans.find((item) => selectedRoutingPlanMatcher(item));
    const service = plan?.service || visibleProviders.find((provider) => provider.id === routingItemEditor.providerId)?.defaults.service;
    if (!service) {
      pushStatusMessage('Select a service for this plan before loading prices.');
      return;
    }
    try {
      setRoutingItemPriceLoading(true);
      const prices = await fetchProviderPrices(routingItemEditor.providerId, service);
      setRoutingItemPriceOptions(prices.items);
      pushStatusMessage(`Loaded prices for ${routingItemEditor.providerId}.`);
    } catch (error) {
      pushStatusMessage(`Failed to load prices for ${routingItemEditor.providerId}: ${String(error)}`);
    } finally {
      setRoutingItemPriceLoading(false);
    }
  }

  function quickFillRoutingItemPrice(kind: 'min' | 'max', price: number) {
    if (!routingItemEditor) return;
    setRoutingItemEditor({
      ...routingItemEditor,
      minPrice: kind === 'min' ? String(price) : routingItemEditor.minPrice,
      maxPrice: kind === 'max' ? String(price) : routingItemEditor.maxPrice,
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
    const providerId = editorProviderId || item.provider || visibleProviders[0]?.id || '';
    const options = providerOptions[providerId];
    setRoutingEditorState({ itemId, field, providerId, source });

    setSelectorSearch('');
    if (field === 'provider') {
      setSelectorState({
        kind: 'routing-item-provider',
        title: 'Select Candidate Provider',
        options: visibleProviders.map((provider) => ({
          value: provider.id,
          label: provider.name,
          hint: provider.kind,
        })),
      });
      return;
    }

    if (field === 'country') {
      setSelectorState({
        kind: 'routing-item-country',
        title: 'Select Candidate Country',
        options: [ANY_ROUTE_COUNTRY_OPTION, ...(options?.countries ?? [])],
      });
      return;
    }

    setSelectorState({
      kind: 'routing-item-operator',
      title: 'Select Candidate Carrier',
      options: [ANY_ROUTE_OPERATOR_OPTION, ...(options?.operators ?? [])],
    });
  }

  function openRoutingServiceSelector() {
    setSelectorSearch('');
    setSelectorState({
      kind: 'routing-service',
      title: 'Select Routing Service',
      options: routingServiceOptions.map((service) => ({
        value: service.id,
        label: service.label,
        hint: 'Routing service',
      })),
    });
  }

  function applyRoutingSelectorOption(option: OptionItem) {
    if (!routingEditorState) return;
    const { itemId, field, source } = routingEditorState;

    if (field === 'provider') {
      if (source === 'editor') {
        setRoutingItemEditor((current) => current && current.itemId === itemId
          ? {
            ...current,
            providerId: option.value,
            country: '',
            operator: '',
            minPrice: '',
            maxPrice: '',
          }
          : current);
      } else {
        updateRoutingPlanItem(itemId, (item) => ({
          ...item,
          provider: option.value,
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
            providerId: option.value,
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
            country: option.value,
          }
          : current);
      } else {
        updateRoutingPlanItem(itemId, (item) => ({
          ...item,
          country: option.value,
        }));
      }
    } else if (field === 'operator') {
      if (source === 'editor') {
        setRoutingItemEditor((current) => current && current.itemId === itemId
          ? {
            ...current,
            operator: option.value,
          }
          : current);
      } else {
        updateRoutingPlanItem(itemId, (item) => ({
          ...item,
          operator: option.value,
        }));
      }
    }

    setRoutingEditorState(null);
    setSelectorState(null);
  }

  function reorderRoutingPlanItem(fromIndex: number, toIndex: number) {
    setRoutingPlans((current) => current.map((plan) => {
      if (!selectedRoutingPlanMatcher(plan)) return plan;
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= plan.items.length || toIndex >= plan.items.length) return plan;
      const nextItems = [...plan.items];
      const [moved] = nextItems.splice(fromIndex, 1);
      nextItems.splice(toIndex, 0, moved);
      return {
        ...plan,
        items: nextItems,
      };
    }));
  }

  function openActivationModal() {
    if (activationForm.provider && !visibleProviders.some((provider) => provider.id === activationForm.provider)) {
      setActivationForm((current) => ({
        ...current,
        provider: '',
      }));
    }
    setActivationError(
      visibleProviders.length === 0
        ? 'No enabled providers available. Save an enabled provider first.'
        : '',
    );
    setShowActivationModal(true);
  }

  function openActivationRoutingPlanSelector() {
    setSelectorSearch('');
    setActivationRoutingPlanPickerOpen(true);
    setSelectorState({
      kind: 'activation-routing-plan',
      title: 'Select Routing Plan',
      options: [
        {
          value: '',
          label: 'No routing plan',
          hint: 'Use manual provider, service, and country controls',
        },
        ...routingPlans.filter((plan) => plan.enabled).map((plan) => ({
          value: plan.id,
          label: plan.name,
          hint: `${formatServiceLabel(plan.service)} · ${plan.execution_mode === 'random' ? 'Random' : 'Sequential'}`,
        })),
      ],
    });
  }

  function handleSubmitActivation() {
    if (visibleProviders.length === 0) {
      setActivationError('No enabled providers available. Save an enabled provider first.');
      return;
    }
    if (activationForm.provider && !visibleProviders.some((provider) => provider.id === activationForm.provider)) {
      setActivationForm((current) => ({
        ...current,
        provider: '',
      }));
      setActivationError(`Provider ${activationForm.provider} is no longer enabled. Pick another provider or use a routing plan.`);
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
      pushStatusMessage(`Window action failed: ${String(error)}`);
    }
  }

  const selectedRoutingPlan = routingPlans.find((item) => selectedRoutingPlanMatcher(item));

  const toolbarTitle = activeScreen === 'providers' && providerView === 'workspace'
    ? `Providers › ${manifests[selectedProvider]?.name ?? selectedProvider}`
    : activeScreen === 'routing' && routingView === 'detail'
      ? `Routing Plans › ${selectedRoutingPlan?.name || 'Untitled Plan'}`
    : NAV_ITEMS.find((item) => item.id === activeScreen)?.label ?? '';

  const notificationItems = useMemo(() => (
    notifications
      .map((entry, index) => ({ entry, index }))
      .slice()
      .reverse()
      .map(({ entry, index }) => ({
        id: `${entry.timestamp}-${index}`,
        title: entry.message,
        meta: `${formatProviderLabel(entry.scope)} · ${index < notificationCursor ? 'read' : formatRelativeTime(entry.timestamp)}`,
        level: entry.level.toLowerCase() === 'error'
          ? 'danger'
          : entry.level.toLowerCase() === 'warn'
            ? 'warning'
            : 'info',
      }))
  ), [notificationCursor, notifications]);

  const sidebar = (
    <AppSidebar
      items={NAV_ITEMS.map(({ id, label, Icon }) => ({ id, label, icon: Icon }))}
      activeId={activeScreen}
      collapsed={sidebarCollapsed}
      onToggleCollapsed={() => setSidebarCollapsed((current) => !current)}
      onSelect={(id) => {
        setActiveScreen(id);
        if (id === 'providers') setProviderView('list');
      }}
    />
  );

  const toolbarNavigation = activeScreen === 'providers' && providerView === 'workspace'
    ? (
      <button
        type="button"
        aria-label="Back to providers"
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
          aria-label="Back to routing plans"
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
          placeholder="Search plans..."
        />
      ) : activeScreen === 'logs' ? (
        <SearchField
          compact
          className="w-full min-[760px]:w-[200px]"
          value={logsSearch}
          onChange={(event) => setLogsSearch(event.target.value)}
          placeholder="Search logs..."
        />
      ) : null}
      <div className="relative">
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
          aria-label="Toggle notifications"
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
                  Mark all read
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
                  View all in Logs →
                </AppButton>
              )}
            />
          </div>
        )}
      </div>
      {activeScreen === 'routing' && routingView === 'matrix' ? (
        <AppButton variant="primary" size="utility" onClick={createRoutingPlan}>
          <Plus size={14} />
          <span>New Plan</span>
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
          {busyAction === 'save-routing-plan' ? 'Saving...' : 'Save Changes'}
        </AppButton>
      ) : activeScreen === 'providers' && providerView === 'workspace' && activeProviderSection === 'config' ? (
        <AppButton
          variant="primary"
          size="utility"
          onClick={() => void saveProvider(selectedProvider)}
          disabled={busyAction.includes('save')}
        >
          {busyAction.includes('save') ? 'Saving…' : 'Save'}
        </AppButton>
      ) : activeScreen === 'providers' && providerView === 'workspace' && activeProviderSection === 'store' ? (
        <AppButton
          variant="primary"
          size="utility"
          onClick={() => void fetchPrices(selectedProvider)}
          disabled={busyAction.includes('prices')}
        >
          {busyAction.includes('prices') ? 'Loading…' : 'Load Prices'}
        </AppButton>
      ) : activeScreen === 'providers' && providerView === 'list' ? (
        <AppButton
          variant="primary"
          size="utility"
          onClick={() => void reloadProviders()}
          disabled={busyAction === 'reload'}
        >
          {busyAction === 'reload' ? 'Reloading…' : 'Reload Providers'}
        </AppButton>
      ) : activeScreen === 'settings' ? (
        <AppButton variant="primary" size="utility" onClick={() => void openAppConfigDirectory()}>
          Open Folder
        </AppButton>
      ) : activeScreen === 'logs' ? (
        <AppButton
          variant="primary"
          size="utility"
          onClick={() => void loadSnapshot()}
        >
          Refresh
        </AppButton>
      ) : activeScreen === 'providers' && providerView === 'workspace' ? null : (
        <AppButton variant="primary" size="utility" onClick={openActivationModal}>
          <Plus size={14} />
          <span>New Activation</span>
        </AppButton>
      )}
    </>
  );

  return (
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
        compact={compactTables}
        noPadding={activeScreen === 'providers' && providerView === 'workspace'}
        contentClassName="max-[760px]:pt-5"
      >
            {activeScreen === 'overview' && (
              <OverviewScreen
                stats={overviewStats}
                activity={recentActivity}
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
                providerOptions={providerOptions}
                serviceOptions={routingServiceOptions}
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
                onOpenItemSelector={(itemId, field) => void openRoutingItemSelector(itemId, field, 'editor')}
                onAddItem={addRoutingPlanItem}
                onRemoveItem={removeRoutingPlanItem}
                onReorderItem={reorderRoutingPlanItem}
                onOpenItemEditor={openRoutingItemEditor}
                onCloseItemEditor={closeRoutingItemEditor}
                onItemEditorChange={updateRoutingItemEditor}
                onApplyItemEditor={applyRoutingItemEditor}
                onLoadItemPriceOptions={() => void loadRoutingItemPriceOptions()}
                onUseItemPriceQuickFill={quickFillRoutingItemPrice}
                busyAction={busyAction}
              />
            )}

            {activeScreen === 'providers' && providerView === 'workspace' && selectedManifest && (
              <ProviderWorkspaceScreen
                key={selectedProvider}
                manifest={selectedManifest}
                summary={selectedSummary}
                section={activeProviderSection}
                compact={compactTables}
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
                compactTables={compactTables}
                setCompactTables={setCompactTables}
                language={language}
                setLanguage={setLanguage}
                appearanceTheme={appearanceTheme}
                setAppearanceTheme={setAppearanceTheme}
                optionCacheEnabled={runtimeSettings.option_cache_enabled}
                optionCachePollIntervalMinutes={runtimeSettings.option_cache_poll_interval_minutes}
                optionCacheOverview={optionCacheOverview}
                onOptionCacheEnabledChange={(enabled) =>
                  void updateRuntimeSettings({
                    routing_strategy: runtimeSettings.routing_strategy,
                    auto_fallback: runtimeSettings.auto_fallback,
                    option_cache_enabled: enabled,
                    option_cache_poll_interval_minutes: runtimeSettings.option_cache_poll_interval_minutes,
                  })}
                onOptionCachePollIntervalChange={(minutes) =>
                  void updateRuntimeSettings({
                    routing_strategy: runtimeSettings.routing_strategy,
                    auto_fallback: runtimeSettings.auto_fallback,
                    option_cache_enabled: runtimeSettings.option_cache_enabled,
                    option_cache_poll_interval_minutes: minutes,
                  })}
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
                  filters={LOG_FILTERS}
                  search={logsSearch}
                  onSearch={setLogsSearch}
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
          onClose={() => setSelectorState(null)}
          onSearch={setSelectorSearch}
          onSelect={(option) => {
            if (selectorState.kind.startsWith('routing-item-')) {
              applyRoutingSelectorOption(option);
              return;
            }
            if (selectorState.kind === 'routing-service') {
              const plan = routingPlans.find((item) => selectedRoutingPlanMatcher(item));
              if (plan) updateRoutingPlanDraft({ ...plan, service: option.value });
              setSelectorState(null);
              return;
            }
            if (activationRoutingPlanPickerOpen && selectorState.kind === 'activation-routing-plan') {
              setActivationForm((current) => ({
                ...current,
                routing_plan_id: option.value,
                service: option.value
                  ? routingPlans.find((plan) => plan.id === option.value)?.service ?? current.service
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
  );
}
