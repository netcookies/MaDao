import type { ReactNode } from 'react';
import { cx } from '../../../lib/cx';
import styles from './Modal.module.css';

export type ModalVariant = 'default' | 'wide' | 'activation' | 'selector';

export type ModalProps = {
  open: boolean;
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  variant?: ModalVariant;
  onClose: () => void;
  children: ReactNode;
};

export function Modal(props: ModalProps) {
  const {
    open,
    title,
    subtitle,
    actions,
    footer,
    variant = 'default',
    onClose,
    children,
  } = props;

  if (!open) return null;

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={cx(
          styles.panel,
          variant === 'wide' && styles.wide,
          variant === 'activation' && styles.activation,
          variant === 'selector' && styles.selector,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        {(title || subtitle || actions) && (
          <header className={styles.header}>
            <div>
              {title ? <h2 className={styles.title}>{title}</h2> : null}
              {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
            </div>
            {actions}
          </header>
        )}
        <div className={styles.body}>{children}</div>
        {footer ? <footer className={styles.footer}>{footer}</footer> : null}
      </div>
    </div>
  );
}
