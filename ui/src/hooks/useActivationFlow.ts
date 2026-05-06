import type {
  ActivationFormState,
  TicketRecord,
  SelectorKind,
} from '../app/types';
import { acquireActivation, failoverRoutingTicket, pollActivationTicket, releaseActivationTicket } from '../services/runtimeApi';

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

  async function releaseTicket(ticket: Pick<TicketRecord, 'id' | 'provider' | 'service' | 'country' | 'routing_plan_id' | 'routing_item_id'>, action: 'finish' | 'cancel' | 'retry') {
    try {
      ui.setBusyAction(`${action}-${ticket.id}`);
      if (action === 'retry' && ticket.routing_plan_id) {
        await failoverRoutingTicket(ticket.id, ticket.routing_item_id ?? undefined, 'ui retry requested');
        ui.setStatusMessage(`Ticket ${ticket.id} failed over to the next routing item.`);
      } else {
        await releaseActivationTicket(ticket.id, action);
        ui.setStatusMessage(`Ticket ${ticket.id} ${action} complete.`);
      }
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
      if (ui.activationForm.routing_plan_id) {
        await acquireActivation({
          provider: 'auto',
          routing_plan_id: ui.activationForm.routing_plan_id,
        });
      } else {
        const body: Record<string, unknown> = {
          provider: ui.activationForm.provider,
          service: ui.activationForm.service || undefined,
          country: ui.activationForm.country || undefined,
        };
        if (ui.activationForm.min_price !== '') body.min_price = Number(ui.activationForm.min_price);
        if (ui.activationForm.max_price !== '') body.max_price = Number(ui.activationForm.max_price);
        if (ui.activationForm.operator) body.metadata = { operator: ui.activationForm.operator };
        await acquireActivation(body);
      }
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
    routing_plan_id?: string | null;
  }) {
    ui.setActivationForm((current) => ({
      ...current,
      routing_plan_id: ticket.routing_plan_id ?? '',
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
