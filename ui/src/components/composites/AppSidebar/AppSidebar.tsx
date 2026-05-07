import type { ReactNode } from 'react';
import { PanelLeftClose, PanelLeftOpen, type LucideIcon } from 'lucide-react';
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
  onToggleCollapsed?: () => void;
  footer?: ReactNode;
};

export function AppSidebar<T extends string>(props: AppSidebarProps<T>) {
  const {
    items,
    activeId,
    onSelect,
    collapsed = false,
    onToggleCollapsed,
    footer,
  } = props;

  return (
    <aside className={cx(
      'relative z-20 flex h-full flex-col bg-ds-sidebar backdrop-blur-ds transition-[width] duration-fast ease-[var(--ds-motion-transition-fast)] min-[980px]:overflow-visible',
      collapsed ? 'min-[980px]:w-[64px]' : 'min-[980px]:w-sidebar',
    )}>
      {onToggleCollapsed ? (
        <button
          type="button"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="absolute right-[-12px] top-[calc(var(--ds-size-toolbar-height)/2-14px)] z-30 hidden h-7 w-7 items-center justify-center rounded-pill bg-transparent text-ds-text-secondary transition-[color,transform,opacity] duration-fast ease-[var(--ds-motion-transition-fast)] hover:translate-x-[1px] hover:text-ds-text-primary active:scale-press focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent-focus min-[980px]:inline-flex"
          onClick={onToggleCollapsed}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col min-[980px]:overflow-y-auto">
        <div className={cx('px-4 pb-2.5 pt-4', collapsed && 'px-3 pb-3')}>
          <div className={cx('flex items-start justify-between gap-3 bg-transparent py-1', collapsed && 'justify-center')}>
            <div className={cx('flex items-center gap-3', collapsed && 'justify-center')}>
              <img
                src={appIcon}
                alt="MaDao logo"
                className={cx('h-11 w-11 shrink-0 rounded-[12px] object-contain', collapsed && 'h-10 w-10')}
              />
              <div className={cx('flex min-w-0 flex-col', collapsed && 'hidden')}>
                <span className="text-[28px] font-bold leading-[1.15] tracking-[-0.04em] text-ds-text-primary [font-family:'Bradley_Hand',var(--ds-font-family-display)]">
                  码到
                </span>
                <span className="mt-0.5 truncate text-[14px] font-semibold tracking-[0] text-ds-text-secondary [font-family:'Bradley_Hand',var(--ds-font-family-display)]">
                  MaDao
                </span>
              </div>
            </div>
            {onToggleCollapsed ? (
              <button
                type="button"
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                className={cx(
                  'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-pill text-ds-text-secondary transition-colors duration-fast ease-[var(--ds-motion-transition-fast)] hover:bg-[var(--ds-color-interactive-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent-focus min-[980px]:hidden',
                  collapsed && 'mt-1',
                )}
                onClick={onToggleCollapsed}
              >
                {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
              </button>
            ) : null}
          </div>
        </div>
        <nav className={cx('flex flex-col gap-0.5 px-3 pb-4 pt-2', collapsed && 'px-2.5')}>
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
                  'flex w-full items-center gap-2 rounded-[8px] px-3 py-1.5 text-left font-text text-[14px] font-normal leading-[1.25] tracking-[0] text-ds-text-primary transition-[background-color,border-color,color,opacity] duration-fast ease-[var(--ds-motion-transition-fast)] hover:bg-[var(--ds-color-interactive-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent-focus',
                  collapsed && 'justify-center gap-0 px-0',
                  active && 'border border-[var(--ds-color-control-rail-border)] bg-[var(--ds-color-interactive-active)] font-semibold',
                )}
                onClick={() => onSelect(item.id)}
              >
                <Icon size={16} className={cx('shrink-0', active ? 'opacity-100' : 'opacity-60')} />
                <span className={cx(active ? 'opacity-100' : 'opacity-80', collapsed && 'sr-only')}>{item.label}</span>
              </button>
            );
          })}
        </nav>
        {footer}
      </div>
    </aside>
  );
}
