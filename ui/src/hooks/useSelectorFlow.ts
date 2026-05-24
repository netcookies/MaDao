import {
  ANY_PROVIDER_VALUE,
  type ActivationFormState,
  type LanguageCode,
  type OpenAiSmsRegionsCache,
  type OptionCatalog,
  type OptionItem,
  type ProviderDynamicOptions,
  type ProviderManifest,
  type ResourceKind,
  type SelectorKind,
  type SelectorState,
} from '../app/types';
import { i18n } from '../app/i18n';
import {
  filterCatalogItems,
  filterCountriesByOpenAiSmsAvailability,
  filterPriceItemsByOpenAiSmsAvailability,
  operatorCountryCacheKey,
} from '../app/utils';
import { formatCountryLabel, formatProviderLabel, formatServiceLabel } from '../lib/formatters';
import { formatOperatorLabel } from '../app/utils';
import { fetchProviderOperators, fetchProviderPrices } from '../services/runtimeApi';
import {
  selectorOptionFromCatalogItem,
  selectorOptionFromOptionItem,
  selectorOptionFromProvider,
} from '../app/selectorViewModel';

type SelectorUiState = {
  selectorState: SelectorState | null;
  setSelectorState: (value: SelectorState | null | ((prev: SelectorState | null) => SelectorState | null)) => void;
  setSelectorSearch: (value: string) => void;
  activationForm: ActivationFormState;
  storeQuery: { service: string; country: string };
  setActivationForm: (value: ActivationFormState | ((prev: ActivationFormState) => ActivationFormState)) => void;
  selectedProvider: string;
  language: LanguageCode;
};

type SelectorRuntimeState = {
  selectedOptions?: ProviderDynamicOptions;
  visibleProviders: ProviderManifest[];
  providerOptions: Record<string, ProviderDynamicOptions>;
  optionCatalog: OptionCatalog;
  openAiSmsRegions: OpenAiSmsRegionsCache;
  onlyShowOpenAiSmsCountries: boolean;
  setProviderOptions: (value: Record<string, ProviderDynamicOptions> | ((prev: Record<string, ProviderDynamicOptions>) => Record<string, ProviderDynamicOptions>)) => void;
  updateManifestField: (
    providerId: string,
    section: 'root' | 'defaults' | 'handler_api' | 'five_sim' | 'mock',
    field: string,
    value: string | number | boolean,
  ) => void;
  updateStoreQuery: (providerId: string, patch: Record<string, string>) => void;
};

function operatorSelectionDisabled(provider?: ProviderManifest) {
  return provider?.behavior?.operator_selectable === false;
}

function operatorDisabledLabel(language: 'en' | 'zh') {
  return i18n.getFixedT(language)('Not supported');
}

