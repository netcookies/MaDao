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
        align === 'center' && 'max-[760px]:items-start',
        'max-[760px]:flex-col',
        className,
      )}
    >
      <div className="flex min-w-0 flex-col">
        <h1 className="m-0 font-display text-page-title font-semibold tracking-[var(--ds-type-page-title-tracking)] text-ds-text-primary">
          {title}
        </h1>
        {subtitle ? (
          <p className="m-0 mt-2 font-text text-utility font-normal tracking-[var(--ds-type-utility-tracking)] text-ds-text-secondary">
            {subtitle}
          </p>
        ) : null}
      </div>
      {(meta || actions) ? (
        <div className="inline-flex flex-wrap items-center gap-2 max-[760px]:w-full max-[760px]:justify-start">
          {meta}
          {actions}
        </div>
      ) : null}
    </div>
  );
}
