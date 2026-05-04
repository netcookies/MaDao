import type { InputHTMLAttributes, ReactNode } from 'react';
import { Search } from 'lucide-react';
import { cx } from '../../../lib/cx';

export type SearchFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  compact?: boolean;
  className?: string;
  icon?: ReactNode;
};

const ROOT_CLASS =
  'inline-flex w-full items-center gap-[8px] rounded-[8px] border border-ds-border-strong bg-ds-surface px-3 py-2 text-ds-text-primary focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ds-accent-focus';

const COMPACT_CLASS = 'min-h-control-compact px-3 py-2';
const DEFAULT_CLASS = 'min-h-control';

export function SearchField(props: SearchFieldProps) {
  const {
    compact = false,
    className,
    icon = <Search size={14} />,
    ...inputProps
  } = props;

  return (
    <label className={cx(ROOT_CLASS, compact ? COMPACT_CLASS : DEFAULT_CLASS, className)}>
      <span className="inline-flex items-center justify-center text-ds-text-secondary opacity-40">
        {icon}
      </span>
      <input
        className="w-full min-w-0 border-0 bg-transparent font-text text-utility font-normal tracking-[var(--ds-type-utility-tracking)] text-inherit outline-none"
        {...inputProps}
      />
    </label>
  );
}
