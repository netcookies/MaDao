import type { ReactNode } from 'react';
import { cx } from '../../../lib/cx';
import styles from './AppShell.module.css';

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
    <div className={cx(styles.root, compact && styles.compact, className)}>
      <div className={styles.window}>
        {sidebar}
        <div className={styles.main}>
          {toolbar}
          <main className={cx(styles.content, contentClassName)}>{children}</main>
        </div>
      </div>
    </div>
  );
}
