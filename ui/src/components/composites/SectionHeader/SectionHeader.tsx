import type { ReactNode } from 'react';
import styles from './SectionHeader.module.css';

export type SectionHeaderProps = {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
};

export function SectionHeader(props: SectionHeaderProps) {
  const { eyebrow, title, description, icon, badge, actions } = props;

  return (
    <div className={styles.root}>
      <div className={styles.main}>
        {icon ? <div className={styles.icon}>{icon}</div> : null}
        <div className={styles.copy}>
          {eyebrow ? <span className={styles.eyebrow}>{eyebrow}</span> : null}
          <div className={styles.titleRow}>
            <h2 className={styles.title}>{title}</h2>
            {badge}
          </div>
          {description ? <p className={styles.description}>{description}</p> : null}
        </div>
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}
