import type { ReactNode } from 'react';
import { cx } from '../../../lib/cx';

export type ModalVariant = 'default' | 'wide' | 'activation' | 'selector';
export type ModalPresentation = 'overlay' | 'inline';

export type ModalProps = {
  open: boolean;
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  variant?: ModalVariant;
  presentation?: ModalPresentation;
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
    presentation = 'overlay',
    onClose,
    children,
  } = props;

  if (!open) return null;

  const dialog = (
    <div
      role="dialog"
      aria-modal="true"
      className={cx(
        'flex w-full max-w-[720px] flex-col gap-5 rounded-[12px] border border-ds-border bg-ds-surface-elevated px-6 pb-6 pt-5 text-ds-text-primary shadow-modal backdrop-blur-[20px] max-[760px]:max-h-[calc(100vh-32px)] max-[760px]:overflow-y-auto max-[760px]:px-4 max-[760px]:pb-5 max-[760px]:pt-4',
        presentation === 'inline' && 'w-auto',
        variant === 'wide' && 'max-w-[960px]',
        variant === 'activation' && 'max-w-activation',
        variant === 'selector' && 'max-w-[560px]',
      )}
      onClick={(event) => event.stopPropagation()}
    >
      {(title || subtitle || actions) && (
        <header className="flex items-center justify-between gap-5 max-[760px]:flex-col max-[760px]:items-start">
          <div className="flex-1">
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
      <div className="flex flex-col gap-4">{children}</div>
      {footer ? <footer className="flex items-center justify-end gap-3">{footer}</footer> : null}
    </div>
  );

  if (presentation === 'inline') {
    return dialog;
  }

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/30 p-ds-xl max-[760px]:items-end max-[760px]:p-4"
      onClick={onClose}
    >
      {dialog}
    </div>
  );
}
