import type { ReactNode } from 'react';
import { cx } from '../../../lib/cx';

export type AppShellProps = {
  sidebar: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
  compact?: boolean;
  sidebarCollapsed?: boolean;
  className?: string;
  fillViewport?: boolean;
  windowClassName?: string;
  contentClassName?: string;
};

export function AppShell(props: AppShellProps) {
  const {
    sidebar,
    toolbar,
    children,
    compact = false,
    sidebarCollapsed = false,
    className,
    fillViewport = true,
    windowClassName,
    contentClassName,
  } = props;

  return (
    <div
      className={cx(fillViewport ? 'min-h-screen' : 'h-full w-full', className)}
      data-compact={compact || undefined}
    >
      <div
        className={cx(
          'grid grid-cols-1 overflow-hidden bg-ds-window transition-[grid-template-columns] duration-fast ease-[var(--ds-motion-transition-fast)]',
          sidebarCollapsed
            ? 'min-[980px]:grid-cols-[64px_minmax(0,1fr)]'
            : 'min-[980px]:grid-cols-[var(--ds-size-sidebar-width)_minmax(0,1fr)]',
          fillViewport ? 'min-h-screen min-[980px]:h-screen' : 'h-full w-full',
          windowClassName,
        )}
      >
        {sidebar}
        <div className="flex min-w-0 flex-col bg-ds-content min-[980px]:h-screen min-[980px]:overflow-hidden">
          {toolbar}
          <main
            className={cx(
              'flex-1 bg-ds-content px-10 pb-8 pt-8 max-[760px]:px-5 max-[760px]:pb-5 max-[760px]:pt-5 min-[980px]:overflow-y-auto',
              compact && 'px-8 pb-8 pt-6',
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
