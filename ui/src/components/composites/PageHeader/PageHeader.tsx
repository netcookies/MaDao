import type { ReactNode } from 'react';
import { cx } from '../../../lib/cx';

export type PageHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  align?: 'start' | 'center';
  className?: string;
};

export function PageHeader(props: PageHeaderProps) {
  const { title, subtitle, meta, actions, align = 'start', className } = props;

  return (
    <div
      className={cx(
        'flex items-start justify-between gap-5',
        align === 'center' && 'items-center',
        className,
      )}
    >
      <div className="flex min-w-0 flex-col">
        <h1 className="m-0 font-display text-page-title font-semibold tracking-[var(--ds-type-page-title-tracking)] text-ds-text-primary">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-2 m-0 font-text text-body font-normal tracking-[var(--ds-type-body-tracking)] text-ds-text-secondary">
            {subtitle}
          </p>
        ) : null}
      </div>
      {(meta || actions) ? (
        <div className="inline-flex flex-wrap items-center gap-3">
          {meta}
          {actions}
        </div>
      ) : null}
    </div>
  );
}
