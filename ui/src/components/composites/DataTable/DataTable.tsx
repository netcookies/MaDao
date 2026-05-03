import type { ReactNode } from 'react';
import { cx } from '../../../lib/cx';

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
    <div className={cx('flex flex-col', className)}>
      <div className={cx('flex flex-col', headerClassName)}>{header}</div>
      <div className={cx('flex flex-col', bodyClassName)}>{children}</div>
    </div>
  );
}
