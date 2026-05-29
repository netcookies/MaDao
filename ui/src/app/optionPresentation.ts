import type { OptionItem, SelectorOptionViewModel } from './types';
import { formatCountryLabel, formatServiceLabel } from '../lib/formatters';
import { formatOperatorLabel } from './utils';

export type OptionPresentation = {
  primary: string;
  secondary: string;
  iconUrl?: string | null;
};

function clean(value: string | null | undefined) {
  return (value ?? '').trim();
}

function isMostlyNumeric(value: string) {
  return /^[\d+\s-]+$/.test(value.trim());
}

export function presentServiceOption(option: OptionItem, language: 'en' | 'zh'): OptionPresentation {
  const primary = clean(option.label) || formatServiceLabel(option.value, language);
  const rawCode = clean(option.value);
  const secondary = rawCode && rawCode.toLowerCase() !== primary.toLowerCase()
    ? rawCode
    : clean(option.hint);
  return {
    primary,
    secondary,
    iconUrl: option.icon_url ?? option.provider_icon_url,
  };
}

export function presentCountryOption(option: OptionItem, language: 'en' | 'zh'): OptionPresentation {
  const translatedLabel = language === 'zh'
    ? clean(option.label_zh) || formatCountryLabel(option.value, language)
    : formatCountryLabel(option.value, language);
  const primary = translatedLabel || clean(option.label);
  const rawHint = clean(option.hint);
  const secondary = isMostlyNumeric(rawHint) && rawHint.length <= 4
    ? `+${rawHint.replace(/^\+/, '')}`
    : rawHint && rawHint.toLowerCase() !== primary.toLowerCase()
      ? rawHint
      : '';
  return {
    primary,
    secondary,
    iconUrl: option.icon_url ?? option.provider_icon_url,
  };
}

export function presentOperatorOption(option: OptionItem, language: 'en' | 'zh'): OptionPresentation {
  const primary = clean(option.label) || formatOperatorLabel(option.value, language);
  const secondary = clean(option.hint);
  return {
    primary,
    secondary: secondary.toLowerCase() !== primary.toLowerCase() ? secondary : '',
  };
}

export function presentSelectorOptionViewModel(option: SelectorOptionViewModel): OptionPresentation {
  return {
    primary: option.primaryText,
    secondary: option.secondaryText ?? '',
    iconUrl: option.iconUrl,
  };
}
