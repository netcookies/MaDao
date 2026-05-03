import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../../../lib/cx';

export type SurfaceCardProps = HTMLAttributes<HTMLDivElement> & {
  title?: ReactNode;
  headerAction?: ReactNode;
  flush?: boolean;
};

const ROOT_CLASS = 'rounded-lg border border-ds-border bg-ds-surface text-ds-text-primary';
const DENSE_CLASS = 'p-5';
const FLUSH_CLASS = 'p-0';

export function SurfaceCard(props: SurfaceCardProps) {
  const { title, headerAction, flush = false, className, children, ...rest } = props;

  return (
    <section
      className={cx(ROOT_CLASS, flush ? FLUSH_CLASS : DENSE_CLASS, className)}
      {...rest}
    >
      {(title || headerAction) && (
        <header className="flex items-center justify-between gap-ds-md">
          {title ? (
            <h2 className="m-0 font-text text-section-title font-semibold tracking-[var(--ds-type-section-title-tracking)]">
              {title}
            </h2>
          ) : (
            <span />
          )}
          {headerAction}
        </header>
      )}
      <div className="flex flex-col gap-ds-md">{children}</div>
    </section>
  );
}
