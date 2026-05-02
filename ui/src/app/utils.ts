import type { OptionItem } from './types';

export function mergeOptionItems(optionGroups: OptionItem[][]) {
  const merged = new Map<string, OptionItem>();
  optionGroups.flat().forEach((item) => {
    if (!merged.has(item.value)) merged.set(item.value, item);
  });
  return [...merged.values()];
}
