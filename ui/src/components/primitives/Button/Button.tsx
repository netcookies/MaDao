import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../../../lib/cx';

export type ButtonVariant =
  | 'primary'
  | 'outline'
  | 'success'
  | 'ghost'
  | 'dangerOutline'
  | 'text';

export type ButtonSize = 'default' | 'utility' | 'compact';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
};

const BASE_CLASS =
  'inline-flex items-center justify-center gap-ds-xs border border-transparent font-text transition-[background-color,color,border-color,opacity,transform] duration-fast ease-[var(--ds-motion-transition-fast)] active:scale-press disabled:cursor-default disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent-focus';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'bg-ds-accent-blue text-white',
  outline: 'border-ds-border-strong bg-ds-surface text-ds-accent-blue',
  success: 'bg-ds-state-success text-white',
  ghost: 'bg-transparent text-ds-accent-blue',
  dangerOutline: 'border-[rgba(224,68,62,0.35)] bg-ds-surface text-[rgb(224,68,62)]',
  text: 'min-h-0 rounded-none bg-transparent px-0 py-0 text-ds-text-secondary',
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  default: 'min-h-control rounded-pill px-[22px] py-[11px] text-body leading-none',
  utility: 'min-h-control-compact rounded-sm px-[15px] py-2 text-utility',
  compact: 'min-h-[28px] rounded-sm px-3 py-1.5 text-utility',
};

export function Button(props: ButtonProps) {
  const {
    variant = 'primary',
    size = variant === 'primary' ? 'default' : 'utility',
    className,
    children,
    leadingIcon,
    trailingIcon,
    type = 'button',
    ...rest
  } = props;

  return (
    <button
      type={type}
      className={cx(
        BASE_CLASS,
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        className,
      )}
      {...rest}
    >
      {leadingIcon}
      {children}
      {trailingIcon}
    </button>
  );
}
