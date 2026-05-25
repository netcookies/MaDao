import countryMetadata from '../../../config/country-metadata.json';
import type { LanguageCode } from '../app/types';
import { i18n } from '../app/i18n';

export type TicketPhase = 'received' | 'waiting' | 'cancel-pending' | 'failed';

const SERVICE_LABELS_EN: Record<string, string> = {
  apple: 'Apple',
  aol: 'AOL',
  openai: 'OpenAI (GPT)',
  dr: 'OpenAI (GPT)',
  claude: 'Claude',
  claudeai: 'Claude',
  'google chat': 'Google Chat',
  microsoft: 'Microsoft',
  telegram: 'Telegram',
  tg: 'Telegram',
  twitter: 'Twitter/X',
  uber: 'Uber',
  wechat: 'WeChat',
  whatsapp: 'WhatsApp',
  wa: 'WhatsApp',
  paypal: 'PayPal',
  discord: 'Discord',
  yahoo: 'Yahoo',
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
    handler_api: '通用 Handler API',
    mock: '模拟',
  },
};

type CountryMetadata = {
  labels: Record<string, string>;
  aliases: Record<string, string>;
};

const COUNTRY_METADATA = countryMetadata as CountryMetadata;

function pickLanguage(language: LanguageCode | undefined) {
  return language ?? 'en';
}

function i18nTokenKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function normalizeCountryToken(country: string) {
  return country.trim().toLowerCase().replace(/[_/-]+/g, ' ').replace(/\s+/g, ' ');
}

function isIsoAlpha2(value: string) {
  return value.length === 2 && /^[A-Z]{2}$/.test(value);
}

function resolveRegionDisplayName(code: string, language: LanguageCode) {
  try {
    const displayNames = new Intl.DisplayNames([language], { type: 'region' });
    return displayNames.of(code) ?? null;
  } catch {
    return null;
  }
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
  if (normalized === 'cancel_pending') return 'cancel-pending';
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

export function getCancelRemainingMs(createdAt: string | undefined, cooldownSec: number | null | undefined, now = Date.now()) {
  if (!createdAt || !cooldownSec || cooldownSec <= 0) return 0;
  const createdAtMs = new Date(createdAt).getTime();
  if (Number.isNaN(createdAtMs)) return 0;
  return Math.max(0, createdAtMs + cooldownSec * 1000 - now);
}

export function getAutoReleaseRemainingMs(autoReleaseAt: string | undefined | null, now = Date.now()) {
  if (!autoReleaseAt) return 0;
  const autoReleaseAtMs = new Date(autoReleaseAt).getTime();
  if (Number.isNaN(autoReleaseAtMs)) return 0;
  return Math.max(0, autoReleaseAtMs - now);
}

export function formatDurationMmSs(durationMs: number) {
  const totalSeconds = Math.max(0, Math.ceil(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function getElapsedDurationMs(createdAt: string | undefined, now = Date.now()) {
  if (!createdAt) return 0;
  const createdAtMs = new Date(createdAt).getTime();
  if (Number.isNaN(createdAtMs)) return 0;
  return Math.max(0, now - createdAtMs);
}

export function formatServiceLabel(service: string, language?: LanguageCode) {
  const normalized = service.toLowerCase();
  const currentLanguage = pickLanguage(language);
  const englishLabel = SERVICE_LABELS_EN[normalized] ?? titleCaseToken(service);
  return i18n.getFixedT(currentLanguage)(`service_label_${i18nTokenKey(normalized)}`, { defaultValue: englishLabel });
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

export function formatReuseCapabilityLabel(capability: string, language?: LanguageCode) {
  const normalized = capability.toLowerCase();
  const currentLanguage = pickLanguage(language);
  const labels: Record<LanguageCode, Record<string, string>> = {
    en: {
      exact_reuse: 'Exact reuse',
      intent_reuse: 'Intent reuse',
      same_activation_retry: 'Retry reuse',
      unsupported: 'Not supported',
    },
    zh: {
      exact_reuse: '精确复用',
      intent_reuse: '意图复用',
      same_activation_retry: '重试复用',
      unsupported: '不支持',
    },
  };
  return labels[currentLanguage][normalized] ?? capability;
}

export function canonicalCountryValue(country: string) {
  const normalized = normalizeCountryToken(country);
  if (!normalized) return '';
  const alias = COUNTRY_METADATA.aliases[normalized];
  if (alias === 'ANY') return 'any';
  if (alias === 'LOCAL') return 'local';
  if (alias) return alias;
  if (normalized.length === 2 && /^[a-z]{2}$/.test(normalized)) {
    return normalized.toUpperCase();
  }
  return normalized;
}

export function formatCountryLabel(country: string, language?: LanguageCode) {
  const canonical = canonicalCountryValue(country);
  const currentLanguage = pickLanguage(language);
  if (canonical === 'any') {
    return i18n.getFixedT(currentLanguage)('country_label_any', { defaultValue: 'All countries' });
  }
  if (canonical === 'local') {
    return i18n.getFixedT(currentLanguage)('country_label_local', { defaultValue: 'Local' });
  }
  if (isIsoAlpha2(canonical)) {
    const defaultEnglish = COUNTRY_METADATA.labels[canonical]
      ?? resolveRegionDisplayName(canonical, 'en')
      ?? canonical;
    const translated = resolveRegionDisplayName(canonical, currentLanguage);
    return translated ?? defaultEnglish;
  }
  const englishLabel = COUNTRY_METADATA.labels[canonical] ?? titleCaseToken(country);
  return i18n.getFixedT(currentLanguage)(`country_label_${i18nTokenKey(canonical)}`, { defaultValue: englishLabel });
}

function titleCaseToken(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((part) => {
      if (!part) return part;
      if (part.length === 2 && /^[a-zA-Z]{2}$/.test(part)) return part.toUpperCase();
      return part[0]!.toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(' ');
}
