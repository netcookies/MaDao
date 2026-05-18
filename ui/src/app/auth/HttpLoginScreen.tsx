import { Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AppButton, PageHeader, TextField } from '../ui-bridge';

export type HttpLoginScreenProps = {
  secret: string;
  setSecret: (value: string) => void;
  busy: boolean;
  error: string;
  onSubmit: () => void;
};

export function HttpLoginScreen(props: HttpLoginScreenProps) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-10">
      <div className="flex w-full max-w-[460px] flex-col gap-6 rounded-[20px] border border-ds-border bg-ds-surface-elevated px-6 py-7 shadow-modal backdrop-blur-[20px]">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-[14px] bg-ds-accent-soft text-ds-accent-blue">
          <Shield size={22} />
        </div>
        <PageHeader
          title={t('HTTP Login')}
          subtitle={t('Enter the configured secret to access the web console.')}
        />
        <label className="flex flex-col gap-2">
          <span className="font-text text-[11px] font-semibold uppercase tracking-[0.08em] text-ds-text-primary opacity-50">
            {t('Secret')}
          </span>
          <TextField
            type="password"
            value={props.secret}
            onChange={(event) => props.setSecret(event.target.value)}
            placeholder={t('Paste access secret')}
            autoFocus
          />
        </label>
        {props.error ? (
          <p className="m-0 text-[13px] leading-[1.45] text-ds-state-danger">{props.error}</p>
        ) : null}
        <AppButton
          variant="primary"
          onClick={props.onSubmit}
          disabled={props.busy || !props.secret.trim()}
        >
          {props.busy ? t('Signing in…') : t('Sign In')}
        </AppButton>
      </div>
    </div>
  );
}
