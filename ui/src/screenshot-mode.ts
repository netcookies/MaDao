export const SCREENSHOT_TARGETS = {
  Overview: 'MaDao_macOS_Overview.png',
  Providers: 'MaDao_macOS_Providers.png',
  ProviderWorkspace_Config: 'MaDao_macOS_ProviderWorkspace_Config.png',
  ProviderWorkspace_Store: 'MaDao_macOS_ProviderWorkspace_Store.png',
  ProviderWorkspace_Wallet: 'MaDao_macOS_ProviderWorkspace_Wallet.png',
  Messages: 'MaDao_macOS_Messages.png',
  Settings: 'MaDao_macOS_Settings.png',
  Logs: 'MaDao_macOS_Logs.png',
  Notifications: 'MaDao_macOS_Notifications.png',
  NewActivation: 'MaDao_macOS_NewActivation.png',
} as const;

export type ScreenshotTarget = keyof typeof SCREENSHOT_TARGETS;

export function isIsolatedScreenshotTarget(target: ScreenshotTarget) {
  return target === 'Notifications' || target === 'NewActivation';
}

const manifests = [
  {
    id: 'fivesim',
    name: '5SIM',
    kind: 'five_sim',
    enabled: true,
    priority: 10,
    homepage: 'https://5sim.net/',
    description: '兼容 5SIM REST API 的 provider。',
    service_aliases: {},
    defaults: {
      service: 'openai',
      country: 'any',
      auto_pick_country: true,
      verify_on_register: false,
      reuse_phone: true,
      max_price: 50,
      min_price: 0,
      min_balance: 10,
      max_tries: 3,
      poll_timeout_sec: 180,
      reuse_max: 2,
    },
    five_sim: {
      base_url: 'https://5sim.net/v1',
      api_key: '',
      buy_operator: 'any',
    },
  },
  {
    id: 'herosms',
    name: 'HeroSMS',
    kind: 'handler_api',
    enabled: true,
    priority: 20,
    homepage: 'https://hero-sms.com/',
    description: '兼容 HeroSMS 的 handler_api.php 风格 provider。',
    service_aliases: {
      openai: 'dr',
      chatgpt: 'dr',
      gpt: 'dr',
      codex: 'dr',
    },
    defaults: {
      service: 'dr',
      country: '50',
      auto_pick_country: false,
      verify_on_register: false,
      reuse_phone: true,
      max_price: 0.08,
      min_price: 0.05,
      min_balance: 1,
      max_tries: 3,
      poll_timeout_sec: 120,
      reuse_max: 2,
    },
    handler_api: {
      base_url: 'https://hero-sms.com/stubs/handler_api.php',
      api_key: '',
    },
  },
  {
    id: 'smsbower',
    name: 'SmsBower',
    kind: 'handler_api',
    enabled: false,
    priority: 30,
    homepage: 'https://smsbower.app/',
    description: '兼容 SmsBower 的 handler_api.php 风格 provider。',
    service_aliases: {
      openai: 'dr',
      chatgpt: 'dr',
      gpt: 'dr',
      codex: 'dr',
    },
    defaults: {
      service: 'dr',
      country: '0',
      auto_pick_country: false,
      verify_on_register: false,
      reuse_phone: true,
      max_price: 0.08,
      min_price: 0,
      min_balance: 1,
      max_tries: 3,
      poll_timeout_sec: 120,
      reuse_max: 2,
    },
    handler_api: {
      base_url: 'https://smsbower.page/stubs/handler_api.php',
      api_key: '',
    },
  },
  {
    id: 'mock',
    name: 'Mock Provider',
    kind: 'mock',
    enabled: true,
    priority: 100,
    homepage: null,
    description: '本地联调 provider，可编辑并支持热重载。',
    service_aliases: {},
    defaults: {
      service: 'openai',
      country: 'local',
      auto_pick_country: false,
      verify_on_register: false,
      reuse_phone: true,
      max_price: 0,
      min_price: 0,
      min_balance: 0,
      max_tries: 1,
      poll_timeout_sec: 15,
      reuse_max: 3,
    },
    mock: {
      balance: 999,
      phone_number: '+15550001234',
      codes: ['123456', '654321', '888888'],
    },
  },
];

