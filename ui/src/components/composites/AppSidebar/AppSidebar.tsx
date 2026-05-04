import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cx } from '../../../lib/cx';

export type AppSidebarItem<T extends string> = {
  id: T;
  label: string;
  icon: LucideIcon;
};

export type AppSidebarProps<T extends string> = {
  items: Array<AppSidebarItem<T>>;
  activeId: T;
  onSelect: (id: T) => void;
  footer?: ReactNode;
};

export function AppSidebar<T extends string>(props: AppSidebarProps<T>) {
  const {
    items,
    activeId,
    onSelect,
    footer,
  } = props;

  return (
    <aside className="flex h-full flex-col bg-ds-sidebar backdrop-blur-ds min-[980px]:overflow-y-auto min-[980px]:border-r min-[980px]:border-black/5">
      <nav className="flex flex-col gap-0.5 px-3 py-4 min-[980px]:pt-4">
        {items.map((item) => {
          const active = item.id === activeId;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className={cx(
                'flex w-full items-center gap-2 rounded-sm px-3 py-1.5 text-left font-text text-utility font-normal tracking-[var(--ds-type-utility-tracking)] text-ds-text-primary transition-[background-color,color,opacity] duration-fast ease-[var(--ds-motion-transition-fast)] hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent-focus',
                active && 'bg-[#e5e5ea] font-semibold',
              )}
              onClick={() => onSelect(item.id)}
            >
              <Icon size={16} className={cx(active ? 'opacity-100' : 'opacity-60')} />
              <span className={cx(active ? 'opacity-100' : 'opacity-80')}>{item.label}</span>
            </button>
          );
        })}
      </nav>
      {footer}
    </aside>
  );
}
