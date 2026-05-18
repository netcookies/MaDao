import type {
  OptionCatalogItem,
  OptionItem,
  ProviderManifest,
  ResourceKind,
  SelectorOptionSource,
  SelectorOptionViewModel,
} from './types';
import { formatCountryLabel, formatProviderLabel, formatServiceLabel } from '../lib/formatters';
import { formatOperatorLabel } from './utils';
import { presentCountryOption, presentOperatorOption, presentServiceOption } from './optionPresentation';

type BuildOptionArgs = {
  resourceKind?: ResourceKind;
  source: SelectorOptionSource;
  scope: 'single_provider' | 'cross_provider';
  option: OptionItem;
  language: 'en' | 'zh';
  providerId?: string;
  providers?: string[];
  isSynthetic?: boolean;
  syntheticKind?: SelectorOptionViewModel['syntheticKind'];
};

function buildPresentation(resourceKind: ResourceKind | undefined, option: OptionItem, language: 'en' | 'zh') {
  if (resourceKind === 'service') return presentServiceOption(option, language);
  if (resourceKind === 'country') return presentCountryOption(option, language);
  if (resourceKind === 'provider') {
    return {
      primary: option.label || formatProviderLabel(option.value, language),
      secondary: option.hint,
      iconUrl: option.icon_url ?? option.provider_icon_url,
    };
  }
  return presentOperatorOption(option, language);
}

export function buildSelectorOptionViewModel(args: BuildOptionArgs): SelectorOptionViewModel {
  const presentation = buildPresentation(args.resourceKind, args.option, args.language);
  const commitValue = args.option.value;
  const canonicalValue = args.option.value;
  return {
    id: [
      args.resourceKind ?? 'plain',
      args.providerId ?? 'shared',
      args.syntheticKind ?? args.option.value ?? 'empty',
      args.option.provider_value ?? '',
    ].join(':'),
    resourceKind: args.resourceKind,
    source: args.source,
    scope: args.scope,
    commitValue,
    canonicalValue,
    providerId: args.providerId,
    providerValue: args.option.provider_value ?? null,
    primaryText: presentation.primary,
    secondaryText: presentation.secondary,
    iconUrl: presentation.iconUrl,
    searchableText: [
      args.option.value,
      args.option.label,
      args.option.hint,
      args.option.provider_value ?? '',
      presentation.primary,
      presentation.secondary,
      ...(args.providers ?? []),
    ].filter(Boolean),
    providers: args.providers,
    option: args.option,
    isSynthetic: args.isSynthetic,
    syntheticKind: args.syntheticKind,
    isDisabled: false,
  };
}

export function selectorOptionFromProvider(
  provider: ProviderManifest,
  language: 'en' | 'zh',
  extra?: Partial<Pick<SelectorOptionViewModel, 'isSynthetic' | 'syntheticKind'>>,
) {
  const option: OptionItem = {
    value: provider.id,
    label: formatProviderLabel(provider.name, language),
    hint: provider.ui?.protocol_label ?? provider.kind,
    icon_url: provider.ui?.icon_url ?? undefined,
  };
  return buildSelectorOptionViewModel({
    resourceKind: 'provider',
    source: 'manifest',
    scope: 'single_provider',
    option,
    language,
    providerId: provider.id,
    isSynthetic: extra?.isSynthetic,
    syntheticKind: extra?.syntheticKind,
  });
}

export function selectorOptionFromCatalogItem(args: {
  item: OptionCatalogItem;
  language: 'en' | 'zh';
  resourceKind?: ResourceKind;
  providerId?: string;
}) {
  const { item, language, resourceKind, providerId } = args;
  const scopedIconUrl = providerId
    ? (item.provider_icon_urls?.[providerId] ?? item.icon_url)
    : item.icon_url;
  const option: OptionItem = {
    value: item.value,
    label: item.label
      || (resourceKind === 'service'
        ? formatServiceLabel(item.value, language)
        : resourceKind === 'country'
          ? formatCountryLabel(item.value, language)
          : item.value),
    hint: item.hint,
    provider_value: providerId ? (item.provider_values[providerId] ?? item.provider_values[item.providers[0]]) : item.provider_values[item.providers[0]],
    icon_url: scopedIconUrl,
    provider_icon_url: scopedIconUrl,
  };
  return buildSelectorOptionViewModel({
    resourceKind,
    source: 'option_catalog',
    scope: 'cross_provider',
    option,
    language,
    providerId,
    providers: item.providers,
  });
}

export function selectorOptionFromOptionItem(args: {
  option: OptionItem;
  language: 'en' | 'zh';
  resourceKind?: ResourceKind;
  providerId?: string;
  source?: SelectorOptionSource;
  scope?: 'single_provider' | 'cross_provider';
  isSynthetic?: boolean;
  syntheticKind?: SelectorOptionViewModel['syntheticKind'];
  isDisabled?: boolean;
}) {
  return buildSelectorOptionViewModel({
    resourceKind: args.resourceKind,
    source: args.source ?? 'provider_options',
    scope: args.scope ?? 'single_provider',
    option: args.option,
    language: args.language,
    providerId: args.providerId,
    isSynthetic: args.isSynthetic,
    syntheticKind: args.syntheticKind,
    isDisabled: args.isDisabled,
  });
}
