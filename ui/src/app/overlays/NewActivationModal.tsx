import { X } from 'lucide-react';
import { AppButton, ModalField, SelectTrigger } from '../ui-bridge';
import { ANY_PROVIDER_VALUE, type ActivationFormState, type ProviderManifest, type RoutingPlan, type SelectorKind } from '../types';
import { countryBadge, formatCountryLabel, formatServiceLabel, serviceBadge } from '../../lib/formatters';
import { formatOperatorLabel } from '../utils';

export type NewActivationModalProps = {
  providers: ProviderManifest[];
  routingPlans: RoutingPlan[];
  form: ActivationFormState;
  busy: boolean;
  error: string;
  presentation?: 'overlay' | 'inline';
  operatorHint?: string;
  onChange: (field: keyof ActivationFormState, value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  onOpenSelector: (kind: SelectorKind) => void;
  onOpenRoutingPlanSelector: () => void;
};

export function NewActivationModal(props: NewActivationModalProps) {
  const usesRoutingPlan = Boolean(props.form.routing_plan_id);
  const routingPlanLabel = props.routingPlans.find((plan) => plan.id === props.form.routing_plan_id)?.name ?? '';
  const providerLabel = props.form.provider === ANY_PROVIDER_VALUE
    ? 'Any provider'
    : props.providers.find((provider) => provider.id === props.form.provider)?.name ?? props.form.provider;

  const card = (
    <div
      role="dialog"
      aria-modal="true"
      className="flex w-full max-w-activation flex-col gap-5 rounded-[12px] border border-ds-border bg-ds-surface-elevated px-6 pb-6 pt-6 text-ds-text-primary shadow-modal"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-5">
        <h2 className="m-0 font-text text-[18px] font-semibold leading-[1.2]">New Activation</h2>
        <button
          type="button"
          className="inline-flex h-5 w-5 items-center justify-center rounded-pill bg-transparent text-ds-text-secondary"
          onClick={props.onClose}
          aria-label="Close"
        >
          <X size={20} style={{ opacity: 0.4 }} />
        </button>
      </div>
      <div className="h-px w-full bg-ds-border" />
      <div className="flex flex-col gap-[14px] overflow-y-auto">
        <ModalField label="ROUTING PLAN">
          <div className="flex items-center gap-2">
            <SelectTrigger
              compact
              value={routingPlanLabel}
              placeholder="select a routing plan"
              onClick={props.onOpenRoutingPlanSelector}
              className="flex-1"
            />
            {usesRoutingPlan && (
              <AppButton
                variant="ghost"
                size="utility"
                className="shrink-0"
                onClick={() => props.onChange('routing_plan_id', '')}
              >
                Clear
              </AppButton>
            )}
          </div>
        </ModalField>
        <ModalField label="PROVIDER">
          <SelectTrigger
            compact
            value={providerLabel}
            placeholder={usesRoutingPlan ? 'controlled by routing plan' : 'select provider'}
            onClick={() => props.onOpenSelector('activation-provider')}
            disabled={usesRoutingPlan}
          />
        </ModalField>
        <ModalField label="SERVICE">
          <SelectTrigger
            compact
            value={props.form.service ? `${serviceBadge(props.form.service)} ${formatServiceLabel(props.form.service)}` : ''}
            placeholder={usesRoutingPlan ? 'controlled by routing plan' : 'e.g. telegram, openai, whatsapp'}
            onClick={() => props.onOpenSelector('activation-service')}
            disabled={usesRoutingPlan}
          />
        </ModalField>
        <ModalField label="COUNTRY">
          <SelectTrigger
            compact
            value={props.form.country ? `${countryBadge(props.form.country)} ${formatCountryLabel(props.form.country)}` : ''}
            placeholder={usesRoutingPlan ? 'controlled by routing plan' : 'any — auto select'}
            onClick={() => props.onOpenSelector('activation-country')}
            disabled={usesRoutingPlan}
          />
        </ModalField>
        <ModalField label="OPERATOR" hint={usesRoutingPlan ? 'Controlled by routing plan items' : props.operatorHint ?? (providerLabel ? `${providerLabel} scope` : undefined)}>
          <SelectTrigger
            compact
            value={props.form.operator ? formatOperatorLabel(props.form.operator) : ''}
            placeholder={usesRoutingPlan ? 'controlled by routing plan' : 'any'}
            onClick={() => props.onOpenSelector('activation-operator')}
            className="is-disabled-look"
            disabled={usesRoutingPlan}
          />
        </ModalField>
        <ModalField label="PRICE RANGE">
          <div className="grid grid-cols-[1fr_16px_1fr] items-center gap-2">
            <div className="inline-flex min-h-control-compact items-center rounded-[10px] border border-ds-border bg-ds-surface px-3 py-2 text-utility tracking-[var(--ds-type-utility-tracking)] text-ds-text-secondary shadow-[inset_0_0_0_1px_var(--ds-color-border-default)]">
              {usesRoutingPlan ? 'Plan controlled' : props.form.min_price || 'Min $'}
            </div>
            <span className="text-center opacity-40">–</span>
            <div className="inline-flex min-h-control-compact items-center rounded-[10px] border border-ds-border bg-ds-surface px-3 py-2 text-utility tracking-[var(--ds-type-utility-tracking)] text-ds-text-secondary shadow-[inset_0_0_0_1px_var(--ds-color-border-default)]">
              {usesRoutingPlan ? 'Plan controlled' : props.form.max_price || 'Max $'}
            </div>
          </div>
        </ModalField>
      </div>
      {props.error && (
        <div className="rounded-sm border border-ds-state-danger/30 bg-ds-state-danger/10 px-[14px] py-[10px] text-[13px] text-ds-state-danger">
          {props.error}
        </div>
      )}
      <div className="flex w-full items-center justify-between gap-3 pt-1">
        <AppButton variant="text" size="utility" className="min-h-0 px-0 py-0 text-[13px] opacity-60" onClick={props.onClose} disabled={props.busy}>Cancel</AppButton>
        <AppButton variant="primary" size="utility" className="min-h-[32px] rounded-pill px-4 py-2 text-[13px]" onClick={props.onSubmit} disabled={props.busy}>
          {props.busy ? 'Starting…' : 'Start Activation'}
        </AppButton>
      </div>
    </div>
  );

  if (props.presentation === 'inline') {
    return card;
  }

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/25 p-ds-xl"
      onClick={props.onClose}
    >
      {card}
    </div>
  );
}
