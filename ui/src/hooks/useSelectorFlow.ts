import {
  ANY_PROVIDER_VALUE,
  type ActivationFormState,
  type LanguageCode,
  type OptionCatalog,
  type OptionItem,
  type ProviderDynamicOptions,
  type ProviderManifest,
  type ResourceKind,
  type SelectorKind,
  type SelectorState,
} from '../app/types';
import { i18n } from '../app/i18n';
import { filterCatalogItems } from '../app/utils';
import { formatCountryLabel, formatProviderLabel, formatServiceLabel } from '../lib/formatters';
import { formatOperatorLabel } from '../app/utils';
import {
  selectorOptionFromCatalogItem,
  selectorOptionFromOptionItem,
  selectorOptionFromProvider,
} from '../app/selectorViewModel';

type SelectorUiState = {
  selectorState: SelectorState | null;
  setSelectorState: (value: SelectorState | null) => void;
  setSelectorSearch: (value: string) => void;
  activationForm: ActivationFormState;
  setActivationForm: (value: ActivationFormState | ((prev: ActivationFormState) => ActivationFormState)) => void;
  selectedProvider: string;
  language: LanguageCode;
};

type SelectorRuntimeState = {
  selectedOptions?: ProviderDynamicOptions;
  visibleProviders: ProviderManifest[];
  providerOptions: Record<string, ProviderDynamicOptions>;
  optionCatalog: OptionCatalog;
  updateManifestField: (
    providerId: string,
    section: 'root' | 'defaults' | 'handler_api' | 'five_sim' | 'mock',
    field: string,
    value: string | number | boolean,
  ) => void;
  updateStoreQuery: (providerId: string, patch: Record<string, string>) => void;
};

export function useSelectorFlow(
  ui: SelectorUiState,
  runtime: SelectorRuntimeState,
) {
  const language = ui.language;
  const translate = i18n.getFixedT(language);

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

  function openSelector(kind: SelectorKind) {
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
        ...filterCatalogItems(runtime.optionCatalog.countries, ui.selectedProvider).map((item) => selectorOptionFromCatalogItem({
          item,
          language,
          resourceKind: 'country',
          providerId: ui.selectedProvider,
        })),
      ];
      title = translate('Select Store Country');
      resourceKind = 'country';
    } else if (kind === 'store-operator') {
      options = [
        selectorOptionFromOptionItem({
          option: allOperatorsOption,
          language,
          source: 'synthetic',
          scope: 'single_provider',
          isSynthetic: true,
          syntheticKind: 'all_operators',
        }),
        ...filterCatalogItems(runtime.optionCatalog.operators, ui.selectedProvider).map((item) => selectorOptionFromCatalogItem({
          item,
          language,
          providerId: ui.selectedProvider,
        })),
      ];
      title = translate('Select Store Operator');
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
        ...filterCatalogItems(runtime.optionCatalog.countries, ui.activationForm.provider).map((item) => selectorOptionFromCatalogItem({
          item,
          language,
          resourceKind: 'country',
          providerId: ui.activationForm.provider,
        })),
      ];
      title = translate('Select Activation Country');
      resourceKind = 'country';
    } else if (kind === 'activation-operator') {
      options = filterCatalogItems(runtime.optionCatalog.operators, ui.activationForm.provider).map((item) => selectorOptionFromCatalogItem({
        item,
        language,
        providerId: ui.activationForm.provider,
      }));
      title = translate('Select Activation Operator');
    } else if (kind === 'routing-service') {
      resourceKind = 'service';
    } else if (kind === 'routing-item-provider') {
      resourceKind = 'provider';
    } else if (kind === 'routing-item-country') {
      resourceKind = 'country';
    }
    ui.setSelectorSearch('');
    ui.setSelectorState({ kind, title, options, resourceKind });
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
