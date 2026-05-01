import type { HTMLAttributes, ReactNode } from 'react';
import styles from './SurfaceCard.module.css';

export type SurfaceCardProps = HTMLAttributes<HTMLDivElement> & {
  title?: ReactNode;
  headerAction?: ReactNode;
  flush?: boolean;
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export function SurfaceCard(props: SurfaceCardProps) {
  const { title, headerAction, flush = false, className, children, ...rest } = props;

  return (
    <section
      className={cx(styles.root, flush ? styles.flush : styles.default, className)}
      {...rest}
    >
      {(title || headerAction) && (
        <header className={styles.header}>
          {title ? <h2 className={styles.title}>{title}</h2> : <span />}
          {headerAction}
        </header>
      )}
      <div className={styles.body}>{children}</div>
    </section>
  );
}
