import {
  Bell,
  ChevronLeft,
  LayoutDashboard,
  MessageSquare,
  Plus,
  Shuffle,
  Server,
  Settings,
  Sliders,
  ShoppingCart,
  Terminal,
  Wallet,
} from 'lucide-react';
import {
  AppShell,
  AppSidebar,
  AppToolbar,
} from '../components/composites';
import { NotificationPopover } from '../components/overlays';
import { IconButton } from '../components/primitives';
import { LogsScreen } from '../app/logs/LogsScreen';
import { MessagesScreen } from '../app/messages/MessagesScreen';
import { NewActivationModal } from '../app/overlays/NewActivationModal';
import { OverviewScreen } from '../app/overview/OverviewScreen';
import { ProviderWorkspaceScreen } from '../app/providers/ProviderWorkspaceScreen';
import { ProvidersListScreen } from '../app/providers/ProvidersListScreen';
import { RoutingScreen } from '../app/routing/RoutingScreen';
import { SettingsScreen } from '../app/settings/SettingsScreen';
import { AppButton } from '../app/ui-bridge';
import type {
  ActivationFormState,
  LogEntry,
  LogFilter,
  MessageFilter,
  NotificationFeed,
  OptionItem,
  ProviderDynamicOptions,
  ProviderManifest,
  ProviderPriceItem,
  ProviderSectionId,
  ProviderSummary,
  RoutingPlan,
  RoutingPlanFilter,
  ScreenId,
  TicketRecord,
} from '../app/types';

export type ScreenshotTarget =
  | 'Overview'
  | 'Providers'
  | 'ProviderWorkspace_Config'
  | 'ProviderWorkspace_Store'
  | 'ProviderWorkspace_Wallet'
  | 'Routing'
  | 'Messages'
  | 'Settings'
  | 'Logs'
  | 'Notifications'
  | 'NewActivation';

type CanvasSpec = {
  width: number;
  height: number;
  padding: number;
};

type SidebarItem = {
  id: ScreenId;
  label: string;
  icon: typeof LayoutDashboard;
};

const CANVAS_SPECS: Record<ScreenshotTarget, CanvasSpec> = {
  Overview: { width: 1104, height: 848, padding: 40 },
  Providers: { width: 1104, height: 848, padding: 40 },
  ProviderWorkspace_Config: { width: 1104, height: 848, padding: 40 },
  ProviderWorkspace_Store: { width: 1104, height: 848, padding: 40 },
  ProviderWorkspace_Wallet: { width: 1104, height: 848, padding: 40 },
  Routing: { width: 1104, height: 848, padding: 40 },
  Messages: { width: 1104, height: 848, padding: 40 },
  Settings: { width: 1104, height: 848, padding: 40 },
  Logs: { width: 1104, height: 848, padding: 40 },
  Notifications: { width: 368, height: 349, padding: 0 },
  NewActivation: { width: 544, height: 546, padding: 0 },
};

const NAV_ITEMS: SidebarItem[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'providers', label: 'Providers', icon: Server },
  { id: 'routing', label: 'Routing', icon: Shuffle },
  { id: 'messages', label: 'Messages', icon: MessageSquare },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'logs', label: 'Logs', icon: Terminal },
];

const MESSAGE_FILTERS: Array<{ id: MessageFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'received', label: 'Received' },
  { id: 'waiting', label: 'Waiting' },
  { id: 'failed', label: 'Failed' },
];

const LOG_FILTERS: Array<{ id: LogFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'info', label: 'Info' },
  { id: 'warn', label: 'Warn' },
  { id: 'error', label: 'Error' },
];

