import { cx } from '../../../lib/cx';
import styles from './ToggleSwitch.module.css';

export type ToggleSwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel: string;
  className?: string;
};

export function ToggleSwitch(props: ToggleSwitchProps) {
  const { checked, onChange, ariaLabel, className } = props;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      className={cx(styles.root, checked && styles.checked, className)}
      onClick={() => onChange(!checked)}
    >
      <span className={cx(styles.thumb, checked && styles.thumbChecked)} />
    </button>
  );
}
