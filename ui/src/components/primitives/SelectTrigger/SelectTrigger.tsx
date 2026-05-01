import type { ButtonHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cx } from '../../../lib/cx';
import styles from './SelectTrigger.module.css';

export type SelectTriggerProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  value: string;
  placeholder?: string;
  compact?: boolean;
  prominent?: boolean;
  muted?: boolean;
};

export function SelectTrigger(props: SelectTriggerProps) {
  const {
    value,
    placeholder,
    compact = false,
    prominent = false,
    muted = false,
    className,
    type = 'button',
    ...rest
  } = props;

  const displayValue = value || placeholder || '';
  const isPlaceholder = !value || muted;

  return (
    <button
      type={type}
      className={cx(
        styles.root,
        compact && styles.compact,
        prominent && styles.prominent,
        className,
      )}
      {...rest}
    >
      <span className={cx(styles.value, isPlaceholder && styles.placeholder)}>
        {displayValue}
      </span>
      <span className={styles.icon}>
        <ChevronDown size={14} />
      </span>
    </button>
  );
}
