import { cx } from '../../../lib/cx';

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
      className={cx(
        'inline-flex h-6 w-11 items-center rounded-pill border border-transparent p-[2px] transition-[background-color,border-color] duration-fast ease-[var(--ds-motion-transition-fast)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent-focus',
        checked ? 'bg-ds-accent-blue' : 'bg-[rgba(120,120,128,0.16)]',
        className,
      )}
      onClick={(event) => {
        event.stopPropagation();
        onChange(!checked);
      }}
    >
      <span
        className={cx(
          'h-5 w-5 rounded-pill bg-ds-surface shadow-[0_1px_3px_rgba(0,0,0,0.18)] transition-transform duration-fast ease-[var(--ds-motion-transition-fast)]',
          checked && 'translate-x-4',
        )}
      />
    </button>
  );
}
