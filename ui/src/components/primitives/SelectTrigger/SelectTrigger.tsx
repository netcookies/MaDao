import type { ButtonHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cx } from '../../../lib/cx';

export type SelectTriggerProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  value: string;
  placeholder?: string;
  compact?: boolean;
  prominent?: boolean;
  muted?: boolean;
};

const ROOT_CLASS =
  'inline-flex min-h-control min-w-[140px] items-center justify-between gap-ds-xs rounded-sm border border-ds-border-strong bg-ds-surface px-4 py-[11px] font-text text-utility font-normal tracking-[var(--ds-type-utility-tracking)] text-ds-text-primary transition-[background-color,color,border-color,opacity] duration-fast ease-[var(--ds-motion-transition-fast)] disabled:cursor-default disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent-focus';
const COMPACT_CLASS = 'min-h-control-compact px-3 py-2';
const PROMINENT_CLASS = 'rounded-pill text-body font-normal tracking-[var(--ds-type-body-tracking)]';
const MUTED_CLASS = 'bg-ds-window';

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
  const disabledLook = className?.split(/\s+/).includes('is-disabled-look');

  return (
    <button
      type={type}
      className={cx(
        ROOT_CLASS,
        compact && COMPACT_CLASS,
        prominent && PROMINENT_CLASS,
        (muted || disabledLook) && MUTED_CLASS,
        className,
      )}
      {...rest}
    >
      <span className={cx('overflow-hidden text-ellipsis whitespace-nowrap', isPlaceholder && 'text-ds-text-secondary')}>
        {displayValue}
      </span>
      <span className="inline-flex shrink-0 items-center justify-center text-ds-text-secondary opacity-50">
        <ChevronDown size={14} />
      </span>
    </button>
  );
}
