import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../../../lib/cx';
import styles from './IconButton.module.css';

export type IconButtonVariant = 'surface' | 'toolbar';

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: IconButtonVariant;
  icon: ReactNode;
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
      className={cx(styles.root, styles[variant], className)}
      {...rest}
    >
      {icon}
    </button>
  );
}
