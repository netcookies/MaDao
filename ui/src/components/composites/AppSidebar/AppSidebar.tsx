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
  onClose?: () => void;
  onMinimize?: () => void;
  onMaximizeToggle?: () => void;
};

export function AppSidebar<T extends string>(props: AppSidebarProps<T>) {
  const {
    items,
    activeId,
    onSelect,
    footer,
    onClose,
    onMinimize,
    onMaximizeToggle,
  } = props;

  return (
    <aside className="flex flex-col border-b border-ds-border bg-ds-sidebar min-[980px]:border-b-0 min-[980px]:border-r">
      <div className="flex items-center gap-ds-xs px-3 pb-3 pt-[18px]">
        <button
          type="button"
          aria-label="Close"
          className="h-3 w-3 rounded-full bg-[#ff5f57]"
          onClick={onClose}
        />
        <button
          type="button"
          aria-label="Minimize"
          className="h-3 w-3 rounded-full bg-[#febc2e]"
          onClick={onMinimize}
        />
        <button
          type="button"
          aria-label="Toggle Maximize"
          className="h-3 w-3 rounded-full bg-[#28c840]"
          onClick={onMaximizeToggle}
        />
      </div>
      <nav className="flex flex-col gap-1 px-3 py-2">
        {items.map((item) => {
          const active = item.id === activeId;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className={cx(
                'flex items-center gap-3 rounded-sm px-3 py-2.5 text-left font-text text-[12px] font-normal leading-none tracking-[-0.12px] text-ds-text-primary transition-[background-color,color,opacity] duration-fast ease-[var(--ds-motion-transition-fast)] hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent-focus',
                active && 'bg-[#e7e7ea] font-semibold',
              )}
              onClick={() => onSelect(item.id)}
            >
              <Icon size={16} className={cx('opacity-60', active && 'opacity-100')} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      {footer}
    </aside>
  );
}
