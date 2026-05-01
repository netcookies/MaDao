export type TicketPhase = 'received' | 'waiting' | 'failed';

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
  const labels: Record<string, string> = {
    openai: 'OpenAI (ChatGPT)',
    dr: 'OpenAI (ChatGPT)',
    telegram: 'Telegram',
    tg: 'Telegram',
    whatsapp: 'WhatsApp',
    wa: 'WhatsApp',
    paypal: 'PayPal',
    discord: 'Discord',
  };
  return labels[normalized] ?? service;
}

export function formatProviderLabel(provider: string) {
  const normalized = provider.toLowerCase();
  const labels: Record<string, string> = {
    fivesim: 'FiveSim',
    herosms: 'HeroSMS',
    smsbower: 'SMSBower',
  };
  return labels[normalized] ?? provider;
}

export function formatCountryLabel(country: string) {
  const normalized = country.toLowerCase();
  const labels: Record<string, string> = {
    any: 'any — auto select',
    usa: 'usa',
    england: 'uk',
    uk: 'uk',
    '50': 'usa',
    '44': 'uk',
    local: 'local',
  };
  return labels[normalized] ?? country;
}
