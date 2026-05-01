import type { ReactNode } from 'react';
import { cx } from '../../../lib/cx';
import styles from './NotificationPopover.module.css';

export type NotificationLevel = 'info' | 'warning' | 'danger';

export type NotificationItem = {
  id: string;
  title: string;
  meta: string;
  level: NotificationLevel;
};

export type NotificationPopoverProps = {
  title?: string;
  markAllAction?: ReactNode;
  footer?: ReactNode;
  items: NotificationItem[];
};

function levelGlyph(level: NotificationLevel) {
  if (level === 'danger') return '⊘';
  if (level === 'warning') return '!';
  return 'i';
}

export function NotificationPopover(props: NotificationPopoverProps) {
  const { title = 'Notifications', markAllAction, footer, items } = props;

  return (
    <section className={styles.root}>
      <header className={styles.header}>
        <h2 className={styles.headerTitle}>{title}</h2>
        {markAllAction}
      </header>
      <div className={styles.list}>
        {items.length > 0 ? items.map((item) => (
          <div key={item.id} className={styles.item}>
            <span className={cx(styles.icon, styles[item.level])}>
              {levelGlyph(item.level)}
            </span>
            <div className={styles.copy}>
              <strong className={styles.title}>{item.title}</strong>
              <span className={styles.meta}>{item.meta}</span>
            </div>
          </div>
        )) : <div className={styles.empty}>No notifications.</div>}
      </div>
      {footer ? <footer className={styles.footer}>{footer}</footer> : null}
    </section>
  );
}