const PROVIDERS: ProviderManifest[] = [
  {
    id: 'fivesim',
    name: 'FiveSim',
    kind: 'five_sim',
    enabled: true,
    priority: 1,
    homepage: 'https://5sim.net',
    description: 'Primary marketplace provider for global OTP supply.',
    service_aliases: {},
    defaults: {
      service: 'openai',
      country: 'usa',
      auto_pick_country: true,
      verify_on_register: false,
      reuse_phone: true,
      max_price: 4,
      min_price: 0,
      min_balance: 10,
      max_tries: 3,
      poll_timeout_sec: 180,
      reuse_max: 2,
    },
    five_sim: {
      base_url: 'https://5sim.net/v1',
    },
  },
  {
    id: 'herosms',
    name: 'HeroSMS',
    kind: 'handler_api',
    enabled: false,
    priority: 2,
    homepage: 'https://internal.example/herosms',
    description: 'Fallback private gateway for Telegram-heavy traffic.',
    service_aliases: {},
    defaults: {
      service: 'telegram',
      country: 'england',
      auto_pick_country: false,
      verify_on_register: false,
      reuse_phone: true,
      max_price: 3,
      min_price: 0,
      min_balance: 8,
      max_tries: 2,
      poll_timeout_sec: 120,
      reuse_max: 2,
    },
    handler_api: {
      base_url: 'https://hero.internal/api',
    },
  },
  {
    id: 'smsbower',
    name: 'SMSBower',
    kind: 'handler_api',
    enabled: true,
    priority: 3,
    homepage: 'https://internal.example/smsbower',
    description: 'Backup lane used for WhatsApp and regional overflow.',
    service_aliases: {},
    defaults: {
      service: 'whatsapp',
      country: 'germany',
      auto_pick_country: false,
      verify_on_register: false,
      reuse_phone: false,
      max_price: 5,
      min_price: 0,
      min_balance: 5,
      max_tries: 2,
      poll_timeout_sec: 180,
      reuse_max: 1,
    },
    handler_api: {
      base_url: 'https://bower.internal/api',
    },
  },
];

const PROVIDER_SUMMARIES: ProviderSummary[] = [
  {
    id: 'fivesim',
    name: 'FiveSim',
    enabled: true,
    kind: 'five_sim',
    protocol: '5SIM REST',
    primary_endpoint: 'https://5sim.net/v1',
    default_service: 'openai',
    default_country: 'usa',
    homepage: 'https://5sim.net',
    description: 'Primary marketplace provider for global OTP supply.',
    priority: 1,
    option_cache_state: 'fresh',
    can_enable: true,
  },
  {
    id: 'herosms',
    name: 'HeroSMS',
    enabled: false,
    kind: 'handler_api',
    protocol: 'handler_api',
    primary_endpoint: 'https://hero.internal/api',
    default_service: 'telegram',
    default_country: 'england',
    homepage: 'https://internal.example/herosms',
    description: 'Fallback private gateway for Telegram-heavy traffic.',
    priority: 2,
    option_cache_state: 'stale',
    can_enable: false,
  },
  {
    id: 'smsbower',
    name: 'SMSBower',
    enabled: true,
    kind: 'handler_api',
    protocol: 'handler_api',
    primary_endpoint: 'https://bower.internal/api',
    default_service: 'whatsapp',
    default_country: 'germany',
    homepage: 'https://internal.example/smsbower',
    description: 'Backup lane used for WhatsApp and regional overflow.',
    priority: 3,
    option_cache_state: 'fresh',
    can_enable: true,
  },
];

const TICKETS: TicketRecord[] = [
  {
    id: 'T-0048',
    provider: 'fivesim',
    service: 'openai',
    country: 'usa',
    phone_number: '+1 (555) 019-2834',
    status: 'CodeReceived',
    price: 0.04,
    code: '395776',
    message: 'SMS received successfully',
  },
  {
    id: 'T-0047',
    provider: 'herosms',
    service: 'telegram',
    country: 'england',
    phone_number: '+44 7700 900077',
    status: 'WaitingCode',
    price: 0.02,
    code: null,
    message: 'Check provider dashboard',
  },
  {
    id: 'T-0046',
    provider: 'smsbower',
    service: 'paypal',
    country: 'australia',
    phone_number: '+61 7000 000000',
    status: 'Expired',
    price: null,
    code: null,
    message: 'You were not charged for this request.',
    routing_plan_id: 'openai-plan',
    routing_plan_name: 'OpenGPT Plan 1',
    routing_item_id: 'fivesim-us',
    routing_item_index: 1,
  },
];

