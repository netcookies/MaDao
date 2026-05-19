import type { LanguageCode, OptionCatalog, OptionCatalogItem, OptionItem, PricePanelMap, ProviderDynamicOptions } from './types';
import { i18n } from './i18n';
import { canonicalCountryValue, formatCountryLabel, formatServiceLabel } from '../lib/formatters';

export function mergeOptionItems(optionGroups: OptionItem[][]) {
  const merged = new Map<string, OptionItem>();
  optionGroups.flat().forEach((item) => {
    const key = item.value;
    if (!merged.has(key)) merged.set(key, item);
  });
  return [...merged.values()];
}

export function normalizeServiceOptions(options: OptionItem[]) {
  const merged = new Map<string, OptionItem>();
  for (const option of options) {
    const value = option.value.trim();
    const key = value.toLowerCase();
    const label = option.label.trim();
    if (!merged.has(key)) {
      merged.set(key, {
        value,
        label: label || formatServiceLabel(value),
        hint: option.hint,
        provider_value: option.provider_value ?? option.value,
        icon_url: option.icon_url,
        provider_icon_url: option.provider_icon_url,
      });
    }
  }
  return [...merged.values()];
}

export function normalizeCountryOptions(options: OptionItem[]) {
  const merged = new Map<string, OptionItem>();
  for (const option of options) {
    const key = canonicalCountryValue(option.value || option.label);
    const label = option.label.trim();
    if (!merged.has(key)) {
      merged.set(key, {
        value: key,
        label: label || formatCountryLabel(key),
        hint: option.hint,
        provider_value: option.provider_value ?? option.value,
        icon_url: option.icon_url,
        provider_icon_url: option.provider_icon_url,
      });
    }
  }
  return [...merged.values()];
}

export function normalizeOperatorOptions(options: OptionItem[]) {
  const merged = new Map<string, OptionItem>();
  for (const option of options) {
    const value = option.value.trim().toLowerCase();
    const label = option.label.trim();
    if (!merged.has(value)) {
      merged.set(value, {
        value,
        label: label || formatOperatorLabel(value),
        hint: option.hint,
        provider_value: option.provider_value ?? option.value,
        icon_url: option.icon_url,
        provider_icon_url: option.provider_icon_url,
      });
    }
  }
  return [...merged.values()];
}

export function operatorCountryCacheKey(country: string | null | undefined) {
  return (country ?? '')
    .trim()
    .replace(/[\/_-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function formatOperatorLabel(operator: string, language: LanguageCode = 'en') {
  const normalized = operator.trim().toLowerCase();
  if (!normalized) return '';
  if (normalized === 'any') return i18n.getFixedT(language)('Any operator');
  if (normalized === 'o2') return 'O2';
  return normalized
    .split(/\s+/)
    .map((part) => part ? part[0].toUpperCase() + part.slice(1) : part)
    .join(' ');
}

function mergeCatalogItems(source: Map<string, OptionCatalogItem>, providerId: string, items: OptionItem[]) {
  items.forEach((item) => {
    const key = item.value;
    const providerValue = item.provider_value ?? item.value;
    const providerIconUrl = item.provider_icon_url ?? item.icon_url ?? undefined;
    const existing = source.get(key);
    if (existing) {
      if (!existing.providers.includes(providerId)) existing.providers.push(providerId);
      existing.provider_values[providerId] = providerValue;
      if (providerIconUrl) {
        existing.provider_icon_urls ??= {};
        existing.provider_icon_urls[providerId] = providerIconUrl;
      }
      if (!existing.icon_url && item.icon_url) existing.icon_url = item.icon_url;
      if (!existing.label && item.label) existing.label = item.label;
      if (!existing.hint && item.hint) existing.hint = item.hint;
      return;
    }
    source.set(key, {
      value: key,
      label: item.label,
      hint: item.hint,
      providers: [providerId],
      provider_values: { [providerId]: providerValue },
      icon_url: item.icon_url,
      provider_icon_urls: providerIconUrl ? { [providerId]: providerIconUrl } : {},
    });
  });
}

function mergePriceOperators(
  source: Map<string, OptionCatalogItem>,
  providerId: string,
  items: Array<{ operator: string; operator_label?: string | null }>,
) {
  items.forEach((item) => {
    const value = item.operator.trim().toLowerCase();
    if (!value || value === 'any' || value === 'default') return;
    const label = (item.operator_label ?? item.operator).trim() || formatOperatorLabel(value);
    const existing = source.get(value);
    if (existing) {
      if (!existing.providers.includes(providerId)) existing.providers.push(providerId);
      existing.provider_values[providerId] = item.operator;
      if (!existing.label && label) existing.label = label;
      if (!existing.hint) existing.hint = 'price-derived';
      return;
    }
    source.set(value, {
      value,
      label,
      hint: 'price-derived',
      providers: [providerId],
      provider_values: { [providerId]: item.operator },
    });
  });
}

export function buildOptionCatalog(
  providerOptions: Record<string, ProviderDynamicOptions>,
  pricePanels?: PricePanelMap,
): OptionCatalog {
  const services = new Map<string, OptionCatalogItem>();
  const countries = new Map<string, OptionCatalogItem>();
  const operators = new Map<string, OptionCatalogItem>();

  Object.entries(providerOptions).forEach(([providerId, options]) => {
    mergeCatalogItems(services, providerId, options.services);
    mergeCatalogItems(countries, providerId, options.countries);
    mergeCatalogItems(operators, providerId, options.operators);
  });

  Object.entries(pricePanels ?? {}).forEach(([providerId, panel]) => {
    mergePriceOperators(operators, providerId, panel.items);
  });

  return {
    services: [...services.values()],
    countries: [...countries.values()],
    operators: [...operators.values()],
  };
}

export function filterCatalogItems(items: OptionCatalogItem[], providerId: string) {
  if (!providerId || providerId === 'any') return items;
  return items.filter((item) => item.providers.includes(providerId));
}
