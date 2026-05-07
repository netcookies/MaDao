export type TicketPhase = 'received' | 'waiting' | 'failed';

const SERVICE_LABELS: Record<string, string> = {
  openai: 'OpenAI (GPT)',
  dr: 'OpenAI (GPT)',
  telegram: 'Telegram',
  tg: 'Telegram',
  whatsapp: 'WhatsApp',
  wa: 'WhatsApp',
  paypal: 'PayPal',
  discord: 'Discord',
};

const SERVICE_EMOJIS: Record<string, string> = {
  openai: '🤖',
  dr: '🤖',
  telegram: '✈️',
  tg: '✈️',
  whatsapp: '💬',
  wa: '💬',
  paypal: '💳',
  discord: '🎮',
};

const COUNTRY_LABELS: Record<string, string> = {
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
};

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

export function formatRelativeTime(input: string) {
  const timestamp = new Date(input).getTime();
  const diff = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(diff / 60000);
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

export function countryBadge(country: string) {
  const normalized = country.toLowerCase();
  const map: Record<string, string> = {
    usa: '🇺🇸',
    us: '🇺🇸',
    '50': '🇺🇸',
    england: '🇬🇧',
    uk: '🇬🇧',
    '44': '🇬🇧',
    germany: '🇩🇪',
    japan: '🇯🇵',
    canada: '🇨🇦',
    australia: '🇦🇺',
    '61': '🇦🇺',
    russia: '🇷🇺',
    '0': '🇷🇺',
  };
  return map[normalized] ?? '🌐';
}

export function formatServiceLabel(service: string) {
  const normalized = service.toLowerCase();
  return SERVICE_LABELS[normalized] ?? titleCaseToken(service);
}

export function serviceBadge(service: string) {
  const normalized = service.toLowerCase();
  return SERVICE_EMOJIS[normalized] ?? '🧩';
}

export function formatProviderLabel(provider: string) {
  const normalized = provider.toLowerCase();
  const labels: Record<string, string> = {
    fivesim: 'FiveSim',
    herosms: 'HeroSMS',
    smsbower: 'SMSBower',
    status: 'Status',
    ui: 'UI',
  };
  return labels[normalized] ?? provider;
}

export function formatCountryLabel(country: string) {
  const normalized = country.toLowerCase();
  return COUNTRY_LABELS[normalized] ?? titleCaseToken(country);
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
