import type { InputHTMLAttributes, ReactNode } from 'react';
import { cx } from '../../../lib/cx';

export type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  compact?: boolean;
  className?: string;
  inputClassName?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
};

const ROOT_CLASS =
  'inline-flex w-full items-center gap-[8px] rounded-[8px] border border-ds-border-strong bg-ds-surface px-3 py-2 text-ds-text-primary focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ds-accent-focus';

const COMPACT_CLASS = 'min-h-control-compact px-3 py-2';
const DEFAULT_CLASS = 'min-h-control';
const INPUT_CLASS =
  'w-full min-w-0 border-0 bg-transparent font-text text-utility font-normal tracking-[var(--ds-type-utility-tracking)] text-inherit outline-none';
const DECORATOR_CLASS = 'inline-flex items-center justify-center text-ds-text-secondary opacity-40';

export function TextField(props: TextFieldProps) {
  const {
    compact = false,
    className,
    inputClassName,
    leading,
    trailing,
    ...inputProps
  } = props;

  return (
    <label className={cx(ROOT_CLASS, compact ? COMPACT_CLASS : DEFAULT_CLASS, className)}>
      {leading ? <span className={DECORATOR_CLASS}>{leading}</span> : null}
      <input
        className={cx(INPUT_CLASS, inputClassName)}
        {...inputProps}
      />
      {trailing ? <span className={DECORATOR_CLASS}>{trailing}</span> : null}
    </label>
  );
}
