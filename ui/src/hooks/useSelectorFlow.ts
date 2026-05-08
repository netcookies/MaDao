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
import { filterCatalogItems } from '../app/utils';
import { formatCountryLabel, formatProviderLabel, formatServiceLabel } from '../lib/formatters';
import { formatOperatorLabel } from '../app/utils';

const ALL_COUNTRIES_OPTION: OptionItem = { value: '', label: 'All countries', hint: 'Clear country filter' };
const ALL_OPERATORS_OPTION: OptionItem = { value: '', label: 'All operators', hint: 'Clear operator filter' };
const AUTO_COUNTRY_OPTION: OptionItem = { value: '', label: 'Any country', hint: 'Auto select country' };
const ANY_PROVIDER_OPTION: OptionItem = { value: ANY_PROVIDER_VALUE, label: 'Any provider', hint: 'Try enabled providers automatically' };

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
    let options: OptionItem[] = [];
    let title = '';
    if (kind === 'service') {
      options = (runtime.selectedOptions?.services ?? []).map(localizedServiceOption);
      title = language === 'zh' ? '选择默认服务' : 'Select Default Service';
    } else if (kind === 'country') {
      options = (runtime.selectedOptions?.countries ?? []).map(localizedCountryOption);
      title = language === 'zh' ? '选择默认国家' : 'Select Default Country';
    } else if (kind === 'provider') {
      options = runtime.visibleProviders.map((provider) => ({
        value: provider.id,
        label: formatProviderLabel(provider.name, language),
        hint: provider.kind,
      }));
      title = language === 'zh' ? '选择 Provider' : 'Select Provider';
    } else if (kind === 'activation-provider') {
      options = [
        {
          ...ANY_PROVIDER_OPTION,
          label: language === 'zh' ? '任意 Provider' : ANY_PROVIDER_OPTION.label,
          hint: language === 'zh' ? '自动尝试已启用的 Provider' : ANY_PROVIDER_OPTION.hint,
        },
        ...runtime.visibleProviders.map((provider) => ({
          value: provider.id,
          label: formatProviderLabel(provider.name, language),
          hint: provider.kind,
        })),
      ];
      title = language === 'zh' ? '选择激活 Provider' : 'Select Activation Provider';
    } else if (kind === 'store-service') {
      options = filterCatalogItems(runtime.optionCatalog.services, ui.selectedProvider).map((item) => ({
        value: item.value,
        label: formatServiceLabel(item.value, language),
        hint: item.hint,
      }));
      title = language === 'zh' ? '选择库存服务' : 'Select Store Service';
    } else if (kind === 'store-country') {
      options = [{
        ...ALL_COUNTRIES_OPTION,
        label: language === 'zh' ? '全部国家' : ALL_COUNTRIES_OPTION.label,
        hint: language === 'zh' ? '清除国家筛选' : ALL_COUNTRIES_OPTION.hint,
      }, ...filterCatalogItems(runtime.optionCatalog.countries, ui.selectedProvider).map((item) => ({
        value: item.value,
        label: formatCountryLabel(item.value, language),
        hint: item.hint,
      }))];
      title = language === 'zh' ? '选择库存国家' : 'Select Store Country';
    } else if (kind === 'store-operator') {
      options = [{
        ...ALL_OPERATORS_OPTION,
        label: language === 'zh' ? '全部运营商' : ALL_OPERATORS_OPTION.label,
        hint: language === 'zh' ? '清除运营商筛选' : ALL_OPERATORS_OPTION.hint,
      }, ...filterCatalogItems(runtime.optionCatalog.operators, ui.selectedProvider).map((item) => ({
        value: item.value,
        label: formatOperatorLabel(item.value, language),
        hint: item.hint,
      }))];
      title = language === 'zh' ? '选择库存运营商' : 'Select Store Operator';
    } else if (kind === 'activation-service') {
      options = filterCatalogItems(runtime.optionCatalog.services, ui.activationForm.provider).map((item) => ({
        value: item.value,
        label: formatServiceLabel(item.value, language),
        hint: item.hint,
      }));
      title = language === 'zh' ? '选择激活服务' : 'Select Activation Service';
    } else if (kind === 'activation-country') {
      options = [{
        ...AUTO_COUNTRY_OPTION,
        label: language === 'zh' ? '任意国家' : AUTO_COUNTRY_OPTION.label,
        hint: language === 'zh' ? '自动选择国家' : AUTO_COUNTRY_OPTION.hint,
      },
        ...filterCatalogItems(runtime.optionCatalog.countries, ui.activationForm.provider).map((item) => ({
          value: item.value,
          label: formatCountryLabel(item.value, language),
          hint: item.hint,
        })),
      ];
      title = language === 'zh' ? '选择激活国家' : 'Select Activation Country';
    } else if (kind === 'activation-operator') {
      options = filterCatalogItems(runtime.optionCatalog.operators, ui.activationForm.provider).map((item) => ({
        value: item.value,
        label: formatOperatorLabel(item.value, language),
        hint: item.hint,
      }));
      title = language === 'zh' ? '选择激活运营商' : 'Select Activation Operator';
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
