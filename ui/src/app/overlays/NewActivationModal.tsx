import { X } from 'lucide-react';
import { AppButton, ModalField, SelectTrigger } from '../ui-bridge';
import { Modal } from '../../components/overlays';
import type { ActivationFormState, ProviderManifest, SelectorKind } from '../types';
import { formatCountryLabel, formatServiceLabel } from '../../lib/formatters';

export type NewActivationModalProps = {
  providers: ProviderManifest[];
  form: ActivationFormState;
  busy: boolean;
  error: string;
  onChange: (field: keyof ActivationFormState, value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  onOpenSelector: (kind: SelectorKind) => void;
};

export function NewActivationModal(props: NewActivationModalProps) {
  const providerLabel = props.form.provider === 'auto'
    ? 'Auto — follow routing rules'
    : props.providers.find((provider) => provider.id === props.form.provider)?.name ?? props.form.provider;

  return (
    <Modal
      open
      title="New Activation"
      variant="activation"
      onClose={props.onClose}
      actions={(
        <button
          type="button"
          className="inline-flex h-5 w-5 items-center justify-center rounded-pill bg-transparent text-ds-text-secondary"
          onClick={props.onClose}
          aria-label="Close"
        >
            <X size={20} style={{ opacity: 0.4 }} />
        </button>
      )}
      footer={(
        <div className="flex w-full items-center justify-between gap-3">
          <AppButton variant="text" size="utility" onClick={props.onClose} disabled={props.busy}>Cancel</AppButton>
          <AppButton variant="primary" size="utility" className="min-w-[144px]" onClick={props.onSubmit} disabled={props.busy}>
            {props.busy ? 'Starting…' : 'Start Activation'}
          </AppButton>
        </div>
      )}
    >
      <div className="flex flex-col gap-4 overflow-y-auto">
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
              <input className="min-h-control-compact w-full rounded-sm border border-ds-border-strong bg-white px-3 py-2 text-utility tracking-[var(--ds-type-utility-tracking)] text-ds-text-primary" type="number" value={props.form.min_price} onChange={(event) => props.onChange('min_price', event.target.value)} placeholder="Min $" min="0" step="0.01" />
              <span className="text-center opacity-40">–</span>
              <input className="min-h-control-compact w-full rounded-sm border border-ds-border-strong bg-white px-3 py-2 text-utility tracking-[var(--ds-type-utility-tracking)] text-ds-text-primary" type="number" value={props.form.max_price} onChange={(event) => props.onChange('max_price', event.target.value)} placeholder="Max $" min="0" step="0.01" />
            </div>
          </ModalField>
          <ModalField label="OPERATOR" hint={props.form.provider !== 'auto' ? `${providerLabel} only` : undefined}>
            <SelectTrigger compact value={props.form.operator} placeholder="any" onClick={() => props.onOpenSelector('activation-operator')} className="is-disabled-look" />
          </ModalField>
      </div>
      {props.error && (
        <div className="rounded-sm border border-[rgba(255,59,48,0.22)] bg-[rgba(255,59,48,0.07)] px-[14px] py-[10px] text-[13px] text-[#c0392b]">
          {props.error}
        </div>
      )}
    </Modal>
  );
}
