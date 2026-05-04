import { X } from 'lucide-react';
import { AppButton, ModalField, SelectTrigger } from '../ui-bridge';
import type { ActivationFormState, ProviderManifest, SelectorKind } from '../types';
import { formatCountryLabel, formatServiceLabel } from '../../lib/formatters';

export type NewActivationModalProps = {
  providers: ProviderManifest[];
  form: ActivationFormState;
  busy: boolean;
  error: string;
  presentation?: 'overlay' | 'inline';
  operatorHint?: string;
  onChange: (field: keyof ActivationFormState, value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  onOpenSelector: (kind: SelectorKind) => void;
};

export function NewActivationModal(props: NewActivationModalProps) {
  const providerLabel = props.form.provider === 'auto'
    ? 'Auto — follow routing rules'
    : props.providers.find((provider) => provider.id === props.form.provider)?.name ?? props.form.provider;

  const card = (
    <div
      role="dialog"
      aria-modal="true"
      className="flex w-full max-w-activation flex-col gap-5 rounded-[12px] border border-ds-border bg-ds-surface px-6 pb-6 pt-6 text-ds-text-primary shadow-modal"
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
      <div className="h-px w-full bg-black/[0.06]" />
      <div className="flex flex-col gap-[14px] overflow-y-auto">
        <ModalField label="SERVICE">
          <SelectTrigger
            compact
            value={props.form.service ? formatServiceLabel(props.form.service) : ''}
            placeholder="e.g. telegram, openai, whatsapp"
            onClick={() => props.onOpenSelector('activation-service')}
          />
        </ModalField>
        <ModalField label="COUNTRY">
          <SelectTrigger compact value={props.form.country ? formatCountryLabel(props.form.country) : ''} placeholder="any — auto select" onClick={() => props.onOpenSelector('activation-country')} />
        </ModalField>
        <ModalField label="PROVIDER">
          <SelectTrigger compact value={providerLabel} muted={props.form.provider === 'auto'} onClick={() => props.onOpenSelector('provider')} />
        </ModalField>
        <ModalField label="PRICE RANGE">
          <div className="grid grid-cols-[1fr_16px_1fr] items-center gap-2">
            <div className="inline-flex min-h-control-compact items-center rounded-[10px] border border-black/[0.12] bg-white px-3 py-2 text-utility tracking-[var(--ds-type-utility-tracking)] text-ds-text-secondary shadow-[inset_0_0_0_1px_rgba(0,0,0,0.03)]">
              {props.form.min_price || 'Min $'}
            </div>
            <span className="text-center opacity-40">–</span>
            <div className="inline-flex min-h-control-compact items-center rounded-[10px] border border-black/[0.12] bg-white px-3 py-2 text-utility tracking-[var(--ds-type-utility-tracking)] text-ds-text-secondary shadow-[inset_0_0_0_1px_rgba(0,0,0,0.03)]">
              {props.form.max_price || 'Max $'}
            </div>
          </div>
        </ModalField>
        <ModalField label="OPERATOR" hint={props.operatorHint ?? (props.form.provider !== 'auto' ? `${providerLabel} only` : undefined)}>
          <SelectTrigger compact value={props.form.operator} placeholder="any" onClick={() => props.onOpenSelector('activation-operator')} className="is-disabled-look" />
        </ModalField>
      </div>
      {props.error && (
        <div className="rounded-sm border border-[rgba(255,59,48,0.22)] bg-[rgba(255,59,48,0.07)] px-[14px] py-[10px] text-[13px] text-[#c0392b]">
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
