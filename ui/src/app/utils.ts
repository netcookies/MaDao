import type { OptionItem } from './types';
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
    if (!merged.has(key)) {
      merged.set(key, {
        value,
        label: formatServiceLabel(value),
        hint: option.hint,
      });
    }
  }
  return [...merged.values()];
}

export function normalizeCountryOptions(options: OptionItem[]) {
  const merged = new Map<string, OptionItem>();
  for (const option of options) {
    const key = canonicalCountryValue(option.value || option.label);
    if (!merged.has(key)) {
      merged.set(key, {
        value: key,
        label: formatCountryLabel(key),
        hint: option.hint,
      });
    }
  }
  return [...merged.values()];
}
