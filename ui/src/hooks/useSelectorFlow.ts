import {
  ANY_PROVIDER_VALUE,
  type ActivationFormState,
  type OptionCatalog,
  type OptionItem,
  type ProviderDynamicOptions,
  type ProviderManifest,
  type SelectorKind,
  type SelectorState,
} from '../app/types';
import { filterCatalogItems } from '../app/utils';

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
  function openSelector(kind: SelectorKind) {
    let options: OptionItem[] = [];
    let title = '';
    if (kind === 'service') {
      options = runtime.selectedOptions?.services ?? [];
      title = 'Select Default Service';
    } else if (kind === 'country') {
      options = runtime.selectedOptions?.countries ?? [];
      title = 'Select Default Country';
    } else if (kind === 'provider') {
      options = runtime.visibleProviders.map((provider) => ({
        value: provider.id,
        label: provider.name,
        hint: provider.kind,
      }));
      title = 'Select Provider';
    } else if (kind === 'activation-provider') {
      options = [
        ANY_PROVIDER_OPTION,
        ...runtime.visibleProviders.map((provider) => ({
          value: provider.id,
          label: provider.name,
          hint: provider.kind,
        })),
      ];
      title = 'Select Activation Provider';
    } else if (kind === 'store-service') {
      options = filterCatalogItems(runtime.optionCatalog.services, ui.selectedProvider).map((item) => ({
        value: item.value,
        label: item.label,
        hint: item.hint,
      }));
      title = 'Select Store Service';
    } else if (kind === 'store-country') {
      options = [ALL_COUNTRIES_OPTION, ...filterCatalogItems(runtime.optionCatalog.countries, ui.selectedProvider).map((item) => ({
        value: item.value,
        label: item.label,
        hint: item.hint,
      }))];
      title = 'Select Store Country';
    } else if (kind === 'store-operator') {
      options = [ALL_OPERATORS_OPTION, ...filterCatalogItems(runtime.optionCatalog.operators, ui.selectedProvider).map((item) => ({
        value: item.value,
        label: item.label,
        hint: item.hint,
      }))];
      title = 'Select Store Operator';
    } else if (kind === 'activation-service') {
      options = filterCatalogItems(runtime.optionCatalog.services, ui.activationForm.provider).map((item) => ({
        value: item.value,
        label: item.label,
        hint: item.hint,
      }));
      title = 'Select Activation Service';
    } else if (kind === 'activation-country') {
      options = [
        AUTO_COUNTRY_OPTION,
        ...filterCatalogItems(runtime.optionCatalog.countries, ui.activationForm.provider).map((item) => ({
          value: item.value,
          label: item.label,
          hint: item.hint,
        })),
      ];
      title = 'Select Activation Country';
    } else if (kind === 'activation-operator') {
      options = filterCatalogItems(runtime.optionCatalog.operators, ui.activationForm.provider).map((item) => ({
        value: item.value,
        label: item.label,
        hint: item.hint,
      }));
      title = 'Select Activation Operator';
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
