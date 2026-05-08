import type { LanguageCode, OptionCatalog, OptionCatalogItem, OptionItem, ProviderDynamicOptions } from './types';
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
      });
    }
  }
  return [...merged.values()];
}

export function formatOperatorLabel(operator: string, language: LanguageCode = 'en') {
  const normalized = operator.trim().toLowerCase();
  if (!normalized) return '';
  if (normalized === 'any') return language === 'zh' ? '任意运营商' : 'Any operator';
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
    const existing = source.get(key);
    if (existing) {
      if (!existing.providers.includes(providerId)) existing.providers.push(providerId);
      existing.provider_values[providerId] = providerValue;
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
    });
  });
}

export function buildOptionCatalog(providerOptions: Record<string, ProviderDynamicOptions>): OptionCatalog {
  const services = new Map<string, OptionCatalogItem>();
  const countries = new Map<string, OptionCatalogItem>();
  const operators = new Map<string, OptionCatalogItem>();

  Object.entries(providerOptions).forEach(([providerId, options]) => {
    mergeCatalogItems(services, providerId, options.services);
    mergeCatalogItems(countries, providerId, options.countries);
    mergeCatalogItems(operators, providerId, options.operators);
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
