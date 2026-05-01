import type { ReactNode } from 'react';
import { cx } from '../../../lib/cx';
import styles from './PageHeader.module.css';

export type PageHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  align?: 'start' | 'center';
  className?: string;
};

export function PageHeader(props: PageHeaderProps) {
  const { title, subtitle, meta, actions, align = 'start', className } = props;

  return (
    <div className={cx(styles.root, align === 'center' && styles.center, className)}>
      <div className={styles.copy}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
      </div>
      {(meta || actions) ? (
        <div className={styles.side}>
          {meta}
          {actions}
        </div>
      ) : null}
    </div>
  );
}