const OVERVIEW_ACTIVITY: TicketRecord[] = [
  {
    id: 'OA-1',
    provider: 'fivesim',
    service: 'openai',
    country: 'usa',
    phone_number: '+1 (555) 019-2834',
    status: 'Delivered',
    price: null,
    code: null,
    message: null,
  },
  {
    id: 'OA-2',
    provider: 'herosms',
    service: 'telegram',
    country: 'england',
    phone_number: '+44 7700 900077',
    status: 'Pending',
    price: null,
    code: null,
    message: null,
  },
  {
    id: 'OA-3',
    provider: 'smsbower',
    service: 'whatsapp',
    country: 'australia',
    phone_number: '+61 7000 000000',
    status: 'Failed',
    price: null,
    code: null,
    message: null,
  },
];

const LOGS: LogEntry[] = [
  {
    timestamp: '2026-05-03T14:23:05.123Z',
    scope: 'provider',
    level: 'error',
    message: 'failed to acquire from FiveSim: rate limit exceeded (429)',
  },
  {
    timestamp: '2026-05-03T14:23:04.891Z',
    scope: 'router',
    level: 'warn',
    message: 'HeroSMS returned 0 stock for telegram/any, falling back to next provider',
  },
  {
    timestamp: '2026-05-03T14:23:02.344Z',
    scope: 'acquire',
    level: 'info',
    message: 'ticket T-0048 acquired via FiveSim — +86 188 0010 1234',
  },
  {
    timestamp: '2026-05-03T14:22:58.012Z',
    scope: 'poll',
    level: 'error',
    message: 'poll timeout after 120s for ticket T-0047, status set to Expired',
  },
  {
    timestamp: '2026-05-03T14:22:45.789Z',
    scope: 'provider',
    level: 'info',
    message: 'provider SMSBower hot-reloaded (3 aliases registered)',
  },
  {
    timestamp: '2026-05-03T14:22:30.456Z',
    scope: 'wallet',
    level: 'warn',
    message: 'FiveSim balance below threshold: $0.42 remaining',
  },
];

const NOTIFICATIONS: NotificationFeed = {
  items: [
    {
      timestamp: '2026-05-03T14:23:05.123Z',
      scope: 'provider',
      level: 'error',
      message: 'FiveSim rate limit exceeded while acquiring telegram/usa.',
    },
    {
      timestamp: '2026-05-03T14:22:50.000Z',
      scope: 'router',
      level: 'warn',
      message: 'Auto-fallback used HeroSMS after stock lookup returned empty.',
    },
    {
      timestamp: '2026-05-03T14:22:05.000Z',
      scope: 'provider',
      level: 'info',
      message: 'SMSBower hot-reload complete with 3 aliases registered.',
    },
    {
      timestamp: '2026-05-03T14:21:30.000Z',
      scope: 'wallet',
      level: 'info',
      message: 'Balance refresh finished for FiveSim.',
    },
  ],
};

