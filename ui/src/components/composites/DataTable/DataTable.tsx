import type { ReactNode } from 'react';
import { cx } from '../../../lib/cx';
import styles from './DataTable.module.css';

export type DataTableProps = {
  header: ReactNode;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
};

export function DataTable(props: DataTableProps) {
  const { header, children, className, headerClassName, bodyClassName } = props;

  return (
    <div className={cx(styles.root, className)}>
      <div className={cx(styles.head, headerClassName)}>{header}</div>
      <div className={cx(styles.body, bodyClassName)}>{children}</div>
    </div>
  );
}
