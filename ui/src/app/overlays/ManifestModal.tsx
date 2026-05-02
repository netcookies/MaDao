import { AppButton } from '../ui-bridge';
import styles from './ManifestModal.module.css';

export type ManifestModalProps = {
  providerName: string;
  rawEditor: string;
  busy: boolean;
  onClose: () => void;
  onChange: (value: string) => void;
  onSave: () => void;
};

export function ManifestModal(props: ManifestModalProps) {
  return (
    <div className="d-backdrop" onClick={props.onClose}>
      <div className={`d-modal ${styles.wide}`} onClick={(event) => event.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>Advanced Manifest</h2>
            <p className={styles.subtitle}>
              {props.providerName} · JSON source of truth
            </p>
          </div>
          <div className={styles.actions}>
            <AppButton variant="ghost" size="utility" onClick={props.onClose}>Close</AppButton>
            <AppButton variant="primary" size="utility" onClick={props.onSave} disabled={props.busy}>Save</AppButton>
          </div>
        </div>
        <textarea className={styles.editor} value={props.rawEditor} onChange={(event) => props.onChange(event.target.value)} />
      </div>
    </div>
  );
}
