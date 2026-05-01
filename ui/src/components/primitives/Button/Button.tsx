import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';

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

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

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
        styles.root,
        styles[variant],
        size !== 'default' && styles[size],
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
