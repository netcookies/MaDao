import type { ReactNode } from 'react';
import { cx } from '../../../lib/cx';

export type SectionHeaderProps = {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
};

export function SectionHeader(props: SectionHeaderProps) {
  const { eyebrow, title, description, icon, badge, actions } = props;

  return (
    <div className="flex items-start justify-between gap-ds-lg">
      <div className="flex min-w-0 items-start gap-ds-md">
        {icon ? (
          <div className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-ds-accent-soft text-ds-accent-blue">
            {icon}
          </div>
        ) : null}
        <div className="flex min-w-0 flex-col">
          {eyebrow ? (
            <span className="font-text text-[12px] font-semibold uppercase tracking-[0.12em] text-ds-text-secondary">
              {eyebrow}
            </span>
          ) : null}
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="m-0 font-text text-[28px] font-semibold leading-[1.14] tracking-[0.196px] text-ds-text-primary">
              {title}
            </h2>
            {badge}
          </div>
          {description ? (
            <p className="m-0 mt-2 font-text text-body font-normal tracking-[var(--ds-type-body-tracking)] text-ds-text-secondary">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {actions ? <div className={cx('inline-flex flex-wrap items-center gap-ds-sm')}>{actions}</div> : null}
    </div>
  );
}
