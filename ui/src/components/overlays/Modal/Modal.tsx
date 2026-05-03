import type { ReactNode } from 'react';
import { cx } from '../../../lib/cx';

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
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/25 p-ds-xl"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cx(
          'flex w-full max-w-[720px] flex-col gap-ds-lg rounded-[12px] border border-ds-border bg-ds-surface p-ds-lg text-ds-text-primary shadow-modal',
          variant === 'wide' && 'max-w-[960px]',
          variant === 'activation' && 'max-w-activation',
          variant === 'selector' && 'max-w-[560px]',
        )}
        onClick={(event) => event.stopPropagation()}
      >
        {(title || subtitle || actions) && (
          <header className="flex items-start justify-between gap-ds-lg">
            <div>
              {title ? <h2 className="m-0 font-text text-[18px] font-semibold leading-[1.2]">{title}</h2> : null}
              {subtitle ? (
                <p className="m-0 mt-1.5 font-text text-utility font-normal tracking-[var(--ds-type-utility-tracking)] text-ds-text-secondary">
                  {subtitle}
                </p>
              ) : null}
            </div>
            {actions}
          </header>
        )}
        <div className="flex flex-col gap-ds-md">{children}</div>
        {footer ? <footer className="flex items-center justify-end gap-ds-sm">{footer}</footer> : null}
      </div>
    </div>
  );
}
