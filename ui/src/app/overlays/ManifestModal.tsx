import { AppButton } from '../ui-bridge';
import { Modal } from '../../components/overlays';
import { useLanguage } from '../language';

export type ManifestModalProps = {
  providerName: string;
  rawEditor: string;
  busy: boolean;
  onClose: () => void;
  onChange: (value: string) => void;
  onSave: () => void;
};

export function ManifestModal(props: ManifestModalProps) {
  const language = useLanguage();
  return (
    <Modal
      open
      variant="wide"
      title={language === 'zh' ? '高级 Manifest' : 'Advanced Manifest'}
      subtitle={`${props.providerName} · ${language === 'zh' ? 'JSON 真值源' : 'JSON source of truth'}`}
      onClose={props.onClose}
      actions={(
        <div className="inline-flex items-center gap-3">
          <AppButton variant="ghost" size="utility" onClick={props.onClose}>{language === 'zh' ? '关闭' : 'Close'}</AppButton>
          <AppButton variant="primary" size="utility" onClick={props.onSave} disabled={props.busy}>{language === 'zh' ? '保存' : 'Save'}</AppButton>
        </div>
      )}
    >
      <textarea
        className="min-h-[400px] flex-1 resize-none overflow-auto rounded-md bg-ds-surface-subtle px-5 py-4 font-mono text-caption leading-[1.6] text-ds-text-primary"
        value={props.rawEditor}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </Modal>
  );
}