const PROVIDER_OPTIONS: Record<string, ProviderDynamicOptions> = {
  fivesim: {
    provider: 'fivesim',
    services: [
      { value: 'telegram', label: 'Telegram', hint: 'Top demand' },
      { value: 'openai', label: 'OpenAI (ChatGPT)', hint: 'Stable supply' },
      { value: 'paypal', label: 'PayPal', hint: 'Finance' },
    ],
    countries: [
      { value: 'usa', label: 'usa', hint: 'High stock' },
      { value: 'england', label: 'uk', hint: 'Premium' },
      { value: 'germany', label: 'germany', hint: 'Regional' },
    ],
    operators: [
      { value: 'verizon', label: 'verizon', hint: 'US' },
      { value: 'vodafone', label: 'vodafone', hint: 'EU' },
      { value: 'o2', label: 'o2', hint: 'UK' },
    ],
  },
  herosms: {
    provider: 'herosms',
    services: [
      { value: 'telegram', label: 'Telegram', hint: 'Fallback' },
      { value: 'discord', label: 'Discord', hint: 'Community' },
    ],
    countries: [
      { value: 'england', label: 'uk', hint: 'Primary' },
      { value: 'usa', label: 'usa', hint: 'Fallback' },
    ],
    operators: [
      { value: 'ee', label: 'ee', hint: 'UK' },
      { value: 'vodafone', label: 'vodafone', hint: 'UK' },
    ],
  },
  smsbower: {
    provider: 'smsbower',
    services: [
      { value: 'whatsapp', label: 'WhatsApp', hint: 'Primary' },
      { value: 'telegram', label: 'Telegram', hint: 'Overflow' },
    ],
    countries: [
      { value: 'germany', label: 'germany', hint: 'Primary' },
      { value: 'australia', label: 'australia', hint: 'Overflow' },
    ],
    operators: [
      { value: 'telefonica', label: 'telefonica', hint: 'DE' },
      { value: 'vodafone', label: 'vodafone', hint: 'DE' },
    ],
  },
};

const ROUTING_PLANS: RoutingPlan[] = [
  {
    id: 'openai-plan',
    name: 'OpenGPT Plan 1',
    service: 'openai',
    description: 'Primary acquisition plan for OpenAI-style services.',
    enabled: true,
    execution_mode: 'sequential',
    items: [
      {
        id: 'hero-ca',
        provider: 'herosms',
        country: 'canada',
        operator: '',
        enabled: true,
        price_mode: 'range',
        min_price: 0.5,
        max_price: 1.0,
        fixed_price: null,
      },
      {
        id: 'fivesim-us',
        provider: 'fivesim',
        country: 'usa',
        operator: 'verizon',
        enabled: true,
        price_mode: 'fixed',
        min_price: 0.889,
        max_price: 0.889,
        fixed_price: 0.889,
      },
    ],
  },
];

const PRICE_ITEMS: ProviderPriceItem[] = [
  { country: 'usa', display_name: 'United States', operator: 'verizon', price: 0.889, stock: 1420 },
  { country: 'england', display_name: 'United Kingdom', operator: 'o2', price: 1.129, stock: 884 },
  { country: 'germany', display_name: 'Germany', operator: 'vodafone', price: 0.942, stock: 616 },
  { country: 'australia', display_name: 'Australia', operator: 'optus', price: 1.488, stock: 194 },
  { country: 'canada', display_name: 'Canada', operator: 'rogers', price: 1.031, stock: 402 },
  { country: 'japan', display_name: 'Japan', operator: 'softbank', price: 1.904, stock: 74 },
];

const ACTIVATION_FORM: ActivationFormState = {
  service: '',
  country: '',
  provider: '',
  routing_plan_id: '',
  operator: 'any',
  min_price: '',
  max_price: '',
};

const ROUTING_FILTER: RoutingPlanFilter = 'all';

function noop() {}

function notificationMeta(scope: string, time: string) {
  return (
    <span className="inline-flex items-center gap-1">
      <span>{scope}</span>
      <span>·</span>
      <span>{time}</span>
    </span>
  );
}

function buildToolbarActions() {
  return (
    <>
      <div className="relative">
        <IconButton
          variant="toolbar"
          icon={(
            <span className="relative inline-flex h-4 w-[22px] items-center justify-center">
              <Bell size={16} className="opacity-60" />
              <span className="absolute right-0 top-0 h-2 w-2 rounded-pill border border-white bg-[#e0443e]" />
            </span>
          )}
          aria-label="Notifications"
        />
      </div>
      <AppButton variant="primary" size="utility">
        <Plus size={14} />
        <span>New Activation</span>
      </AppButton>
    </>
  );
}

