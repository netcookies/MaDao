import type { InputHTMLAttributes, ReactNode } from 'react';
import { Search } from 'lucide-react';
import { cx } from '../../../lib/cx';
import styles from './SearchField.module.css';

export type SearchFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  compact?: boolean;
  className?: string;
  icon?: ReactNode;
};

export function SearchField(props: SearchFieldProps) {
  const {
    compact = false,
    className,
    icon = <Search size={14} />,
    ...inputProps
  } = props;

  return (
    <label className={cx(styles.root, compact && styles.compact, className)}>
      <span className={styles.icon}>{icon}</span>
      <input className={styles.input} {...inputProps} />
    </label>
  );
}
