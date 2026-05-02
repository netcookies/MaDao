import { AppButton, PageHeader, StatusPill } from '../ui-bridge';
import type { TicketRecord } from '../types';
import { cx } from '../../lib/cx';
import { formatServiceLabel } from '../../lib/formatters';
import styles from './OverviewScreen.module.css';

export type OverviewStats = {
  totalMessages: string;
  activeProviders: string;
  successRate: string;
};

export type OverviewScreenProps = {
  stats: OverviewStats;
  activity: TicketRecord[];
  statusMessage: string;
  onViewAll: () => void;
};

export function OverviewScreen(props: OverviewScreenProps) {
  return (
    <div className="d-page">
      <PageHeader
        title="Good morning, Developer"
        subtitle="Here&apos;s what&apos;s happening with your SMS services today."
        meta={<span className="d-status-note">{props.statusMessage}</span>}
      />

      <div className={styles.statsGrid}>
        <StatCard title="Messages Sent" value={props.stats.totalMessages} caption="+15% from session baseline" positive />
        <StatCard title="Active Providers" value={props.stats.activeProviders} caption="All systems operational" positive />
        <StatCard title="Success Rate" value={props.stats.successRate} caption="Live delivery confidence" />
      </div>

      <div className="d-card">
        <div className="d-card-head">
          <h2 className="d-card-title">Recent Activity</h2>
          <AppButton variant="ghost" size="utility" onClick={props.onViewAll}>View All</AppButton>
        </div>
        <div className="d-table">
          <div className="d-table-row d-table-header">
            <span>Provider</span><span>Status</span><span>Recipient</span><span>Service</span>
          </div>
          {props.activity.map((item) => (
            <div className="d-table-row" key={item.id}>
              <span>{item.provider}</span>
              <span><StatusPill status={item.status} /></span>
              <span>{item.phone_number}</span>
              <span className="d-table-service">{formatServiceLabel(item.service)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard(props: { title: string; value: string; caption: string; positive?: boolean }) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statHead}>
        <span className={styles.statLabel}>{props.title}</span>
      </div>
      <strong className={styles.statValue}>{props.value}</strong>
      <span className={cx(styles.statCaption, props.positive ? styles.positive : styles.negative)}>{props.caption}</span>
    </div>
  );
}
