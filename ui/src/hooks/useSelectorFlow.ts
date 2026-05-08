import {
  ANY_PROVIDER_VALUE,
  type ActivationFormState,
  type LanguageCode,
  type OptionCatalog,
  type OptionItem,
  type ProviderDynamicOptions,
  type ProviderManifest,
  type SelectorKind,
  type SelectorState,
} from '../app/types';
import { i18n } from '../app/i18n';
import { filterCatalogItems } from '../app/utils';
import { formatCountryLabel, formatProviderLabel, formatServiceLabel } from '../lib/formatters';
import { formatOperatorLabel } from '../app/utils';

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
      label: formatServiceLabel(option.value, language),
    };
  }

  function localizedCountryOption(option: OptionItem): OptionItem {
    return {
      ...option,
      label: formatCountryLabel(option.value, language),
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
    let options: OptionItem[] = [];
    let title = '';
    if (kind === 'service') {
      options = (runtime.selectedOptions?.services ?? []).map(localizedServiceOption);
      title = translate('Select Default Service');
    } else if (kind === 'country') {
      options = (runtime.selectedOptions?.countries ?? []).map(localizedCountryOption);
      title = translate('Select Default Country');
    } else if (kind === 'provider') {
      options = runtime.visibleProviders.map((provider) => ({
        value: provider.id,
        label: formatProviderLabel(provider.name, language),
        hint: provider.kind,
      }));
      title = translate('Select Provider');
    } else if (kind === 'activation-provider') {
      options = [
        anyProviderOption,
        ...runtime.visibleProviders.map((provider) => ({
          value: provider.id,
          label: formatProviderLabel(provider.name, language),
          hint: provider.kind,
        })),
      ];
      title = translate('Select Activation Provider');
    } else if (kind === 'store-service') {
      options = filterCatalogItems(runtime.optionCatalog.services, ui.selectedProvider).map((item) => ({
        value: item.value,
        label: formatServiceLabel(item.value, language),
        hint: item.hint,
      }));
      title = translate('Select Store Service');
    } else if (kind === 'store-country') {
      options = [allCountriesOption, ...filterCatalogItems(runtime.optionCatalog.countries, ui.selectedProvider).map((item) => ({
        value: item.value,
        label: formatCountryLabel(item.value, language),
        hint: item.hint,
      }))];
      title = translate('Select Store Country');
    } else if (kind === 'store-operator') {
      options = [allOperatorsOption, ...filterCatalogItems(runtime.optionCatalog.operators, ui.selectedProvider).map((item) => ({
        value: item.value,
        label: formatOperatorLabel(item.value, language),
        hint: item.hint,
      }))];
      title = translate('Select Store Operator');
    } else if (kind === 'activation-service') {
      options = filterCatalogItems(runtime.optionCatalog.services, ui.activationForm.provider).map((item) => ({
        value: item.value,
        label: formatServiceLabel(item.value, language),
        hint: item.hint,
      }));
      title = translate('Select Activation Service');
    } else if (kind === 'activation-country') {
      options = [autoCountryOption,
        ...filterCatalogItems(runtime.optionCatalog.countries, ui.activationForm.provider).map((item) => ({
          value: item.value,
          label: formatCountryLabel(item.value, language),
          hint: item.hint,
        })),
      ];
      title = translate('Select Activation Country');
    } else if (kind === 'activation-operator') {
      options = filterCatalogItems(runtime.optionCatalog.operators, ui.activationForm.provider).map((item) => ({
        value: item.value,
        label: formatOperatorLabel(item.value, language),
        hint: item.hint,
      }));
      title = translate('Select Activation Operator');
    }
    ui.setSelectorSearch('');
    ui.setSelectorState({ kind, title, options });
  }

  function applySelectorOption(option: OptionItem) {
    if (!ui.selectorState) return;
    if (ui.selectorState.kind === 'service' || ui.selectorState.kind === 'country') {
      runtime.updateManifestField(ui.selectedProvider, 'defaults', ui.selectorState.kind, option.value);
    } else if (ui.selectorState.kind === 'store-service') {
      runtime.updateStoreQuery(ui.selectedProvider, { service: option.value });
    } else if (ui.selectorState.kind === 'store-country') {
      runtime.updateStoreQuery(ui.selectedProvider, { country: option.value });
    } else if (ui.selectorState.kind === 'store-operator') {
      runtime.updateStoreQuery(ui.selectedProvider, { operator: option.value });
    } else if (ui.selectorState.kind === 'provider') {
      const options = runtime.providerOptions[option.value];
      ui.setActivationForm((current) => ({
        ...current,
        routing_plan_id: '',
        provider: option.value,
        service: options?.services[0]?.value ?? current.service,
        country: options?.countries[0]?.value ?? current.country,
        operator: options?.operators[0]?.value ?? current.operator,
      }));
    } else if (ui.selectorState.kind === 'activation-provider') {
      ui.setActivationForm((current) => ({
        ...current,
        provider: option.value,
        service: current.service,
        country: '',
        operator: '',
      }));
    } else if (ui.selectorState.kind === 'activation-service') {
      ui.setActivationForm((current) => ({ ...current, service: option.value }));
    } else if (ui.selectorState.kind === 'activation-country') {
      ui.setActivationForm((current) => ({ ...current, country: option.value }));
    } else if (ui.selectorState.kind === 'activation-operator') {
      ui.setActivationForm((current) => ({ ...current, operator: option.value }));
    }
    ui.setSelectorState(null);
  }

  return {
    openSelector,
    applySelectorOption,
  };
}
