import type { ReactNode } from 'react';
import { cx } from '../../../lib/cx';

export type AppShellProps = {
  sidebar: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
  compact?: boolean;
  className?: string;
  contentClassName?: string;
};

export function AppShell(props: AppShellProps) {
  const {
    sidebar,
    toolbar,
    children,
    compact = false,
    className,
    contentClassName,
  } = props;

  return (
    <div className={cx('min-h-screen', className)} data-compact={compact || undefined}>
      <div className="grid min-h-screen grid-cols-1 bg-ds-content min-[980px]:grid-cols-[var(--ds-size-sidebar-width)_minmax(0,1fr)]">
        {sidebar}
        <div className="flex min-w-0 flex-col bg-ds-content">
          {toolbar}
          <main
            className={cx(
              'flex-1 bg-ds-content px-[36px] pb-[36px] pt-7 max-[760px]:px-5 max-[760px]:pb-5',
              compact && 'px-7 pb-7 pt-6',
              contentClassName,
            )}
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
