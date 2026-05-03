import { AppButton, PageHeader, StatusPill } from '../ui-bridge';
import type { TicketRecord } from '../types';
import { formatServiceLabel } from '../../lib/formatters';

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
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Good morning, Developer"
        subtitle="Here&apos;s what&apos;s happening with your SMS services today."
        meta={(
          <span className="font-text text-utility font-normal tracking-[var(--ds-type-utility-tracking)] text-ds-text-secondary">
            {props.statusMessage}
          </span>
        )}
      />

      <div className="grid grid-cols-1 gap-3 min-[760px]:grid-cols-3">
        <StatCard title="Messages Sent" value={props.stats.totalMessages} caption="+15% from session baseline" positive />
        <StatCard title="Active Providers" value={props.stats.activeProviders} caption="All systems operational" positive />
        <StatCard title="Success Rate" value={props.stats.successRate} caption="Live delivery confidence" />
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-ds-border bg-ds-surface p-5">
        <div className="flex items-center justify-between gap-4">
          <h2 className="m-0 font-text text-section-title font-semibold tracking-[var(--ds-type-section-title-tracking)] text-ds-text-primary">
            Recent Activity
          </h2>
          <AppButton variant="ghost" size="utility" onClick={props.onViewAll}>View All</AppButton>
        </div>
        <div className="flex flex-col">
          <div className="flex items-center gap-4 px-5 py-[17px] text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8c8c92]">
            <span>Provider</span><span>Status</span><span>Recipient</span><span>Service</span>
          </div>
          {props.activity.map((item) => (
            <div className="flex items-center gap-4 border-t border-ds-border px-5 py-[17px]" key={item.id}>
              <span className="flex-1 min-w-0">{item.provider}</span>
              <span className="flex-1 min-w-0"><StatusPill status={item.status} /></span>
              <span className="flex-1 min-w-0">{item.phone_number}</span>
              <span className="flex-1 min-w-0 text-ds-text-secondary">{formatServiceLabel(item.service)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard(props: { title: string; value: string; caption: string; positive?: boolean }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-ds-border bg-ds-surface px-5 py-[18px]">
      <div className="flex">
        <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8c8c92]">{props.title}</span>
      </div>
      <strong className="text-[28px] font-semibold leading-[1.1] tracking-[-0.28px] text-ds-text-primary">{props.value}</strong>
      <span className={props.positive ? 'text-[10px] text-ds-state-success' : 'text-[10px] text-ds-state-danger'}>
        {props.caption}
      </span>
    </div>
  );
}
