import type { LanguageCode } from '../app/types';

export type TicketPhase = 'received' | 'waiting' | 'failed';

const SERVICE_LABELS: Record<LanguageCode, Record<string, string>> = {
  en: {
    openai: 'OpenAI (GPT)',
    dr: 'OpenAI (GPT)',
    telegram: 'Telegram',
    tg: 'Telegram',
    whatsapp: 'WhatsApp',
    wa: 'WhatsApp',
    paypal: 'PayPal',
    discord: 'Discord',
  },
  zh: {
    openai: 'OpenAI（GPT）',
    dr: 'OpenAI（GPT）',
    telegram: 'Telegram',
    tg: 'Telegram',
    whatsapp: 'WhatsApp',
    wa: 'WhatsApp',
    paypal: 'PayPal',
    discord: 'Discord',
  },
};

const COUNTRY_LABELS: Record<LanguageCode, Record<string, string>> = {
  en: {
    any: 'All countries',
    local: 'Local',
    usa: 'United States',
    us: 'United States',
    '50': 'United States',
    england: 'United Kingdom',
    uk: 'United Kingdom',
    '44': 'United Kingdom',
    germany: 'Germany',
    japan: 'Japan',
    canada: 'Canada',
    australia: 'Australia',
    '61': 'Australia',
    russia: 'Russia',
    '0': 'Russia',
    argentina: 'Argentina',
    ar: 'Argentina',
    vietnam: 'Vietnam',
  },
  zh: {
    any: '全部国家',
    local: '本地',
    usa: '美国',
    us: '美国',
    '50': '美国',
    england: '英国',
    uk: '英国',
    '44': '英国',
    germany: '德国',
    japan: '日本',
    canada: '加拿大',
    australia: '澳大利亚',
    '61': '澳大利亚',
    russia: '俄罗斯',
    '0': '俄罗斯',
    argentina: '阿根廷',
    ar: '阿根廷',
    vietnam: '越南',
  },
};

const PROVIDER_LABELS: Record<LanguageCode, Record<string, string>> = {
  en: {
    fivesim: 'FiveSim',
    herosms: 'HeroSMS',
    smsbower: 'SMSBower',
    status: 'Status',
    ui: 'UI',
  },
  zh: {
    fivesim: 'FiveSim',
    herosms: 'HeroSMS',
    smsbower: 'SMSBower',
    status: '状态',
    ui: '界面',
  },
};

const PROVIDER_PROTOCOL_LABELS: Record<LanguageCode, Record<string, string>> = {
  en: {
    five_sim: 'FiveSim',
    '5sim rest': 'FiveSim',
    fivesim: 'FiveSim',
    herosms: 'HeroSMS',
    smsbower: 'SMSBower',
    handler_api: 'Handler API',
    mock: 'Mock',
  },
  zh: {
    five_sim: 'FiveSim',
    '5sim rest': 'FiveSim',
    fivesim: 'FiveSim',
    herosms: 'HeroSMS',
    smsbower: 'SMSBower',
    handler_api: 'Handler API',
    mock: '模拟',
  },
};

function pickLanguage(language: LanguageCode | undefined) {
  return language ?? 'en';
}

export function normalizeTicketStatus(status: string) {
  return status
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase();
}

export function getTicketPhase(status: string): TicketPhase {
  const normalized = normalizeTicketStatus(status);
  if (normalized === 'code_received' || normalized === 'finished') return 'received';
  if (normalized === 'pending' || normalized === 'waiting_code') return 'waiting';
  return 'failed';
}

export function formatRelativeTime(input: string, language?: LanguageCode) {
  const timestamp = new Date(input).getTime();
  const diff = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(diff / 60000);
  const currentLanguage = pickLanguage(language);
  if (currentLanguage === 'zh') {
    if (minutes < 1) return '刚刚';
    if (minutes === 1) return '1 分钟前';
    if (minutes < 60) return `${minutes} 分钟前`;
    const hours = Math.floor(minutes / 60);
    return `${hours} 小时前`;
  }
  if (minutes < 1) return 'just now';
  if (minutes === 1) return '1 min ago';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hr ago`;
}

export function getHeroCancelRemainingMs(createdAt?: string, now = Date.now()) {
  if (!createdAt) return 0;
  const createdAtMs = new Date(createdAt).getTime();
  if (Number.isNaN(createdAtMs)) return 0;
  return Math.max(0, createdAtMs + 120_000 - now);
}

export function formatDurationMmSs(durationMs: number) {
  const totalSeconds = Math.max(0, Math.ceil(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function formatServiceLabel(service: string, language?: LanguageCode) {
  const normalized = service.toLowerCase();
  const currentLanguage = pickLanguage(language);
  return SERVICE_LABELS[currentLanguage][normalized] ?? titleCaseToken(service);
}

export function formatProviderLabel(provider: string, language?: LanguageCode) {
  const normalized = provider.toLowerCase();
  const currentLanguage = pickLanguage(language);
  return PROVIDER_LABELS[currentLanguage][normalized] ?? provider;
}

export function formatScopeLabel(scope: string, language?: LanguageCode) {
  const normalized = scope.toLowerCase();
  const currentLanguage = pickLanguage(language);
  const labels: Record<LanguageCode, Record<string, string>> = {
    en: {
      provider: 'provider',
      router: 'router',
      routing: 'routing',
      system: 'system',
      wallet: 'wallet',
      acquire: 'acquire',
      poll: 'poll',
      status: 'status',
    },
    zh: {
      provider: '服务商',
      router: '路由',
      routing: '路由',
      system: '系统',
      wallet: '钱包',
      acquire: '获取',
      poll: '轮询',
      status: '状态',
    },
  };
  return labels[currentLanguage][normalized] ?? scope;
}

export function formatProviderProtocolLabel(protocol: string, language?: LanguageCode) {
  const normalized = protocol.toLowerCase();
  const currentLanguage = pickLanguage(language);
  return PROVIDER_PROTOCOL_LABELS[currentLanguage][normalized] ?? titleCaseToken(protocol);
}

export function formatCountryLabel(country: string, language?: LanguageCode) {
  const normalized = country.toLowerCase();
  const currentLanguage = pickLanguage(language);
  return COUNTRY_LABELS[currentLanguage][normalized] ?? titleCaseToken(country);
}

export function canonicalCountryValue(country: string) {
  const normalized = country.trim().toLowerCase();
  const aliases: Record<string, string> = {
    ar: 'argentina',
    argentina: 'argentina',
    any: 'any',
    usa: 'usa',
    us: 'usa',
    '50': 'usa',
    england: 'uk',
    uk: 'uk',
    '44': 'uk',
    local: 'local',
    germany: 'germany',
    japan: 'japan',
    canada: 'canada',
    australia: 'australia',
    '61': 'australia',
    russia: 'russia',
    '0': 'russia',
  };
  return aliases[normalized] ?? normalized;
}

function titleCaseToken(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((part) => part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : part)
    .join(' ');
}