const snapshot = {
  providers: [
    {
      id: 'fivesim',
      name: '5SIM',
      enabled: true,
      kind: 'fivesim',
      protocol: 'five_sim',
      primary_endpoint: 'https://5sim.net/v1',
      default_service: 'openai',
      default_country: 'any',
      homepage: 'https://5sim.net/',
      description: '兼容 5SIM REST API 的 provider。',
      priority: 10,
    },
    {
      id: 'herosms',
      name: 'HeroSMS',
      enabled: true,
      kind: 'handlerapi',
      protocol: 'handler_api',
      primary_endpoint: 'https://hero-sms.com/stubs/handler_api.php',
      default_service: 'dr',
      default_country: '50',
      homepage: 'https://hero-sms.com/',
      description: '兼容 HeroSMS 的 handler_api.php 风格 provider。',
      priority: 20,
    },
    {
      id: 'mock',
      name: 'Mock Provider',
      enabled: true,
      kind: 'mock',
      protocol: 'mock',
      primary_endpoint: null,
      default_service: 'openai',
      default_country: 'local',
      homepage: null,
      description: '本地联调 provider，可编辑并支持热重载。',
      priority: 100,
    },
    {
      id: 'smsbower',
      name: 'SmsBower',
      enabled: false,
      kind: 'handlerapi',
      protocol: 'handler_api',
      primary_endpoint: 'https://smsbower.page/stubs/handler_api.php',
      default_service: 'dr',
      default_country: '0',
      homepage: 'https://smsbower.app/',
      description: '兼容 SmsBower 的 handler_api.php 风格 provider。',
      priority: 30,
    },
  ],
  tickets: [
    {
      id: 'ticket-001',
      provider: 'fivesim',
      service: 'telegram',
      country: 'usa',
      phone_number: '+1 202 555 0138',
      status: 'CodeReceived',
      price: 0.18,
      code: '481927',
      message: 'Code delivered',
    },
    {
      id: 'ticket-002',
      provider: 'herosms',
      service: 'openai',
      country: '50',
      phone_number: '+1 202 555 0151',
      status: 'WaitingCode',
      price: 0.07,
      code: null,
      message: 'Awaiting provider SMS',
    },
    {
      id: 'ticket-003',
      provider: 'smsbower',
      service: 'discord',
      country: '44',
      phone_number: '+44 7700 900123',
      status: 'Cancelled',
      price: 0.06,
      code: null,
      message: 'Provider released the number',
    },
  ],
  logs: [
    {
      timestamp: '2026-04-29T10:00:01.000Z',
      scope: 'config',
      level: 'info',
      message: 'provider manifests reloaded',
    },
    {
      timestamp: '2026-04-29T10:01:13.000Z',
      scope: 'router',
      level: 'info',
      message: 'auto-routed ticket ticket-002 -> herosms',
    },
    {
      timestamp: '2026-04-29T10:02:44.000Z',
      scope: 'system',
      level: 'info',
      message: 'ticket ticket-001 acquired by fivesim',
    },
    {
      timestamp: '2026-04-29T10:03:27.000Z',
      scope: 'router',
      level: 'warn',
      message: 'auto-route skipped smsbower: insufficient stock',
    },
  ],
};

const providerOptions = {
  fivesim: {
    provider: 'fivesim',
    services: [
      { value: 'openai', label: 'OpenAI', hint: 'openai' },
      { value: 'telegram', label: 'Telegram', hint: 'telegram' },
      { value: 'whatsapp', label: 'WhatsApp', hint: 'whatsapp' },
    ],
    countries: [
      { value: 'any', label: 'Any Country', hint: 'any' },
      { value: 'usa', label: 'United States', hint: 'usa' },
      { value: 'england', label: 'United Kingdom', hint: 'england' },
    ],
    operators: [
      { value: 'any', label: 'Any Operator', hint: 'any' },
      { value: 'tmobile', label: 'T-Mobile', hint: 'tmobile' },
      { value: 'att', label: 'AT&T', hint: 'att' },
    ],
  },
  herosms: {
    provider: 'herosms',
    services: [
      { value: 'dr', label: 'OpenAI / ChatGPT', hint: 'dr' },
      { value: 'tg', label: 'Telegram', hint: 'tg' },
      { value: 'wa', label: 'WhatsApp', hint: 'wa' },
    ],
    countries: [
      { value: '50', label: 'United States', hint: '50' },
      { value: '44', label: 'United Kingdom', hint: '44' },
      { value: '86', label: 'China', hint: '86' },
    ],
    operators: [
      { value: 'any', label: 'Any Operator', hint: 'any' },
      { value: 'smart', label: 'Smart', hint: 'smart' },
      { value: 'boost', label: 'Boost', hint: 'boost' },
    ],
  },
  smsbower: {
    provider: 'smsbower',
    services: [
      { value: 'dr', label: 'OpenAI / ChatGPT', hint: 'dr' },
      { value: 'tg', label: 'Telegram', hint: 'tg' },
      { value: 'wa', label: 'WhatsApp', hint: 'wa' },
    ],
    countries: [
      { value: '0', label: 'Russia', hint: '0' },
      { value: '50', label: 'United States', hint: '50' },
      { value: '44', label: 'United Kingdom', hint: '44' },
    ],
    operators: [
      { value: 'any', label: 'Any Operator', hint: 'any' },
      { value: 'mts', label: 'MTS', hint: 'mts' },
      { value: 'tele2', label: 'Tele2', hint: 'tele2' },
    ],
  },
};