function buildShell(
  screen: ScreenId,
  title: string,
  content: React.ReactNode,
  options?: {
    navigation?: React.ReactNode;
    compact?: boolean;
  },
) {
  return (
    <AppShell
      fillViewport={false}
      sidebar={(
        <AppSidebar
          items={NAV_ITEMS}
          activeId={screen}
          onToggleCollapsed={noop}
          onSelect={noop}
        />
      )}
      windowClassName="h-[768px] w-[1024px] rounded-[10px] border border-black/10 shadow-[0_10px_40px_rgba(0,0,0,0.2)]"
      toolbar={(
        <AppToolbar
          title={title}
          navigation={options?.navigation ?? <PanelLeft size={16} className="opacity-60" />}
          actions={buildToolbarActions()}
        />
      )}
      compact={options?.compact}
    >
      {content}
    </AppShell>
  );
}

function renderPageTarget(target: ScreenshotTarget) {
  if (target === 'Overview') {
    return buildShell(
      'overview',
      'Overview',
      <OverviewScreen
        stats={{
          totalMessages: '0',
          activeProviders: '2',
          successRate: '100.0%',
        }}
        activity={[]}
        onViewAll={noop}
      />,
    );
  }

  if (target === 'Providers') {
    return buildShell(
      'providers',
      'Providers',
      <ProvidersListScreen
        providers={PROVIDERS}
        summaries={PROVIDER_SUMMARIES}
        onConfigure={noop}
        onReorder={noop}
        onToggleEnabled={noop}
      />,
    );
  }

  if (target === 'ProviderWorkspace_Config') {
    return buildShell(
      'providers',
      'Providers › SMSBower',
      <ProviderWorkspaceScreen
        manifest={PROVIDERS[2]}
        summary={PROVIDER_SUMMARIES[2]}
        section="config"
        compact={false}
        prices={PRICE_ITEMS}
        balanceLabel="7.81 USD"
        busyAction=""
        rawEditor={JSON.stringify(PROVIDERS[2], null, 2)}
        showAdvancedEditor
        apiKeyValue="••••••••••••••••••••••••••••••••••"
        onSelectSection={noop}
        onManifestFieldChange={noop}
        onApiKeyChange={noop}
        onToggleEnabled={noop}
        onFetchBalance={noop}
        onFetchPrices={noop}
        onSave={noop}
        onOpenRawJson={noop}
        onOpenSelector={noop}
        storeQuery={{ service: 'openai', country: '', operator: '', search: '' }}
        onStoreQueryChange={noop}
        onSortPrices={noop}
        priceSort={{ key: 'country', dir: 'asc' }}
      />,
      {
        navigation: (
          <>
            <PanelLeft size={16} className="opacity-60" />
            <button
              type="button"
              aria-label="Back to providers"
              className="inline-flex h-7 w-7 items-center justify-center rounded-pill text-ds-text-secondary"
            >
              <ChevronLeft size={16} />
            </button>
          </>
        ),
      },
    );
  }

  if (target === 'ProviderWorkspace_Store') {
    return buildShell(
      'providers',
      'Providers › SMSBower',
      <ProviderWorkspaceScreen
        manifest={PROVIDERS[2]}
        summary={PROVIDER_SUMMARIES[2]}
        section="store"
        compact={false}
        prices={[]}
        balanceLabel="7.81 USD"
        busyAction=""
        rawEditor={JSON.stringify(PROVIDERS[2], null, 2)}
        showAdvancedEditor
        apiKeyValue="••••••••••••••••••••••••••••••••••"
        onSelectSection={noop}
        onManifestFieldChange={noop}
        onApiKeyChange={noop}
        onToggleEnabled={noop}
        onFetchBalance={noop}
        onFetchPrices={noop}
        onSave={noop}
        onOpenRawJson={noop}
        onOpenSelector={noop}
        storeQuery={{ service: 'openai', country: '', operator: '', search: '' }}
        onStoreQueryChange={noop}
        onSortPrices={noop}
        priceSort={{ key: 'country', dir: 'asc' }}
      />,
      {
        navigation: (
          <>
            <PanelLeft size={16} className="opacity-60" />
            <button
              type="button"
              aria-label="Back to providers"
              className="inline-flex h-7 w-7 items-center justify-center rounded-pill text-ds-text-secondary"
            >
              <ChevronLeft size={16} />
            </button>
          </>
        ),
      },
    );
  }

  if (target === 'ProviderWorkspace_Wallet') {
    return buildShell(
      'providers',
      'Providers › SMSBower',
      <ProviderWorkspaceScreen
        manifest={PROVIDERS[2]}
        summary={PROVIDER_SUMMARIES[2]}
        section="wallet"
        prices={PRICE_ITEMS}
        balanceLabel="7.81 USD"
        busyAction=""
        rawEditor={JSON.stringify(PROVIDERS[2], null, 2)}
        showAdvancedEditor
        apiKeyValue="••••••••••••••••••••••••••••••••••"
        onSelectSection={noop}
        onManifestFieldChange={noop}
        onApiKeyChange={noop}
        onToggleEnabled={noop}
        onFetchBalance={noop}
        onFetchPrices={noop}
        onSave={noop}
        onOpenRawJson={noop}
        onOpenSelector={noop}
        storeQuery={{ service: 'openai', country: '', operator: '', search: '' }}
        onStoreQueryChange={noop}
        onSortPrices={noop}
        priceSort={{ key: 'country', dir: 'asc' }}
      />,
      {
        navigation: (
          <>
            <PanelLeft size={16} className="opacity-60" />
            <button
              type="button"
              aria-label="Back to providers"
              className="inline-flex h-7 w-7 items-center justify-center rounded-pill text-ds-text-secondary"
            >
              <ChevronLeft size={16} />
            </button>
          </>
        ),
      },
    );
  }

  if (target === 'Messages') {
    return buildShell(
      'messages',
      'Messages',
      <MessagesScreen
        tickets={TICKETS}
        filter="all"
        setFilter={noop}
        filters={MESSAGE_FILTERS}
        busyAction=""
        onCopy={noop}
        onRelease={noop}
        onBuyAnother={noop}
      />,
    );
  }

  if (target === 'Routing') {
    return buildShell(
      'routing',
      'Routing Plans › OpenGPT Plan 1',
      <RoutingScreen
        view="detail"
        plans={ROUTING_PLANS}
        providers={PROVIDERS}
        providerOptions={PROVIDER_OPTIONS}
        serviceOptions={[{ id: 'openai', label: 'OpenAI (ChatGPT)' }, { id: 'telegram', label: 'Telegram' }]}
        selectedPlanId="openai-plan"
        routingFilter={ROUTING_FILTER}
        routingSearch=""
        itemEditor={null}
        itemEditorLoading={false}
        itemPriceOptions={PRICE_ITEMS}
        onSelectPlan={noop}
        onBackToList={noop}
        onCreatePlan={noop}
        onDeletePlan={noop}
        onUpdatePlan={noop}
        onUpdateRoutingFilter={noop}
        onUpdateRoutingSearch={noop}
        onOpenServicePicker={noop}
        onOpenProviderPicker={noop}
        onOpenItemSelector={noop}
        onAddItem={noop}
        onRemoveItem={noop}
        onReorderItem={noop}
        onOpenItemEditor={noop}
        onCloseItemEditor={noop}
        onItemEditorChange={noop}
        onApplyItemEditor={noop}
        onLoadItemPriceOptions={noop}
        onUseItemPriceQuickFill={noop}
        busyAction=""
      />,
      {
        navigation: (
          <button
            type="button"
            aria-label="Back to routing plans"
            className="inline-flex h-7 w-7 items-center justify-center rounded-pill text-ds-text-secondary"
          >
            <ChevronLeft size={16} />
          </button>
        ),
      },
    );
  }

  if (target === 'Settings') {
    return buildShell(
      'settings',
      'Settings',
      <SettingsScreen
        autoRefresh
        setAutoRefresh={noop}
        showAdvancedEditor
        setShowAdvancedEditor={noop}
        compactTables={false}
        setCompactTables={noop}
        language="en"
        setLanguage={noop}
        appearanceTheme="light"
        setAppearanceTheme={noop}
        optionCacheEnabled
        optionCachePollIntervalMinutes={30}
        optionCacheOverview={{ fresh_providers: 2, stale_providers: 1, missing_providers: 0, last_refresh_at: null }}
        onOptionCacheEnabledChange={noop}
        onOptionCachePollIntervalChange={noop}
        onReload={noop}
        reloadBusy={false}
        apiBase="http://127.0.0.1:7822"
        socketPath="/tmp/madao-sms.sock"
        configDirectory="~/Library/Application Support/com.madao.sms"
        onOpenConfigDirectory={noop}
      />,
    );
  }

  if (target === 'Logs') {
    return buildShell(
      'logs',
      'Logs',
      <LogsScreen
        logs={LOGS}
        filter="all"
        setFilter={noop}
        filters={LOG_FILTERS}
        onRefresh={noop}
        search=""
        onSearch={noop}
      />,
    );
  }

  return null;
}

