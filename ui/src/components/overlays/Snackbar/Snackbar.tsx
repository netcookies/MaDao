import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { cx } from '../../../lib/cx';

export type SnackbarTone = 'success' | 'warning' | 'danger' | 'info';

export type SnackbarProps = {
  open: boolean;
  message: string;
  tone?: SnackbarTone;
};

const TONE_CLASS: Record<SnackbarTone, { shell: string; icon: string }> = {
  success: {
    shell: 'border-ds-state-success/30 bg-ds-state-success/12 text-ds-text-primary',
    icon: 'text-ds-state-success',
  },
  warning: {
    shell: 'border-ds-state-warning/30 bg-ds-state-warning/12 text-ds-text-primary',
    icon: 'text-ds-state-warning',
  },
  danger: {
    shell: 'border-ds-state-danger/30 bg-ds-state-danger/12 text-ds-text-primary',
    icon: 'text-ds-state-danger',
  },
  info: {
    shell: 'border-ds-border bg-ds-surface-elevated text-ds-text-primary',
    icon: 'text-ds-accent-blue',
  },
};

function SnackbarIcon(props: { tone: SnackbarTone }) {
  if (props.tone === 'success') return <CheckCircle2 size={18} />;
  if (props.tone === 'warning') return <AlertTriangle size={18} />;
  if (props.tone === 'danger') return <AlertCircle size={18} />;
  return <Info size={18} />;
}

export function Snackbar(props: SnackbarProps) {
  const tone = props.tone ?? 'info';
  const toneClass = TONE_CLASS[tone];

  return (
    <div
      aria-hidden={!props.open}
      className={cx(
        'pointer-events-none fixed bottom-5 left-1/2 z-[1100] w-[min(560px,calc(100vw-32px))] -translate-x-1/2 transition-all duration-fast ease-[var(--ds-motion-transition-fast)]',
        props.open ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
      )}
    >
      <div
        role="status"
        aria-live="polite"
        className={cx(
          'flex items-start gap-3 rounded-[14px] border px-4 py-3 shadow-[0_16px_36px_rgba(0,0,0,0.16)] backdrop-blur-ds',
          toneClass.shell,
        )}
      >
        <span className={cx('mt-0.5 shrink-0', toneClass.icon)}>
          <SnackbarIcon tone={tone} />
        </span>
        <span className="min-w-0 text-[13px] leading-[1.45]">
          {props.message}
        </span>
      </div>
    </div>
  );
}
