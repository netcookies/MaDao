import {
  Bell,
  ChevronLeft,
  LayoutDashboard,
  PanelLeft,
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
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AppShell,
  AppSidebar,
  AppToolbar,
} from '../components/composites';
import { NotificationPopover } from '../components/overlays';
import { IconButton } from '../components/primitives';
import { i18n } from '../app/i18n';
import { LanguageProvider } from '../app/language';
import { LogsScreen } from '../app/logs/LogsScreen';
import { MessagesScreen } from '../app/messages/MessagesScreen';
import { NewActivationModal } from '../app/overlays/NewActivationModal';
import { OverviewScreen } from '../app/overview/OverviewScreen';
import { ProviderWorkspaceScreen } from '../app/providers/ProviderWorkspaceScreen';
import { ProvidersListScreen } from '../app/providers/ProvidersListScreen';
import { RoutingScreen } from '../app/routing/RoutingScreen';
import { SettingsScreen } from '../app/settings/SettingsScreen';
import { AppButton } from '../app/ui-bridge';
import { formatScopeLabel } from '../lib/formatters';
import type {
  ActivityEntry,
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
  LanguageCode,
  UpdateCheckResult,
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

function getRequestedLanguage(): LanguageCode {
  const params = new URLSearchParams(window.location.search);
  const value = params.get('lang');
  return value === 'zh' ? 'zh' : 'en';
}

type CanvasSpec = {
  width: number;
  height: number;
  padding: number;
};

type SidebarItem = {
  id: ScreenId;
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
  { id: 'overview', icon: LayoutDashboard },
  { id: 'providers', icon: Server },
  { id: 'routing', icon: Shuffle },
  { id: 'messages', icon: MessageSquare },
  { id: 'settings', icon: Settings },
  { id: 'logs', icon: Terminal },
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
      country: 'US',
      auto_pick_country: true,
      verify_on_register: false,
      reuse_phone: true,
      max_price: 4,
      min_price: 0,
      min_balance: 10,
      max_tries: 3,
      poll_timeout_sec: 180,
      reuse_max: 2,
      reuse_ttl_hours: 24,
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
      country: 'GB',
      auto_pick_country: false,
      verify_on_register: false,
      reuse_phone: true,
      max_price: 3,
      min_price: 0,
      min_balance: 8,
      max_tries: 2,
      poll_timeout_sec: 120,
      reuse_max: 2,
      reuse_ttl_hours: 24,
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
      country: 'DE',
      auto_pick_country: false,
      verify_on_register: false,
      reuse_phone: false,
      max_price: 5,
      min_price: 0,
      min_balance: 5,
      max_tries: 2,
      poll_timeout_sec: 180,
      reuse_max: 1,
      reuse_ttl_hours: 24,
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
    default_country: 'US',
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
    protocol: 'herosms',
    primary_endpoint: 'https://hero.internal/api',
    default_service: 'telegram',
    default_country: 'GB',
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
    protocol: 'smsbower',
    primary_endpoint: 'https://bower.internal/api',
    default_service: 'whatsapp',
    default_country: 'DE',
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
      country: 'US',
    phone_number: '+1 (555) 019-2834',
    status: 'code_received',
    price: 0.04,
    code: '395776',
    message: 'SMS received successfully',
  },
  {
    id: 'T-0047',
    provider: 'herosms',
    service: 'telegram',
      country: 'GB',
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
    country: 'AU',
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

const OVERVIEW_ACTIVITY = [
  {
    id: 'OA-1',
    timestamp: '2026-05-03T14:24:00.000Z',
    kind: 'ticket_event',
    level: 'info',
    title: '工单 OA-1 获取成功',
    detail: 'provider=fivesim service=openai country=US',
    provider: 'fivesim',
    service: 'openai',
    country: 'US',
    ticket_id: 'OA-1',
  },
  {
    id: 'OA-2',
    timestamp: '2026-05-03T14:23:30.000Z',
    kind: 'release_event',
    level: 'warn',
    title: '自动取消已安排',
    detail: '等待冷却结束后自动执行取消',
    provider: 'herosms',
    service: 'telegram',
    country: 'GB',
    ticket_id: 'OA-2',
  },
  {
    id: 'OA-3',
    timestamp: '2026-05-03T14:23:10.000Z',
    kind: 'routing_event',
    level: 'error',
    title: '路由候选 mock-second 被跳过',
    detail: 'provider=smsbower item=mock-second round=1',
    provider: 'smsbower',
    service: 'whatsapp',
    country: 'AU',
    routing_plan_id: 'openai-plan',
    routing_plan_name: 'OpenGPT Plan 1',
    routing_item_id: 'mock-second',
    routing_round: 1,
    ticket_id: 'OA-3',
  },
] satisfies ActivityEntry[];

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
      message: 'FiveSim rate limit exceeded while acquiring telegram/US.',
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
      { value: 'US', label: 'United States', hint: 'High stock' },
      { value: 'GB', label: 'United Kingdom', hint: 'Premium' },
      { value: 'DE', label: 'Germany', hint: 'Regional' },
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
      { value: 'GB', label: 'United Kingdom', hint: 'Primary' },
      { value: 'US', label: 'United States', hint: 'Fallback' },
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
      { value: 'DE', label: 'Germany', hint: 'Primary' },
      { value: 'AU', label: 'Australia', hint: 'Overflow' },
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
    execution_rounds: 2,
    items: [
      {
        id: 'hero-ca',
        provider: 'herosms',
        country: 'CA',
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
        country: 'US',
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
  { country: 'US', display_name: 'United States', operator: 'verizon', price: 0.889, stock: 1420 },
  { country: 'GB', display_name: 'United Kingdom', operator: 'o2', price: 1.129, stock: 884 },
  { country: 'DE', display_name: 'Germany', operator: 'vodafone', price: 0.942, stock: 616 },
  { country: 'AU', display_name: 'Australia', operator: 'optus', price: 1.488, stock: 194 },
  { country: 'CA', display_name: 'Canada', operator: 'rogers', price: 1.031, stock: 402 },
  { country: 'JP', display_name: 'Japan', operator: 'softbank', price: 1.904, stock: 74 },
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
      <span>{formatScopeLabel(scope, getRequestedLanguage())}</span>
      <span>·</span>
      <span>{time}</span>
    </span>
  );
}

function buildToolbarActions(
  t: (key: string, options?: Record<string, unknown>) => string,
  updateCheckResult?: UpdateCheckResult,
) {
  return (
    <>
      {updateCheckResult?.has_update ? (
        <button
          type="button"
          className="inline-flex min-h-control-compact items-center rounded-pill bg-[var(--ds-color-state-warning-soft)] px-3 py-1.5 font-text text-[12px] font-semibold leading-none text-ds-state-warning"
        >
          {t('Update v{{version}}', { version: updateCheckResult.latest_version })}
        </button>
      ) : null}
      <div className="relative">
        <IconButton
          variant="toolbar"
          icon={(
            <span className="relative inline-flex h-4 w-[22px] items-center justify-center">
              <Bell size={16} className="opacity-60" />
              <span className="absolute right-0 top-0 h-2 w-2 rounded-pill border border-white bg-[#e0443e]" />
            </span>
          )}
          aria-label={t('Notifications')}
        />
      </div>
      <AppButton variant="primary" size="utility">
        <Plus size={14} />
        <span>{t('New Activation')}</span>
      </AppButton>
    </>
  );
}

function getDemoUpdateCheckResult(): UpdateCheckResult {
  return {
    current_version: '0.1.20',
    latest_version: '0.1.21',
    has_update: true,
    installable: true,
    unsupported_reason: null,
    release_name: 'v0.1.21',
    release_url: 'https://github.com/netcookies/MaDao/releases/tag/v0.1.21',
    published_at: '2026-05-29T00:00:00Z',
  };
}

function buildShell(
  t: (key: string, options?: Record<string, unknown>) => string,
  screen: ScreenId,
  title: string,
  content: React.ReactNode,
  options?: {
    navigation?: React.ReactNode;
    compact?: boolean;
    updateCheckResult?: UpdateCheckResult;
  },
) {
  return (
    <AppShell
      fillViewport={false}
      sidebar={(
        <AppSidebar
          items={NAV_ITEMS.map(({ id, icon }) => ({ id, label: t(id === 'overview' ? 'Overview' : id === 'providers' ? 'Providers' : id === 'routing' ? 'Routing' : id === 'messages' ? 'Messages' : id === 'settings' ? 'Settings' : 'Activity'), icon }))}
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
          actions={buildToolbarActions(t, options?.updateCheckResult)}
        />
      )}
      compact={options?.compact}
    >
      {content}
    </AppShell>
  );
}

function renderPageTarget(target: ScreenshotTarget, t: (key: string, options?: Record<string, unknown>) => string) {
  if (target === 'Overview') {
    return buildShell(
      t,
      'overview',
      t('Overview'),
      <OverviewScreen
        stats={{
          totalMessages: '0',
          activeProviders: '2',
          successRate: '100.0%',
        }}
        activity={[]}
        providers={{}}
        decorations={{}}
        statistics={{
          services: [
            {
              service: 'openai',
              serviceLabel: 'OpenAI (GPT)',
              serviceIconUrl: null,
              totalAttempts: 6,
              successCount: 0,
              failCount: 6,
            },
            {
              service: 'telegram',
              serviceLabel: 'Telegram',
              serviceIconUrl: null,
              totalAttempts: 4,
              successCount: 3,
              failCount: 1,
            },
          ],
          bestRoutes: [
            {
              country: 'AT',
              countryLabel: 'Austria',
              countryIconUrl: null,
              provider: 'herosms',
              providerLabel: 'HeroSMS',
              providerIconUrl: null,
              providerBadgeLabel: 'H',
              route: 'any',
              routeLabel: t('Any operator'),
              value: '0.0%',
              rank: 1,
            },
          ],
          cheapestRoutes: [
            {
              country: 'US',
              countryLabel: 'United States',
              countryIconUrl: null,
              provider: 'fivesim',
              providerLabel: 'FiveSim',
              providerIconUrl: null,
              providerBadgeLabel: '5',
              route: 'any',
              routeLabel: t('Any operator'),
              value: '¥0.62',
              rank: 1,
            },
          ],
          fastestRoutes: [
            {
              country: 'GB',
              countryLabel: 'United Kingdom',
              countryIconUrl: null,
              provider: 'smsbower',
              providerLabel: 'SMSBower',
              providerIconUrl: null,
              providerBadgeLabel: 'S',
              route: 'vodafone',
              routeLabel: 'Vodafone',
              value: '42s',
              rank: 1,
            },
          ],
          selectedService: 'openai',
          selectedServiceLabel: 'OpenAI (GPT)',
          onServiceSelect: noop,
          lookback: '24h',
          onLookbackChange: noop,
          layout: 'app',
        }}
        onViewAll={noop}
      />,
    );
  }

  if (target === 'Providers') {
    return buildShell(
      t,
      'providers',
      t('Providers'),
      <ProvidersListScreen
        providers={PROVIDERS}
        summaries={PROVIDER_SUMMARIES}
        onConfigure={noop}
        onRefreshBalance={noop}
        onReorder={noop}
        onToggleEnabled={noop}
      />,
    );
  }

  if (target === 'ProviderWorkspace_Config') {
    return buildShell(
      t,
      'providers',
      `${t('Providers')} › SMSBower`,
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
        onRefresh={noop}
        onFetchPrices={noop}
        onSave={noop}
        onClearReusePool={noop}
        onOpenRawJson={noop}
        onOpenSelector={noop}
        storeQuery={{ service: 'openai', country: '', operator: '', search: '' }}
        serviceIconUrls={{ openai: 'https://smsbower.app/img/services/247.svg?timestamp=1748774536' }}
        countryIconUrls={{ '31': 'https://smsbower.app/img/svg/countries/31.svg?v=2' }}
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
              aria-label={t('Back to providers')}
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
      t,
      'providers',
      `${t('Providers')} › SMSBower`,
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
        onRefresh={noop}
        onFetchPrices={noop}
        onSave={noop}
        onClearReusePool={noop}
        onOpenRawJson={noop}
        onOpenSelector={noop}
        storeQuery={{ service: 'openai', country: '', operator: '', search: '' }}
        serviceIconUrls={{ openai: 'https://smsbower.app/img/services/247.svg?timestamp=1748774536' }}
        countryIconUrls={{ '31': 'https://smsbower.app/img/svg/countries/31.svg?v=2' }}
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
              aria-label={t('Back to providers')}
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
      t,
      'providers',
      `${t('Providers')} › SMSBower`,
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
        onRefresh={noop}
        onFetchPrices={noop}
        onSave={noop}
        onClearReusePool={noop}
        onOpenRawJson={noop}
        onOpenSelector={noop}
        storeQuery={{ service: 'openai', country: '', operator: '', search: '' }}
        serviceIconUrls={{ openai: 'https://smsbower.app/img/services/247.svg?timestamp=1748774536' }}
        countryIconUrls={{ '31': 'https://smsbower.app/img/svg/countries/31.svg?v=2' }}
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
              aria-label={t('Back to providers')}
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
      t,
      'messages',
      t('Messages'),
      <MessagesScreen
        tickets={TICKETS}
        filter="all"
        setFilter={noop}
        filters={[
          { id: 'all', label: t('All') },
          { id: 'received', label: t('Received') },
          { id: 'waiting', label: t('Pending') },
          { id: 'failed', label: t('Failed') },
        ]}
        busyAction=""
        onCopy={noop}
        onRelease={noop}
        onBuyAnother={noop}
      />,
    );
  }

  if (target === 'Routing') {
    return buildShell(
      t,
      'routing',
      `${t('Routing Plans')} › OpenGPT Plan 1`,
      <RoutingScreen
        view="detail"
        plans={ROUTING_PLANS}
        providers={PROVIDERS}
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
        onDuplicatePlan={noop}
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
        onUseItemExactPrice={noop}
        onDuplicateItem={noop}
        busyAction=""
      />,
      {
        navigation: (
          <button
            type="button"
            aria-label={t('Back to routing plans')}
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
      t,
      'settings',
      t('Settings'),
      <SettingsScreen
        autoRefresh
        setAutoRefresh={noop}
        showAdvancedEditor
        setShowAdvancedEditor={noop}
        language={getRequestedLanguage()}
        setLanguage={noop}
        appearanceTheme="light"
        setAppearanceTheme={noop}
        optionCacheEnabled
        optionCachePollIntervalMinutes={30}
        optionCacheOverview={{ fresh_providers: 2, stale_providers: 1, missing_providers: 0, last_refresh_at: null }}
        onlyShowOpenAiSmsCountries={false}
        checkUpdatesOnLaunch
        updateCheckBusy={false}
        updateInstallBusy={false}
        updateCheckResult={getDemoUpdateCheckResult()}
        isDesktopRuntime
        isWebRuntime={false}
        httpPort={7822}
        httpSecret="demo-secret"
        httpSecretOverridden={false}
        onOptionCacheEnabledChange={noop}
        onOptionCachePollIntervalChange={noop}
        onOnlyShowOpenAiSmsCountriesChange={noop}
        onCheckUpdatesOnLaunchChange={noop}
        onInstallUpdate={noop}
        onOpenUpdateRelease={noop}
        onHttpPortChange={noop}
        onRegenerateHttpSecret={noop}
        regenerateSecretBusy={false}
        onCheckForUpdates={noop}
        statsSyncEnabled
        onStatsSyncEnabledChange={noop}
        onSyncStatsNow={noop}
        syncStatsBusy={false}
        apiBase="http://127.0.0.1:7822"
        socketPath="/tmp/madao-sms.sock"
        configDirectory="~/Library/Application Support/com.madao.sms"
      />,
      { updateCheckResult: getDemoUpdateCheckResult() },
    );
  }

  if (target === 'Logs') {
    return buildShell(
      t,
      'logs',
      t('Activity'),
      <LogsScreen
        logs={LOGS}
        activity={OVERVIEW_ACTIVITY}
        providers={Object.fromEntries(PROVIDERS.map((provider) => [provider.id, provider]))}
        decorations={{}}
        viewMode="activity"
        setViewMode={noop}
        filter="all"
        setFilter={noop}
        filters={[
          { id: 'all', label: t('All') },
          { id: 'info', label: t('Info') },
          { id: 'warn', label: t('Warn') },
          { id: 'error', label: t('Error') },
        ]}
        search=""
        onSearch={noop}
        onClearLogs={noop}
      />,
    );
  }

  return null;
}

function renderComponentTarget(target: ScreenshotTarget, t: (key: string, options?: Record<string, unknown>) => string) {
  if (target === 'Notifications') {
    return (
      <NotificationPopover
        title={t('Notifications')}
        markAllAction={<span className="text-[13px] font-normal text-ds-accent-focus">{t('Mark all read')}</span>}
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
        footer={<span className="text-[13px] font-normal text-ds-accent-focus">{t('View all in Logs →')}</span>}
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

export function getScreenshotLanguage(): LanguageCode {
  return getRequestedLanguage();
}

export function ScreenshotScene() {
  const language = getRequestedLanguage();
  const { t } = useTranslation();
  const target = getScreenshotTarget();

  useEffect(() => {
    if (i18n.language !== language) {
      void i18n.changeLanguage(language);
    }
  }, [language]);

  if (!target) {
    return null;
  }

  const content = target === 'Notifications' || target === 'NewActivation'
    ? renderComponentTarget(target, t)
    : renderPageTarget(target, t);

  if (!content) {
    return null;
  }

  return (
    <LanguageProvider language={language}>
      <Canvas target={target}>{content}</Canvas>
    </LanguageProvider>
  );
}