function renderComponentTarget(target: ScreenshotTarget) {
  if (target === 'Notifications') {
    return (
      <NotificationPopover
        title="Notifications"
        markAllAction={<span className="text-[13px] font-normal text-ds-accent-focus">Mark all read</span>}
        items={[
          {
            id: 'n1',
            title: 'rate limit exceeded — failed to acquire from FiveSim',
            meta: notificationMeta('provider', 'just now'),
            level: 'danger',
          },
          {
            id: 'n2',
            title: 'HeroSMS returned 0 stock for telegram/any',
            meta: notificationMeta('routing', '1 min ago'),
            level: 'warning',
          },
          {
            id: 'n3',
            title: 'ticket T-0048 acquired via FiveSim',
            meta: notificationMeta('system', '2 min ago'),
            level: 'info',
          },
          {
            id: 'n4',
            title: 'SMSBower hot-reloaded (3 aliases registered)',
            meta: notificationMeta('system', '5 min ago'),
            level: 'info',
          },
        ]}
        footer={<span className="text-[13px] font-normal text-ds-accent-focus">View all in Logs →</span>}
      />
    );
  }

  if (target === 'NewActivation') {
    return (
      <NewActivationModal
        providers={PROVIDERS}
        routingPlans={ROUTING_PLANS}
        form={ACTIVATION_FORM}
        busy={false}
        error=""
        presentation="inline"
        operatorHint="FiveSim only"
        onChange={noop}
        onClose={noop}
        onSubmit={noop}
        onOpenSelector={noop}
        onOpenRoutingPlanSelector={noop}
      />
    );
  }

  return null;
}

function Canvas(props: {
  target: ScreenshotTarget;
  children: React.ReactNode;
}) {
  const spec = CANVAS_SPECS[props.target];
  const isComponentTarget = props.target === 'Notifications' || props.target === 'NewActivation';
  const justifyClass = isComponentTarget ? 'items-center justify-center' : 'items-start justify-start';

  return (
    <div
      data-screenshot-root={props.target}
      className={`flex overflow-hidden bg-transparent ${justifyClass}`}
      style={{
        width: spec.width,
        height: spec.height,
        padding: spec.padding,
      }}
    >
      {props.children}
    </div>
  );
}

export function getScreenshotTarget(): ScreenshotTarget | null {
  const params = new URLSearchParams(window.location.search);
  const value = params.get('target');
  if (!value) return null;
  if (value in CANVAS_SPECS) {
    return value as ScreenshotTarget;
  }
  return null;
}

export function ScreenshotScene() {
  const target = getScreenshotTarget();

  if (!target) {
    return null;
  }

  const content = target === 'Notifications' || target === 'NewActivation'
    ? renderComponentTarget(target)
    : renderPageTarget(target);

  if (!content) {
    return null;
  }

  return <Canvas target={target}>{content}</Canvas>;
}
