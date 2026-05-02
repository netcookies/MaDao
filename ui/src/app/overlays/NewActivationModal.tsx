import { X } from 'lucide-react';
import { AppButton, ModalField, SelectTrigger } from '../ui-bridge';
import type { ActivationFormState, ProviderManifest, SelectorKind } from '../types';
import { formatCountryLabel, formatServiceLabel } from '../../lib/formatters';
import styles from './NewActivationModal.module.css';

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
    <div className="d-backdrop" onClick={props.onClose}>
      <div className={`d-modal ${styles.activation}`} onClick={(event) => event.stopPropagation()}>
        <div className={styles.head}>
          <h2 className={styles.title}>New Activation</h2>
          <button className={styles.closeButton} onClick={props.onClose} aria-label="Close">
            <X size={20} style={{ opacity: 0.4 }} />
          </button>
        </div>
        <div className={styles.divider} />
        <div className={styles.form}>
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
            <div className={styles.priceInputs}>
              <input className={styles.input} type="number" value={props.form.min_price} onChange={(event) => props.onChange('min_price', event.target.value)} placeholder="Min $" min="0" step="0.01" />
              <span className={styles.priceSep}>–</span>
              <input className={styles.input} type="number" value={props.form.max_price} onChange={(event) => props.onChange('max_price', event.target.value)} placeholder="Max $" min="0" step="0.01" />
            </div>
          </ModalField>
          <ModalField label="OPERATOR" hint={props.form.provider !== 'auto' ? `${providerLabel} only` : undefined}>
            <SelectTrigger compact value={props.form.operator} placeholder="any" onClick={() => props.onOpenSelector('activation-operator')} className="is-disabled-look" />
          </ModalField>
        </div>
        {props.error && <div className={styles.errorBox}>{props.error}</div>}
        <div className={styles.footer}>
          <AppButton variant="text" size="utility" onClick={props.onClose} disabled={props.busy}>Cancel</AppButton>
          <AppButton variant="primary" size="utility" className={styles.submitButton} onClick={props.onSubmit} disabled={props.busy}>
            {props.busy ? 'Starting…' : 'Start Activation'}
          </AppButton>
        </div>
      </div>
    </div>
  );
}