export function useSelectorFlow(
  ui: SelectorUiState,
  runtime: SelectorRuntimeState,
) {
  const language = ui.language;
  const translate = i18n.getFixedT(language);

  function dedupeSelectorOptions(options: SelectorState['options']) {
    const seen = new Set<string>();
    return options.filter((option) => {
      const normalizedValue = option.commitValue.trim().toLowerCase();
      const key = normalizedValue === 'any' ? '' : normalizedValue;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function localizedServiceOption(option: OptionItem): OptionItem {
    return {
      ...option,
      label: option.label || formatServiceLabel(option.value, language),
    };
  }

  function localizedCountryOption(option: OptionItem): OptionItem {
    return {
      ...option,
      label: option.label || formatCountryLabel(option.value, language),
    };
  }

  function localizedOperatorOption(option: OptionItem): OptionItem {
    return {
      ...option,
      label: formatOperatorLabel(option.value, language),
    };
  }

  function countryCatalogItemsForService(providerId: string, service?: string) {
    return filterCountriesByOpenAiSmsAvailability(
      filterCatalogItems(runtime.optionCatalog.countries, providerId),
      runtime.openAiSmsRegions,
      runtime.onlyShowOpenAiSmsCountries,
      service,
    );
  }

  function normalizeFetchedOperators(items: OptionItem[]) {
    return items
      .map(localizedOperatorOption)
      .filter((option) => {
        const value = option.value.trim().toLowerCase();
        return value !== '' && value !== 'any' && value !== 'default';
      });
  }

  function getCachedOperatorsForProvider(providerId: string, country?: string): OptionItem[] | null {
    const options = runtime.providerOptions[providerId];
    if (!options) return null;
    const countryKey = operatorCountryCacheKey(country);
    if (countryKey && options.operators_by_country?.[countryKey]?.operators?.length) {
      return options.operators_by_country[countryKey].operators;
    }
    if (!countryKey && options.operators.length > 0) {
      return options.operators;
    }
    return null;
  }

  function writeOperatorsToProviderCache(providerId: string, operators: OptionItem[], country?: string) {
    runtime.setProviderOptions((current) => {
      const existing = current[providerId];
      if (!existing) return current;
      const countryKey = operatorCountryCacheKey(country);
      return {
        ...current,
        [providerId]: {
          ...existing,
          ...(countryKey
            ? {
              operators_by_country: {
                ...(existing.operators_by_country ?? {}),
                [countryKey]: {
                  raw_operators: operators,
                  operators,
                  fetched_at: new Date().toISOString(),
                },
              },
            }
            : {
              raw_operators: operators,
              operators,
            }),
        },
      };
    });
  }

  async function refreshOperatorsForProvider(providerId: string, country?: string): Promise<OptionItem[] | null> {
    if (!providerId || providerId === 'any') return null;
    try {
      const response = await fetchProviderOperators(providerId, {
        country: country?.trim() ? country : undefined,
      });
      const operators = normalizeFetchedOperators(response.items);
      if (operators.length === 0) return null;
      writeOperatorsToProviderCache(providerId, operators, country);
      return operators;
    } catch {
      // Selector 打开时静默回退到现有 catalog，避免因单次上游失败打断交互。
      return null;
    }
  }

  async function fetchPriceDerivedOperators(
    providerId: string,
    service?: string,
    country?: string,
  ): Promise<OptionItem[] | null> {
    if (!providerId || providerId === 'any' || !service?.trim()) return null;
    try {
      const response = await fetchProviderPrices(providerId, service, {
        country: country?.trim() ? country : undefined,
      });
      const operators = filterPriceItemsByOpenAiSmsAvailability(
        response.items,
        runtime.openAiSmsRegions,
        runtime.onlyShowOpenAiSmsCountries,
        service,
      )
        .filter((item) => {
          const value = item.operator.trim().toLowerCase();
          return value !== '' && value !== 'any' && value !== 'default';
        })
        .map((item) => localizedOperatorOption({
          value: item.operator,
          label: item.operator_label ?? item.operator,
          hint: 'price-derived',
          provider_value: item.provider_operator ?? item.operator,
        }));
      return operators.length > 0 ? operators : null;
    } catch {
      return null;
    }
  }

  async function openSelector(kind: SelectorKind) {
    const allCountriesOption: OptionItem = { value: '', label: translate('All countries'), hint: translate('Clear country filter') };
    const allOperatorsOption: OptionItem = { value: '', label: translate('All operators'), hint: translate('Clear operator filter') };
    const autoCountryOption: OptionItem = { value: '', label: translate('Any country'), hint: translate('Auto select country') };
    const anyProviderOption: OptionItem = { value: ANY_PROVIDER_VALUE, label: translate('Any provider'), hint: translate('Try enabled providers automatically') };
    let options: SelectorState['options'] = [];
    let title = '';
    let resourceKind: ResourceKind | undefined;
    if (kind === 'service') {
      options = (runtime.selectedOptions?.services ?? []).map((option) => selectorOptionFromOptionItem({
        option: localizedServiceOption(option),
        language,
        resourceKind: 'service',
        providerId: ui.selectedProvider,
      }));
      title = translate('Select Default Service');
      resourceKind = 'service';
    } else if (kind === 'country') {
      options = (runtime.selectedOptions?.countries ?? []).map((option) => selectorOptionFromOptionItem({
        option: localizedCountryOption(option),
        language,
        resourceKind: 'country',
        providerId: ui.selectedProvider,
      }));
      title = translate('Select Default Country');
      resourceKind = 'country';
    } else if (kind === 'provider') {
      options = runtime.visibleProviders.map((provider) => selectorOptionFromProvider(provider, language));
      title = translate('Select Provider');
      resourceKind = 'provider';
    } else if (kind === 'activation-provider') {
      options = [
        selectorOptionFromOptionItem({
          option: anyProviderOption,
          language,
          resourceKind: 'provider',
          source: 'synthetic',
          scope: 'cross_provider',
          isSynthetic: true,
          syntheticKind: 'any_provider',
        }),
        ...runtime.visibleProviders.map((provider) => selectorOptionFromProvider(provider, language)),
      ];
      title = translate('Select Activation Provider');
      resourceKind = 'provider';
    } else if (kind === 'store-service') {
      options = filterCatalogItems(runtime.optionCatalog.services, ui.selectedProvider).map((item) => selectorOptionFromCatalogItem({
        item,
        language,
        resourceKind: 'service',
        providerId: ui.selectedProvider,
      }));
      title = translate('Select Store Service');
      resourceKind = 'service';
    } else if (kind === 'store-country') {
      const storeService = ui.storeQuery.service;
      options = [
        selectorOptionFromOptionItem({
          option: allCountriesOption,
          language,
          resourceKind: 'country',
          source: 'synthetic',
          scope: 'single_provider',
          isSynthetic: true,
          syntheticKind: 'all_countries',
        }),
        ...countryCatalogItemsForService(ui.selectedProvider, storeService).map((item) => selectorOptionFromCatalogItem({
          item,
          language,
          resourceKind: 'country',
          providerId: ui.selectedProvider,
        })),
      ];
      title = translate('Select Store Country');
      resourceKind = 'country';
    } else if (kind === 'store-operator') {
      const provider = runtime.visibleProviders.find((entry) => entry.id === ui.selectedProvider);
      const operatorLocked = operatorSelectionDisabled(provider);
      const cachedOperators = getCachedOperatorsForProvider(ui.selectedProvider, ui.storeQuery.country);
      const fetchedOperators = cachedOperators;
      const fetchedOperatorOptions = fetchedOperators
        ? fetchedOperators.map((option) => selectorOptionFromOptionItem({
          option,
          language,
          providerId: ui.selectedProvider,
        }))
        : [];
      const catalogOperatorOptions = filterCatalogItems(runtime.optionCatalog.operators, ui.selectedProvider).map((item) => selectorOptionFromCatalogItem({
        item,
        language,
        providerId: ui.selectedProvider,
      }));
      options = [
        selectorOptionFromOptionItem({
          option: allOperatorsOption,
          language,
          source: 'synthetic',
          scope: 'single_provider',
          isSynthetic: true,
          syntheticKind: 'all_operators',
        }),
        ...dedupeSelectorOptions([
          ...fetchedOperatorOptions,
          ...catalogOperatorOptions,
        ]).map((option) => operatorLocked && option.commitValue !== ''
          ? { ...option, isDisabled: true, secondaryText: operatorDisabledLabel(language) }
          : option),
      ];
      title = translate('Select Store Operator');
      queueMicrotask(() => {
        void fetchPriceDerivedOperators(
          ui.selectedProvider,
          ui.storeQuery.service,
          ui.storeQuery.country,
        ).then((priceDerivedOperators) => {
          const nextPriceOptions = priceDerivedOperators
            ? priceDerivedOperators.map((option) => selectorOptionFromOptionItem({
              option,
              language,
              providerId: ui.selectedProvider,
            }))
            : [];
          ui.setSelectorState((current) => current?.kind === 'store-operator'
            ? {
              ...current,
              options: dedupeSelectorOptions([
                selectorOptionFromOptionItem({
                  option: allOperatorsOption,
                  language,
                  source: 'synthetic',
                  scope: 'single_provider',
                  isSynthetic: true,
                  syntheticKind: 'all_operators',
                }),
                ...nextPriceOptions,
                ...(current.options.filter((option) => !option.isSynthetic)),
              ]).map((option) => operatorLocked && option.commitValue !== ''
                ? { ...option, isDisabled: true, secondaryText: operatorDisabledLabel(language) }
                : option),
            }
            : current);
        });
        void refreshOperatorsForProvider(ui.selectedProvider, ui.storeQuery.country).then((latestOperators) => {
          if (!latestOperators) return;
          ui.setSelectorState((current) => current?.kind === 'store-operator'
            ? {
              ...current,
              options: dedupeSelectorOptions([
                selectorOptionFromOptionItem({
                  option: allOperatorsOption,
                  language,
                  source: 'synthetic',
                  scope: 'single_provider',
                  isSynthetic: true,
                  syntheticKind: 'all_operators',
                }),
                ...latestOperators.map((option) => selectorOptionFromOptionItem({
                  option,
                  language,
                  providerId: ui.selectedProvider,
                })),
                ...(current.options.filter((option) => !option.isSynthetic)),
              ]).map((option) => operatorLocked && option.commitValue !== ''
                ? { ...option, isDisabled: true, secondaryText: operatorDisabledLabel(language) }
                : option),
            }
            : current);
        });
      });
    } else if (kind === 'activation-service') {
      options = filterCatalogItems(runtime.optionCatalog.services, ui.activationForm.provider).map((item) => selectorOptionFromCatalogItem({
        item,
        language,
        resourceKind: 'service',
        providerId: ui.activationForm.provider,
      }));
      title = translate('Select Activation Service');
      resourceKind = 'service';
    } else if (kind === 'activation-country') {
      const activationService = ui.activationForm.service;
      options = [
        selectorOptionFromOptionItem({
          option: autoCountryOption,
          language,
          resourceKind: 'country',
          source: 'synthetic',
          scope: 'single_provider',
          isSynthetic: true,
          syntheticKind: 'any_country',
        }),
        ...countryCatalogItemsForService(ui.activationForm.provider, activationService).map((item) => selectorOptionFromCatalogItem({
          item,
          language,
          resourceKind: 'country',
          providerId: ui.activationForm.provider,
        })),
      ];
      title = translate('Select Activation Country');
      resourceKind = 'country';
    } else if (kind === 'activation-operator') {
      const provider = runtime.visibleProviders.find((entry) => entry.id === ui.activationForm.provider);
      const operatorLocked = operatorSelectionDisabled(provider);
      const fetchedOperators = getCachedOperatorsForProvider(ui.activationForm.provider, ui.activationForm.country);
      const fetchedOperatorOptions = fetchedOperators
        ? fetchedOperators.map((option) => selectorOptionFromOptionItem({
          option,
          language,
          providerId: ui.activationForm.provider,
        }))
        : [];
      const catalogOperatorOptions = filterCatalogItems(runtime.optionCatalog.operators, ui.activationForm.provider).map((item) => selectorOptionFromCatalogItem({
        item,
        language,
        providerId: ui.activationForm.provider,
      }));
      options = [
        selectorOptionFromOptionItem({
          option: allOperatorsOption,
          language,
          source: 'synthetic',
          scope: 'single_provider',
          isSynthetic: true,
          syntheticKind: 'all_operators',
        }),
        ...dedupeSelectorOptions([
          ...fetchedOperatorOptions,
          ...catalogOperatorOptions,
        ]).map((option) => operatorLocked && option.commitValue !== ''
          ? { ...option, isDisabled: true, secondaryText: operatorDisabledLabel(language) }
          : option),
      ];
      title = translate('Select Activation Operator');
      const activationProviderId = ui.activationForm.provider;
      const activationCountry = ui.activationForm.country;
      const activationService = ui.activationForm.service?.trim() || undefined;
      queueMicrotask(() => {
        void fetchPriceDerivedOperators(
          activationProviderId,
          activationService,
          activationCountry,
        ).then((priceDerivedOperators) => {
          const nextPriceOptions = priceDerivedOperators
            ? priceDerivedOperators.map((option) => selectorOptionFromOptionItem({
              option,
              language,
              providerId: activationProviderId,
            }))
            : [];
          ui.setSelectorState((current) => current?.kind === 'activation-operator'
            ? {
              ...current,
              options: dedupeSelectorOptions([
                selectorOptionFromOptionItem({
                  option: allOperatorsOption,
                  language,
                  source: 'synthetic',
                  scope: 'single_provider',
                  isSynthetic: true,
                  syntheticKind: 'all_operators',
                }),
                ...nextPriceOptions,
                ...(current.options.filter((option) => !option.isSynthetic)),
              ]).map((option) => operatorLocked && option.commitValue !== ''
                ? { ...option, isDisabled: true, secondaryText: operatorDisabledLabel(language) }
                : option),
            }
            : current);
        });
        void refreshOperatorsForProvider(activationProviderId, activationCountry).then((latestOperators) => {
          if (!latestOperators) return;
          ui.setSelectorState((current) => current?.kind === 'activation-operator'
            ? {
              ...current,
              options: dedupeSelectorOptions([
                selectorOptionFromOptionItem({
                  option: allOperatorsOption,
                  language,
                  source: 'synthetic',
                  scope: 'single_provider',
                  isSynthetic: true,
                  syntheticKind: 'all_operators',
                }),
                ...latestOperators.map((option) => selectorOptionFromOptionItem({
                  option,
                  language,
                  providerId: activationProviderId,
                })),
                ...(current.options.filter((option) => !option.isSynthetic)),
              ]).map((option) => operatorLocked && option.commitValue !== ''
                ? { ...option, isDisabled: true, secondaryText: operatorDisabledLabel(language) }
                : option),
            }
            : current);
        });
      });
    } else if (kind === 'routing-service') {
      resourceKind = 'service';
    } else if (kind === 'routing-item-provider') {
      resourceKind = 'provider';
    } else if (kind === 'routing-item-country') {
      resourceKind = 'country';
    }
    ui.setSelectorSearch('');
    ui.setSelectorState({ kind, title, options: dedupeSelectorOptions(options), resourceKind });
  }

  function applySelectorOption(option: SelectorState['options'][number]) {
    if (!ui.selectorState) return;
    const commitValue = option.commitValue;
    if (ui.selectorState.kind === 'service' || ui.selectorState.kind === 'country') {
      runtime.updateManifestField(ui.selectedProvider, 'defaults', ui.selectorState.kind, commitValue);
    } else if (ui.selectorState.kind === 'store-service') {
      runtime.updateStoreQuery(ui.selectedProvider, { service: commitValue });
    } else if (ui.selectorState.kind === 'store-country') {
      runtime.updateStoreQuery(ui.selectedProvider, { country: commitValue });
      if (commitValue) {
        void refreshOperatorsForProvider(ui.selectedProvider, commitValue);
      }
    } else if (ui.selectorState.kind === 'store-operator') {
      runtime.updateStoreQuery(ui.selectedProvider, { operator: commitValue });
    } else if (ui.selectorState.kind === 'provider') {
      const options = runtime.providerOptions[commitValue];
      ui.setActivationForm((current) => ({
        ...current,
        routing_plan_id: '',
        provider: commitValue,
        service: options?.services[0]?.value ?? current.service,
        country: options?.countries[0]?.value ?? current.country,
        operator: options?.operators[0]?.value ?? current.operator,
      }));
    } else if (ui.selectorState.kind === 'activation-provider') {
      ui.setActivationForm((current) => ({
        ...current,
        provider: commitValue,
        service: current.service,
        country: '',
        operator: '',
      }));
    } else if (ui.selectorState.kind === 'activation-service') {
      ui.setActivationForm((current) => ({ ...current, service: commitValue }));
    } else if (ui.selectorState.kind === 'activation-country') {
      ui.setActivationForm((current) => ({ ...current, country: commitValue }));
      if (ui.activationForm.provider && commitValue) {
        void refreshOperatorsForProvider(ui.activationForm.provider, commitValue);
      }
    } else if (ui.selectorState.kind === 'activation-operator') {
      ui.setActivationForm((current) => ({ ...current, operator: commitValue }));
    }
    ui.setSelectorState(null);
  }

    return {
      openSelector,
      applySelectorOption,
    };
  }
