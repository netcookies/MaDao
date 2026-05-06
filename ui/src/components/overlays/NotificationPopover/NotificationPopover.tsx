import type { ReactNode } from 'react';
import { AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { cx } from '../../../lib/cx';

export type NotificationLevel = 'info' | 'warning' | 'danger';

export type NotificationItem = {
  id: string;
  title: string;
  meta: ReactNode;
  level: NotificationLevel;
};

export type NotificationPopoverProps = {
  title?: string;
  markAllAction?: ReactNode;
  footer?: ReactNode;
  items: NotificationItem[];
};

export function NotificationPopover(props: NotificationPopoverProps) {
  const { title = 'Notifications', markAllAction, footer, items } = props;

  return (
    <section className="flex w-notification flex-col overflow-hidden rounded-[12px] border border-ds-border bg-ds-surface shadow-[0_8px_24px_rgba(0,0,0,0.16)]">
      <header className="flex items-center justify-between gap-3 bg-ds-content px-4 py-3">
        <h2 className="m-0 font-text text-utility font-semibold tracking-[var(--ds-type-utility-tracking)] text-ds-text-primary">{title}</h2>
        {markAllAction}
      </header>
      <div className="flex flex-col overflow-hidden">
        {items.length > 0 ? items.map((item) => (
          <div
            key={item.id}
            className={cx(
              'grid grid-cols-[16px_minmax(0,1fr)] items-start gap-[10px] border-b border-ds-border px-4 py-3 last:border-b-0',
              item.level === 'danger' && 'bg-ds-state-danger/10',
              item.level === 'warning' && 'bg-ds-state-warning/10',
              item.level === 'info' && 'bg-ds-surface',
            )}
          >
            <span
              className={cx(
                'inline-flex h-4 w-4 shrink-0 items-center justify-center',
                item.level === 'info' && 'text-ds-accent-blue',
                item.level === 'warning' && 'text-ds-state-warning',
                item.level === 'danger' && 'text-ds-state-danger',
              )}
            >
              {item.level === 'danger' ? <AlertCircle size={16} strokeWidth={2} /> : null}
              {item.level === 'warning' ? <AlertTriangle size={16} strokeWidth={2} /> : null}
              {item.level === 'info' ? <Info size={16} strokeWidth={2} /> : null}
            </span>
            <div className="flex min-w-0 flex-col gap-[3px]">
              <strong className={cx(
                'overflow-hidden text-ellipsis whitespace-nowrap font-text text-[13px] text-ds-text-primary',
                item.level === 'danger' ? 'font-medium' : 'font-normal',
              )}
              >
                {item.title}
              </strong>
              <span className="inline-flex items-center gap-1 whitespace-nowrap font-text text-[11px] font-normal tracking-[0] text-ds-text-secondary">
                {item.meta}
              </span>
            </div>
          </div>
        )) : (
          <div className="px-4 py-5 font-text text-caption font-normal tracking-[var(--ds-type-caption-tracking)] text-ds-text-secondary">
            No notifications.
          </div>
        )}
      </div>
      {footer ? <footer className="flex items-center justify-center gap-3 bg-ds-content px-4 py-[10px]">{footer}</footer> : null}
    </section>
  );
}
