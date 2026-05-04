import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../../../lib/cx';

export type IconButtonVariant = 'surface' | 'toolbar';

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: IconButtonVariant;
  icon: ReactNode;
};

const BASE_CLASS =
  'inline-flex h-control w-control items-center justify-center rounded-pill border text-ds-text-primary transition-[background-color,color,border-color,opacity,transform] duration-fast ease-[var(--ds-motion-transition-fast)] active:scale-press disabled:cursor-default disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent-focus';

const VARIANT_CLASS: Record<IconButtonVariant, string> = {
  surface: 'border-ds-border bg-ds-surface-chip',
  toolbar: 'h-auto w-auto border-transparent bg-transparent p-0',
};

export function IconButton(props: IconButtonProps) {
  const {
    variant = 'surface',
    className,
    type = 'button',
    icon,
    ...rest
  } = props;

  return (
    <button
      type={type}
      className={cx(BASE_CLASS, VARIANT_CLASS[variant], className)}
      {...rest}
    >
      {icon}
    </button>
  );
}
