export type ScreenId = 'overview' | 'providers' | 'routing' | 'messages' | 'settings' | 'logs';
export type ProviderSectionId = 'config' | 'store' | 'wallet';
export type MessageFilter = 'all' | 'received' | 'waiting' | 'failed';
export type LogFilter = 'all' | 'info' | 'warn' | 'error';
export type SelectorKind =
  | 'service'
  | 'country'
  | 'provider'
  | 'activation-provider'
  | 'store-service'
  | 'store-country'
  | 'store-operator'
  | 'activation-service'
  | 'activation-routing-plan'
  | 'activation-country'
  | 'activation-operator'
  | 'routing-service'
  | 'routing-item-provider'
  | 'routing-item-country'
  | 'routing-item-operator'
  | 'routing-item-price';
export type PriceSortKey = 'country' | 'price' | 'stock';
export type RoutingStrategy = 'ordered_priority' | 'lowest_price' | 'highest_stock';
export type AppearanceTheme = 'light' | 'dark' | 'system';
export type LanguageCode = 'en' | 'zh';

export type ProviderSummary = {
  id: string;
  name: string;
  enabled: boolean;
  kind: string;
  protocol: string;
  protocol_label?: string | null;
  primary_endpoint?: string | null;
  default_service: string;
  default_country: string;
  homepage?: string | null;
  description?: string | null;
  priority: number;
  icon_url?: string | null;
  badge_label?: string | null;
  cancel_cooldown_sec?: number | null;
  operator_selectable?: boolean;
  option_cache_state?: OptionCacheState;
  option_cache_fetched_at?: string | null;
  balance?: number | null;
  balance_currency?: string | null;
  balance_fetched_at?: string | null;
  can_enable?: boolean;
  reuse_capabilities?: string[];
};

export type ReusePoolSummary = {
  provider: string;
  service: string;
  country: string;
  active_count: number;
  max_reuse: number;
  last_used_at?: string | null;
  expires_at?: string | null;
};

export type TicketRecord = {
  id: string;
  provider: string;
  service: string;
  country: string;
  phone_number: string;
  status: string;
  created_at?: string;
  updated_at?: string;
  acquire_path?: 'fresh_acquire' | 'exact_reuse' | 'intent_reuse' | 'same_activation_retry';
  price?: number | null;
  code?: string | null;
  message?: string | null;
  pending_release_action?: 'finish' | 'cancel' | 'retry' | 'ban' | null;
  auto_release_at?: string | null;
  next_release_attempt_at?: string | null;
  release_retry_deadline_at?: string | null;
  release_retry_count?: number | null;
  routing_plan_id?: string | null;
  routing_plan_name?: string | null;
  routing_item_id?: string | null;
  routing_item_index?: number | null;
  routing_execution_mode?: RoutingExecutionMode | null;
  routing_execution_rounds?: number | null;
  routing_current_round?: number | null;
  reuse_count?: number | null;
};

export type ReleaseCodeResponse = {
  ticket_id: string;
  provider: string;
  status: string;
  message?: string | null;
};

export type RoutingReplaceResponse = {
  current_ticket_id: string;
  current_ticket_release: ReleaseCodeResponse;
  next_ticket: {
    ticket_id: string;
    provider: string;
    service: string;
    country: string;
    phone_number: string;
    upstream_id?: string | null;
    price?: number | null;
    status: string;
    created_at: string;
    acquire_path?: 'fresh_acquire' | 'exact_reuse' | 'intent_reuse' | 'same_activation_retry';
    routing_plan_id?: string | null;
    routing_plan_name?: string | null;
    routing_item_id?: string | null;
    routing_item_index?: number | null;
  };
};

export type LogEntry = {
  timestamp: string;
  scope: string;
  level: string;
  message: string;
};

export type ActivityEntry = {
  id: string;
  timestamp: string;
  kind: 'ticket_event' | 'routing_event' | 'release_event';
  level: 'info' | 'warn' | 'error';
  title: string;
  detail?: string | null;
  provider?: string | null;
  service?: string | null;
  country?: string | null;
  routing_plan_id?: string | null;
  routing_plan_name?: string | null;
  routing_item_id?: string | null;
  routing_round?: number | null;
  ticket_id?: string | null;
};

export type Snapshot = {
  providers: ProviderSummary[];
  tickets: TicketRecord[];
  logs: LogEntry[];
  reuse_pool: ReusePoolSummary[];
  activity?: ActivityEntry[];
};

export type TicketDecoration = {
  service_icon_url?: string | null;
  country_icon_url?: string | null;
};

export type ProviderManifest = {
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
    reuse_ttl_hours: number;
  };
  ui?: {
    protocol_label?: string | null;
    icon_url?: string | null;
    badge_label?: string | null;
  };
  behavior?: {
    cancel_cooldown_sec?: number | null;
    operator_selectable?: boolean;
  };
  handler_api?: Record<string, unknown>;
  five_sim?: Record<string, unknown>;
  mock?: Record<string, unknown>;
};

