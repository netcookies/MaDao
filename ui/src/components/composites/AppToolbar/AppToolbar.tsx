import type { ReactNode } from 'react';
import { cx } from '../../../lib/cx';

export type AppToolbarProps = {
  title: ReactNode;
  navigation?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function AppToolbar(props: AppToolbarProps) {
  const { title, navigation, actions, className } = props;

  return (
    <header
      className={cx(
        'sticky top-0 z-10 flex h-toolbar items-center justify-between border-b border-ds-border bg-white/70 px-6 pr-[18px] backdrop-blur-ds max-[760px]:h-auto max-[760px]:flex-col max-[760px]:items-start max-[760px]:gap-3 max-[760px]:py-4',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        {navigation ? (
          <div className="inline-flex h-7 w-7 items-center justify-center rounded-pill text-ds-text-secondary">
            {navigation}
          </div>
        ) : null}
        <span className="font-text text-section-title font-semibold tracking-[var(--ds-type-section-title-tracking)] text-ds-text-primary">
          {title}
        </span>
      </div>
      <div className="flex items-center gap-[10px] max-[760px]:flex-wrap">{actions}</div>
    </header>
  );
}
