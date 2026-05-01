import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cx } from '../../../lib/cx';
import styles from './AppSidebar.module.css';

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
    <aside className={styles.root}>
      <div className={styles.traffic}>
        <button
          type="button"
          aria-label="Close"
          className={cx(styles.trafficDot, styles.trafficDotRed)}
          onClick={onClose}
        />
        <button
          type="button"
          aria-label="Minimize"
          className={cx(styles.trafficDot, styles.trafficDotYellow)}
          onClick={onMinimize}
        />
        <button
          type="button"
          aria-label="Toggle Maximize"
          className={cx(styles.trafficDot, styles.trafficDotGreen)}
          onClick={onMaximizeToggle}
        />
      </div>
      <nav className={styles.nav}>
        {items.map((item) => {
          const active = item.id === activeId;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className={cx(styles.item, active && styles.itemActive)}
              onClick={() => onSelect(item.id)}
            >
              <Icon size={16} className={styles.itemIcon} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      {footer}
    </aside>
  );
}
