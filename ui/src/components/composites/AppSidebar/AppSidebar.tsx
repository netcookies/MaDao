import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cx } from '../../../lib/cx';
import appIcon from '../../../assets/brand-mark.png';

export type AppSidebarItem<T extends string> = {
  id: T;
  label: string;
  icon: LucideIcon;
};

export type AppSidebarProps<T extends string> = {
  items: Array<AppSidebarItem<T>>;
  activeId: T;
  onSelect: (id: T) => void;
  collapsed?: boolean;
  footer?: ReactNode;
};

export function AppSidebar<T extends string>(props: AppSidebarProps<T>) {
  const {
    items,
    activeId,
    onSelect,
    collapsed = false,
    footer,
  } = props;

  return (
    <aside className={cx(
      'flex h-full flex-col bg-ds-sidebar backdrop-blur-ds transition-[width] duration-fast ease-[var(--ds-motion-transition-fast)] min-[980px]:overflow-y-auto min-[980px]:border-r min-[980px]:border-ds-border',
      collapsed ? 'min-[980px]:w-[64px]' : 'min-[980px]:w-sidebar',
    )}>
      <div className={cx('px-4 pb-2 pt-4', collapsed && 'px-3 pb-3')}>
        <div className={cx('flex items-center gap-3 bg-transparent py-1', collapsed && 'justify-center')}>
          <img
            src={appIcon}
            alt="MaDao logo"
            className={cx('h-11 w-11 shrink-0 rounded-[12px] object-contain', collapsed && 'h-10 w-10')}
          />
          <div className={cx('flex min-w-0 flex-col', collapsed && 'hidden')}>
            <span className="truncate font-display text-[26px] font-semibold leading-[1] tracking-[-0.04em] text-ds-text-primary">
                码到
            </span>
            <span className="mt-1 truncate font-text text-[12px] font-medium tracking-[0.12em] text-ds-text-secondary">
              MaDao
            </span>
          </div>
        </div>
      </div>
      <nav className={cx('flex flex-col gap-1 px-3.5 py-3 min-[980px]:pt-3', collapsed && 'px-2.5')}>
        {items.map((item) => {
          const active = item.id === activeId;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              aria-label={item.label}
              title={collapsed ? item.label : undefined}
              className={cx(
                'flex min-h-[44px] w-full items-center gap-2.5 rounded-sm px-3.5 py-2 text-left font-text text-[16px] font-normal leading-[1.25] tracking-[0] text-ds-text-primary transition-[background-color,color,opacity] duration-fast ease-[var(--ds-motion-transition-fast)] hover:bg-ds-surface-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent-focus',
                collapsed && 'justify-center gap-0 px-0',
                active && 'bg-ds-surface-subtle font-medium',
              )}
              onClick={() => onSelect(item.id)}
            >
              <Icon size={18} className={cx('shrink-0', active ? 'opacity-100' : 'opacity-60')} />
              <span className={cx(active ? 'opacity-100' : 'opacity-80', collapsed && 'sr-only')}>{item.label}</span>
            </button>
          );
        })}
      </nav>
      {footer}
    </aside>
  );
}
