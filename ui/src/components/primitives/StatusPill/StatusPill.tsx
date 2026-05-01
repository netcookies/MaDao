import { cx } from '../../../lib/cx';
import styles from './StatusPill.module.css';

export type StatusPillTone = 'success' | 'warning' | 'muted';

export type StatusPillProps = {
  children: string;
  tone: StatusPillTone;
  className?: string;
};

export function StatusPill(props: StatusPillProps) {
  const { children, tone, className } = props;

  return (
    <span className={cx(styles.root, styles[tone], className)}>
      <span className={styles.dot} />
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
