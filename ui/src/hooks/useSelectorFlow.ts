import type {
  ActivationFormState,
  OptionItem,
  ProviderDynamicOptions,
  ProviderManifest,
  SelectorKind,
  SelectorState,
} from '../app/types';
import { mergeOptionItems } from '../app/utils';
import { formatCountryLabel } from '../lib/formatters';

const ALL_COUNTRIES_OPTION: OptionItem = { value: '', label: 'All countries', hint: 'Clear country filter' };
const ALL_OPERATORS_OPTION: OptionItem = { value: '', label: 'All operators', hint: 'Clear operator filter' };
const AUTO_PROVIDER_OPTION: OptionItem = { value: 'auto', label: 'Auto — follow routing rules', hint: 'Use routing strategy' };
const AUTO_COUNTRY_OPTION: OptionItem = { value: '', label: 'Any country', hint: 'Auto select country' };

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
      options = [
        AUTO_PROVIDER_OPTION,
        ...runtime.visibleProviders.map((provider) => ({
        value: provider.id,
        label: provider.name,
        hint: provider.kind,
      })),
      ];
      title = 'Select Provider';
    } else if (kind === 'store-service') {
      options = runtime.selectedOptions?.services ?? [];
      title = 'Select Store Service';
    } else if (kind === 'store-country') {
      options = [ALL_COUNTRIES_OPTION, ...(runtime.selectedOptions?.countries ?? [])];
      title = 'Select Store Country';
    } else if (kind === 'store-operator') {
      options = [ALL_OPERATORS_OPTION, ...(runtime.selectedOptions?.operators ?? [])];
      title = 'Select Store Operator';
    } else if (kind === 'activation-service') {
      if (ui.activationForm.provider === 'auto') {
        options = mergeOptionItems(Object.values(runtime.providerOptions).map((item) => item.services));
      } else {
        options = runtime.providerOptions[ui.activationForm.provider]?.services ?? [];
      }
      title = 'Select Activation Service';
    } else if (kind === 'activation-country') {
      if (ui.activationForm.provider === 'auto') {
        options = [AUTO_COUNTRY_OPTION, ...mergeOptionItems(Object.values(runtime.providerOptions).map((item) => item.countries))];
      } else {
        options = [AUTO_COUNTRY_OPTION, ...(runtime.providerOptions[ui.activationForm.provider]?.countries ?? [])];
      }
      title = 'Select Activation Country';
    } else if (kind === 'activation-operator') {
      if (ui.activationForm.provider === 'auto') {
        options = mergeOptionItems(Object.values(runtime.providerOptions).map((item) => item.operators));
      } else {
        options = runtime.providerOptions[ui.activationForm.provider]?.operators ?? [];
      }
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
        provider: option.value,
        service: option.value === 'auto' ? '' : (options?.services[0]?.value ?? current.service),
        country: option.value === 'auto' ? '' : (options?.countries[0]?.value ?? current.country),
        operator: option.value === 'auto' ? '' : (options?.operators[0]?.value ?? current.operator),
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
