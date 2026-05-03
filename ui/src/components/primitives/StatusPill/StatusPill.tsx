import { cx } from '../../../lib/cx';

export type StatusPillTone = 'success' | 'warning' | 'muted';

export type StatusPillProps = {
  children: string;
  tone: StatusPillTone;
  className?: string;
};

const TONE_CLASS: Record<StatusPillTone, { text: string; dot: string }> = {
  success: {
    text: 'text-ds-state-success',
    dot: 'bg-ds-state-success',
  },
  warning: {
    text: 'text-ds-state-warning',
    dot: 'bg-ds-state-warning',
  },
  muted: {
    text: 'text-[#8e8e93]',
    dot: 'bg-[#8e8e93]',
  },
};

export function StatusPill(props: StatusPillProps) {
  const { children, tone, className } = props;
  const toneStyle = TONE_CLASS[tone];

  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-pill bg-ds-surface-subtle px-2.5 py-1.5 font-text text-utility-strong tracking-[var(--ds-type-utility-tracking)]',
        toneStyle.text,
        className,
      )}
    >
      <span className={cx('h-2 w-2 shrink-0 rounded-pill', toneStyle.dot)} />
      {children}
    </span>
  );
}

export function statusToneFromValue(status: string): StatusPillTone {
  const normalized = status.toLowerCase();
  if (
    normalized.includes('connected') ||
    normalized.includes('received') ||
    normalized.includes('finished')
  ) {
    return 'success';
  }
  if (
    normalized.includes('standby') ||
    normalized.includes('waiting') ||
    normalized.includes('pending')
  ) {
    return 'warning';
  }
  return 'muted';
}
