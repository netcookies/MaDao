import {
  ANY_PROVIDER_VALUE,
  type ActivationFormState,
  type LanguageCode,
  type MessageFilter,
  type ReleaseCodeResponse,
  type TicketRecord,
  type SelectorKind,
} from '../app/types';
import { i18n } from '../app/i18n';
import { formatProviderErrorMessage } from '../app/providerErrors';
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
  setMessageFilter: (value: MessageFilter) => void;
  language: LanguageCode;
};

type ActivationRuntimeActions = {
  loadSnapshot: () => Promise<void>;
  refreshBalancesAfterAcquire: (providerId?: string) => Promise<void>;
};

export function useActivationFlow(
  ui: ActivationUiState,
  runtime: ActivationRuntimeActions,
) {
  const translate = i18n.getFixedT(ui.language);

  function getErrorMessage(error: unknown) {
    return formatProviderErrorMessage(error, ui.language);
  }

  function isCancelPending(response: ReleaseCodeResponse) {
    return response.status === 'cancel_pending'
      || response.status === 'CancelPending';
  }

  async function pollTicket(ticketId: string, options?: { silent?: boolean }) {
    try {
      ui.setBusyAction(`poll-${ticketId}`);
      await pollActivationTicket(ticketId);
      if (!options?.silent) {
        ui.setStatusMessage(translate('ticket_refreshed', { ticket: ticketId }));
      }
      await runtime.loadSnapshot();
    } catch (error) {
      if (!options?.silent) {
        ui.setStatusMessage(translate('failed_refresh_ticket', { error: getErrorMessage(error) }));
      }
    } finally {
      ui.setBusyAction('');
    }
  }

  async function releaseTicket(ticket: Pick<TicketRecord, 'id' | 'provider' | 'service' | 'country' | 'routing_plan_id' | 'routing_item_id'>, action: 'finish' | 'cancel' | 'retry') {
    try {
      ui.setBusyAction(`${action}-${ticket.id}`);
      if (action === 'retry' && ticket.routing_plan_id) {
        const nextTicket = await failoverRoutingTicket(ticket.id, ticket.routing_item_id ?? undefined, 'ui retry requested');
        ui.setMessageFilter('all');
        ui.setStatusMessage(translate('ticket_moved_to_candidate', {
          ticket: ticket.id,
          provider: nextTicket.provider,
          index: (nextTicket.routing_item_index ?? 0) + 1,
        }));
      } else {
        const response = await releaseActivationTicket(ticket.id, action);
        if (action === 'cancel' && isCancelPending(response)) {
          ui.setMessageFilter('waiting');
          ui.setStatusMessage(translate('auto_cancel_scheduled_ticket', { ticket: ticket.id }));
        } else {
          ui.setStatusMessage(translate('ticket_action_complete', { ticket: ticket.id, action }));
        }
      }
      await runtime.loadSnapshot();
    } catch (error) {
      ui.setStatusMessage(
        action === 'retry'
          ? translate('failed_move_ticket_to_next_route', { ticket: ticket.id, error: getErrorMessage(error) })
          : translate('failed_update_ticket', { error: getErrorMessage(error) }),
      );
      await Promise.allSettled([runtime.loadSnapshot()]);
    } finally {
      ui.setBusyAction('');
    }
  }

  async function copyToClipboard(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      ui.setStatusMessage(translate('copied', { label }));
    } catch (error) {
      ui.setStatusMessage(translate('copy_failed', { error: getErrorMessage(error) }));
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
        if (!ui.activationForm.provider) {
          throw new Error(translate('provider_required_when_no_routing_plan'));
        }
        const body: Record<string, unknown> = {
          provider: ui.activationForm.provider === ANY_PROVIDER_VALUE ? 'auto' : ui.activationForm.provider,
          service: ui.activationForm.service || undefined,
          country: ui.activationForm.country || undefined,
        };
        if (ui.activationForm.min_price !== '') body.min_price = Number(ui.activationForm.min_price);
        if (ui.activationForm.max_price !== '') body.max_price = Number(ui.activationForm.max_price);
        if (ui.activationForm.operator) body.metadata = { operator: ui.activationForm.operator };
        await acquireActivation(body);
      }
      ui.setShowActivationModal(false);
      ui.setStatusMessage(translate('activation_created_waiting_sms'));
      await runtime.loadSnapshot();
      await runtime.refreshBalancesAfterAcquire(
        ui.activationForm.routing_plan_id
          || ui.activationForm.provider === ANY_PROVIDER_VALUE
          || !ui.activationForm.provider
          ? undefined
          : ui.activationForm.provider,
      );
    } catch (error) {
      ui.setActivationError(getErrorMessage(error));
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
