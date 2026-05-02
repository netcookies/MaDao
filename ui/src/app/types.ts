export type ScreenId = 'overview' | 'providers' | 'messages' | 'settings' | 'logs';
export type ProviderSectionId = 'config' | 'store' | 'wallet';
export type MessageFilter = 'all' | 'received' | 'waiting' | 'failed';
export type LogFilter = 'all' | 'info' | 'warn' | 'error';
export type SelectorKind =
  | 'service'
  | 'country'
  | 'provider'
  | 'store-service'
  | 'store-country'
  | 'store-operator'
  | 'activation-service'
  | 'activation-country'
  | 'activation-operator';
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
  primary_endpoint?: string | null;
  default_service: string;
  default_country: string;
  homepage?: string | null;
  description?: string | null;
  priority: number;
};

export type TicketRecord = {
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

export type LogEntry = {
  timestamp: string;
  scope: string;
  level: string;
  message: string;
};

export type Snapshot = {
  providers: ProviderSummary[];
  tickets: TicketRecord[];
  logs: LogEntry[];
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
  };
  handler_api?: Record<string, unknown>;
  five_sim?: Record<string, unknown>;
  mock?: Record<string, unknown>;
};

export type ProviderManifestList = { manifests: ProviderManifest[] };
export type ProviderBalance = { provider: string; amount: number; currency: string };
export type ProviderPriceItem = { country: string; display_name: string; operator: string; price: number; stock: number };
export type ProviderPriceResponse = { provider: string; service: string; items: ProviderPriceItem[] };
export type OptionItem = { value: string; label: string; hint: string };
export type SelectorState = { kind: SelectorKind; title: string; options: OptionItem[] };
export type NotificationFeed = { items: LogEntry[] };
export type RuntimeSettings = { routing_strategy: RoutingStrategy; auto_fallback: boolean };
export type RuntimeSettingsUpdate = { routing_strategy: RoutingStrategy; auto_fallback: boolean };
export type ProviderDynamicOptions = { provider: string; services: OptionItem[]; countries: OptionItem[]; operators: OptionItem[] };
export type StoreQueryState = { service: string; country: string; operator: string; search: string };

export type ActivationFormState = {
  service: string;
  country: string;
  provider: string;
  operator: string;
  min_price: string;
  max_price: string;
};