export type ProviderManifestList = { manifests: ProviderManifest[] };
export type ProviderBalance = { provider: string; amount: number; currency: string };
export type ProviderPriceItem = {
  country: string;
  display_name: string;
  operator: string;
  operator_label?: string | null;
  provider_country?: string | null;
  provider_operator?: string | null;
  price: number;
  stock: number;
};
export type ProviderPriceResponse = { provider: string; service: string; items: ProviderPriceItem[] };
export type PricePanelMap = Record<string, ProviderPriceResponse>;
export type OptionCacheState = 'missing' | 'fresh' | 'stale';
export type OptionItem = {
  value: string;
  label: string;
  hint: string;
  provider_value?: string | null;
  icon_url?: string | null;
  provider_icon_url?: string | null;
};
export type ResourceKind = 'provider' | 'service' | 'country';
export type OptionCatalogItem = {
  value: string;
  label: string;
  hint: string;
  providers: string[];
  provider_values: Record<string, string>;
  icon_url?: string | null;
  provider_icon_urls?: Record<string, string>;
};
export type SelectorOptionSource = 'manifest' | 'provider_options' | 'option_catalog' | 'synthetic';
export type SelectorOptionScope = 'single_provider' | 'cross_provider';
export type SelectorOptionSyntheticKind = 'any_provider' | 'any_country' | 'all_countries' | 'all_operators';
export type SelectorOptionViewModel = {
  id: string;
  resourceKind?: ResourceKind;
  source: SelectorOptionSource;
  scope: SelectorOptionScope;
  commitValue: string;
  canonicalValue: string;
  providerId?: string;
  providerValue?: string | null;
  primaryText: string;
  secondaryText?: string;
  iconUrl?: string | null;
  searchableText: string[];
  providers?: string[];
  option: OptionItem;
  isSynthetic?: boolean;
  syntheticKind?: SelectorOptionSyntheticKind;
  isDisabled?: boolean;
};
export type SelectorState = {
  kind: SelectorKind;
  title: string;
  options: SelectorOptionViewModel[];
  resourceKind?: ResourceKind;
};
export type NotificationFeed = { items: LogEntry[] };
export type RuntimeSettings = {
  routing_strategy: RoutingStrategy;
  auto_fallback: boolean;
  option_cache_enabled: boolean;
  option_cache_poll_interval_minutes: number;
  only_show_openai_sms_countries: boolean;
  check_updates_on_launch: boolean;
  http_port: number;
  http_secret: string;
};
export type RuntimeSettingsUpdate = {
  routing_strategy: RoutingStrategy;
  auto_fallback: boolean;
  option_cache_enabled: boolean;
  option_cache_poll_interval_minutes: number;
  only_show_openai_sms_countries: boolean;
  check_updates_on_launch: boolean;
  http_port: number;
};

export type OpenAiSmsRegionsCache = {
  sms_regions: string[];
  sms_only_regions: string[];
  whatsapp_regions: string[];
  all_regions: string[];
  fetched_at?: string | null;
};

export type RuntimeAccessInfo = {
  http_port: number;
  http_secret_overridden: boolean;
  requires_http_login: boolean;
};

export type UpdateCheckResult = {
  current_version: string;
  latest_version: string;
  has_update: boolean;
  release_name?: string | null;
  release_url?: string | null;
  published_at?: string | null;
};
export type ProviderDynamicOptions = {
  provider: string;
  raw_services?: OptionItem[];
  raw_countries?: OptionItem[];
  raw_operators?: OptionItem[];
  services: OptionItem[];
  countries: OptionItem[];
  operators: OptionItem[];
  operators_by_country?: Record<string, {
    raw_operators?: OptionItem[];
    operators: OptionItem[];
    fetched_at?: string | null;
  }>;
  cache_state?: OptionCacheState;
  fetched_at?: string | null;
};
export type OptionCatalog = {
  services: OptionCatalogItem[];
  countries: OptionCatalogItem[];
  operators: OptionCatalogItem[];
};
export type OptionListResponse = {
  provider: string;
  items: OptionItem[];
};
export type ProviderManifestSaveResponse = {
  manifest: ProviderManifest;
  option_cache_state: OptionCacheState;
  option_cache_fetched_at?: string | null;
  cache_refresh_error?: string | null;
};

export type ReusePoolClearResponse = {
  provider: string;
  removed: number;
};
export type OptionCacheOverview = {
  fresh_providers: number;
  stale_providers: number;
  missing_providers: number;
  last_refresh_at?: string | null;
};
export type StoreQueryState = { service: string; country: string; operator: string; search: string };

export type RoutingExecutionMode = 'sequential' | 'random';
export type RoutingPriceMode = 'any' | 'range' | 'fixed';

export type RoutingPlanItem = {
  id: string;
  provider: string;
  country: string;
  operator: string;
  enabled: boolean;
  price_mode: RoutingPriceMode;
  min_price?: number | null;
  max_price?: number | null;
  fixed_price?: number | null;
};

export const ANY_PROVIDER_VALUE = 'any';

export type RoutingPlan = {
  id: string;
  name: string;
  service: string;
  description?: string | null;
  enabled: boolean;
  execution_mode: RoutingExecutionMode;
  execution_rounds: number;
  items: RoutingPlanItem[];
};

export type RoutingPlanList = {
  plans: RoutingPlan[];
};

export type RoutingPlanFilter = 'all' | 'enabled' | 'disabled';

export type MenuCommandPayload =
  | { kind: 'new_activation' }
  | { kind: 'open_screen'; screen: ScreenId }
  | { kind: 'open_provider'; provider_id: string; section: ProviderSectionId };

export type ActivationFormState = {
  service: string;
  country: string;
  provider: string;
  routing_plan_id: string;
  operator: string;
  min_price: string;
  max_price: string;
};