const pricePanels = {
  fivesim: {
    provider: 'fivesim',
    service: 'openai',
    items: [
      { country: 'usa', display_name: 'United States', operator: 'tmobile', price: 0.22, stock: 184 },
      { country: 'usa', display_name: 'United States', operator: 'att', price: 0.24, stock: 96 },
      { country: 'england', display_name: 'United Kingdom', operator: 'o2', price: 0.28, stock: 71 },
      { country: 'japan', display_name: 'Japan', operator: 'softbank', price: 0.34, stock: 28 },
    ],
  },
  herosms: {
    provider: 'herosms',
    service: 'dr',
    items: [
      { country: '50', display_name: 'United States', operator: 'smart', price: 0.07, stock: 402 },
      { country: '44', display_name: 'United Kingdom', operator: 'boost', price: 0.09, stock: 188 },
    ],
  },
  smsbower: {
    provider: 'smsbower',
    service: 'dr',
    items: [
      { country: '0', display_name: 'Russia', operator: 'mts', price: 0.05, stock: 610 },
      { country: '44', display_name: 'United Kingdom', operator: 'tele2', price: 0.08, stock: 93 },
    ],
  },
};

const balances = {
  fivesim: '245.90 USD',
  herosms: '81.35 USD',
  smsbower: '63.20 USD',
};

const baseStoreQueries = {
  fivesim: { service: 'openai', country: '', operator: '', search: '' },
  herosms: { service: 'dr', country: '', operator: '', search: '' },
  smsbower: { service: 'dr', country: '', operator: '', search: '' },
};

const baseActivationForm = {
  service: 'openai',
  country: 'any',
  provider: 'auto',
  operator: '',
  min_price: '',
  max_price: '',
};

const baseScenario = {
  manifests,
  snapshot,
  notifications: snapshot.logs,
  providerOptions,
  pricePanels,
  balances,
  runtimeSettings: {
    routing_strategy: 'ordered_priority',
    auto_fallback: true,
  },
  selectedProvider: 'fivesim',
  activeScreen: 'overview',
  providerView: 'list',
  activeProviderSection: 'config',
  showNotifications: false,
  showActivationModal: false,
  activationForm: baseActivationForm,
  storeQueries: baseStoreQueries,
  messageFilter: 'all',
  logsFilter: 'all',
  logsSearch: '',
  statusMessage: 'Console ready.',
  notificationCursor: 0,
  appearanceTheme: 'light',
  language: 'en',
  compactTables: false,
};

export function getScreenshotMeasureSelector(target: ScreenshotTarget) {
  if (target === 'Notifications') return '.d-notification-panel';
  if (target === 'NewActivation') return '.d-modal-activation';
  return '.app-root';
}

export function getScreenshotScenario(target: ScreenshotTarget) {
  switch (target) {
    case 'Providers':
      return {
        ...baseScenario,
        activeScreen: 'providers',
      };
    case 'ProviderWorkspace_Config':
      return {
        ...baseScenario,
        activeScreen: 'providers',
        providerView: 'workspace',
        activeProviderSection: 'config',
      };
    case 'ProviderWorkspace_Store':
      return {
        ...baseScenario,
        activeScreen: 'providers',
        providerView: 'workspace',
        activeProviderSection: 'store',
      };
    case 'ProviderWorkspace_Wallet':
      return {
        ...baseScenario,
        activeScreen: 'providers',
        providerView: 'workspace',
        activeProviderSection: 'wallet',
      };
    case 'Messages':
      return {
        ...baseScenario,
        activeScreen: 'messages',
      };
    case 'Settings':
      return {
        ...baseScenario,
        activeScreen: 'settings',
      };
    case 'Logs':
      return {
        ...baseScenario,
        activeScreen: 'logs',
      };
    case 'Notifications':
      return {
        ...baseScenario,
        showNotifications: true,
      };
    case 'NewActivation':
      return {
        ...baseScenario,
        showActivationModal: true,
      };
    case 'Overview':
    default:
      return baseScenario;
  }
}
