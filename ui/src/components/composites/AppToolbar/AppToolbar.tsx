import type { ReactNode } from 'react';
import { cx } from '../../../lib/cx';
import styles from './AppToolbar.module.css';

export type AppToolbarProps = {
  title: ReactNode;
  navigation?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function AppToolbar(props: AppToolbarProps) {
  const { title, navigation, actions, className } = props;

  return (
    <header className={cx(styles.root, className)}>
      <div className={styles.left}>
        {navigation ? <div className={styles.nav}>{navigation}</div> : null}
        <span className={styles.title}>{title}</span>
      </div>
      <div className={styles.right}>{actions}</div>
    </header>
  );
}
