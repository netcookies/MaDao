import type {
  ActivationFormState,
  ProviderManifest,
  SelectorKind,
} from '../app/types';
import { acquireActivation, pollActivationTicket, releaseActivationTicket } from '../services/runtimeApi';

type ActivationUiState = {
  activationForm: ActivationFormState;
  setActivationForm: (value: ActivationFormState | ((prev: ActivationFormState) => ActivationFormState)) => void;
  activationBusy: boolean;
  setActivationBusy: (value: boolean) => void;
  activationError: string;
  setActivationError: (value: string) => void;
  showActivationModal: boolean;
  setShowActivationModal: (value: boolean) => void;
  busyAction: string;
  setBusyAction: (value: string) => void;
  setStatusMessage: (value: string) => void;
};

type ActivationRuntimeActions = {
  loadSnapshot: () => Promise<void>;
  loadNotifications: () => Promise<void>;
};

export function useActivationFlow(
  ui: ActivationUiState,
  runtime: ActivationRuntimeActions,
) {
  async function pollTicket(ticketId: string) {
    try {
      ui.setBusyAction(`poll-${ticketId}`);
      await pollActivationTicket(ticketId);
      ui.setStatusMessage(`Ticket ${ticketId} refreshed.`);
      await Promise.all([runtime.loadSnapshot(), runtime.loadNotifications()]);
    } catch (error) {
      ui.setStatusMessage(`Failed to refresh ticket: ${String(error)}`);
    } finally {
      ui.setBusyAction('');
    }
  }

  async function releaseTicket(ticketId: string, action: 'finish' | 'cancel' | 'retry') {
    try {
      ui.setBusyAction(`${action}-${ticketId}`);
      await releaseActivationTicket(ticketId, action);
      ui.setStatusMessage(`Ticket ${ticketId} ${action} complete.`);
      await Promise.all([runtime.loadSnapshot(), runtime.loadNotifications()]);
    } catch (error) {
      ui.setStatusMessage(`Failed to update ticket: ${String(error)}`);
    } finally {
      ui.setBusyAction('');
    }
  }

  async function copyToClipboard(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      ui.setStatusMessage(`${label} copied.`);
    } catch (error) {
      ui.setStatusMessage(`Copy failed: ${String(error)}`);
    }
  }

  async function submitActivation() {
    ui.setActivationBusy(true);
    ui.setActivationError('');
    try {
      const body: Record<string, unknown> = {
        provider: ui.activationForm.provider,
        service: ui.activationForm.service || undefined,
        country: ui.activationForm.country || undefined,
      };
      if (ui.activationForm.min_price !== '') body.min_price = Number(ui.activationForm.min_price);
      if (ui.activationForm.max_price !== '') body.max_price = Number(ui.activationForm.max_price);
      if (ui.activationForm.operator) body.metadata = { operator: ui.activationForm.operator };
      await acquireActivation(body);
      ui.setShowActivationModal(false);
      ui.setStatusMessage('Activation created, waiting for SMS code.');
      await Promise.all([runtime.loadSnapshot(), runtime.loadNotifications()]);
    } catch (error) {
      ui.setActivationError(String(error));
    } finally {
      ui.setActivationBusy(false);
    }
  }

  function primeActivationFromTicket(ticket: {
    provider: string;
    service: string;
    country: string;
  }) {
    ui.setActivationForm((current) => ({
      ...current,
      provider: ticket.provider,
      service: ticket.service,
      country: ticket.country,
    }));
    ui.setShowActivationModal(true);
  }

  function closeActivationModal() {
    ui.setShowActivationModal(false);
    ui.setActivationError('');
  }

  function updateActivationField(field: keyof ActivationFormState, value: string) {
    ui.setActivationForm((current) => ({ ...current, [field]: value }));
  }

  return {
    pollTicket,
    releaseTicket,
    copyToClipboard,
    submitActivation,
    primeActivationFromTicket,
    closeActivationModal,
    updateActivationField,
  };
}
