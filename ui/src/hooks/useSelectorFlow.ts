import type {
  ActivationFormState,
  OptionItem,
  ProviderDynamicOptions,
  ProviderManifest,
  SelectorKind,
  SelectorState,
} from '../app/types';
import { mergeOptionItems } from '../app/utils';

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
      options = runtime.visibleProviders.map((provider) => ({
        value: provider.id,
        label: provider.name,
        hint: provider.kind,
      }));
      title = 'Select Provider';
    } else if (kind === 'store-service') {
      options = runtime.selectedOptions?.services ?? [];
      title = 'Select Store Service';
    } else if (kind === 'store-country') {
      options = runtime.selectedOptions?.countries ?? [];
      title = 'Select Store Country';
    } else if (kind === 'store-operator') {
      options = runtime.selectedOptions?.operators ?? [];
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
        options = mergeOptionItems(Object.values(runtime.providerOptions).map((item) => item.countries));
      } else {
        options = runtime.providerOptions[ui.activationForm.provider]?.countries ?? [];
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
        service: options?.services[0]?.value ?? current.service,
        country: options?.countries[0]?.value ?? current.country,
        operator: options?.operators[0]?.value ?? current.operator,
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
