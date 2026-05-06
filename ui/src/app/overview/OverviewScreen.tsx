import type { ReactNode } from 'react';
import { MessageSquare, Server, Shield } from 'lucide-react';
import { AppButton, PageHeader, StatusPill } from '../ui-bridge';
import type { TicketRecord } from '../types';
import { formatProviderLabel, formatServiceLabel } from '../../lib/formatters';

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
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Good morning, Developer"
        subtitle="Here&apos;s what&apos;s happening with your SMS services today."
        meta={props.statusMessage ? (
          <span className="font-text text-utility font-normal tracking-[var(--ds-type-utility-tracking)] text-ds-text-secondary">
            {props.statusMessage}
          </span>
        ) : undefined}
      />

      <div className="grid grid-cols-1 gap-4 min-[760px]:grid-cols-3">
        <StatCard title="Messages Sent" value={props.stats.totalMessages} caption="+15% from yesterday" positive icon={<MessageSquare size={12} className="opacity-40" />} />
        <StatCard title="Active Providers" value={props.stats.activeProviders} caption="All systems operational" positive icon={<Server size={12} className="opacity-40" />} />
        <StatCard title="Success Rate" value={props.stats.successRate} caption="-0.1% from yesterday" icon={<Shield size={12} className="opacity-40" />} />
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="m-0 font-text text-[14px] font-semibold tracking-[0] text-ds-text-primary">
            Recent Activity
          </h2>
          <AppButton variant="outline" size="utility" onClick={props.onViewAll}>View All</AppButton>
        </div>
        <div className="overflow-hidden rounded-[8px] border border-solid border-ds-border-strong bg-ds-surface shadow-ds backdrop-blur-ds">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,1fr)] items-center gap-3 rounded-t-[8px] border-b border-solid border-ds-border-strong border-x-0 border-t-0 bg-ds-content px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ds-text-secondary">
            <span>Provider</span>
            <span>Status</span>
            <span>Recipient</span>
            <span>Service</span>
          </div>
          <div className="overflow-hidden rounded-b-[8px] bg-ds-surface">
            {props.activity.map((item) => (
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,1fr)] items-center gap-3 border-b border-solid border-ds-border border-x-0 border-t-0 px-4 py-2 last:border-b-0" key={item.id}>
                <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-body">{formatProviderLabel(item.provider)}</span>
                <span className="min-w-0"><OverviewStatusTag status={item.status} /></span>
                <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-body">{item.phone_number}</span>
                <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-body text-ds-text-secondary">{formatServiceLabel(item.service)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard(props: { title: string; value: string; caption: string; positive?: boolean; icon?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-sm border border-ds-border bg-ds-surface p-4 shadow-ds backdrop-blur-ds">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ds-text-secondary">{props.title}</span>
        {props.icon}
      </div>
      <strong className="text-[24px] font-semibold leading-[1.1] tracking-[-0.4px] text-ds-text-primary">{props.value}</strong>
      <span className={props.positive ? 'text-[10px] text-ds-state-success' : 'text-[10px] text-ds-state-danger'}>
        {props.caption}
      </span>
    </div>
  );
}

function OverviewStatusTag(props: { status: string }) {
  const normalized = props.status.toLowerCase();
  if (normalized.includes('deliver') || normalized.includes('received')) {
    return (
      <span className="inline-flex items-center gap-1 rounded-pill bg-ds-state-success/10 px-2 py-1 text-[12px] font-semibold text-ds-state-success">
        <span className="h-1.5 w-1.5 rounded-pill bg-ds-state-success" />
        Delivered
      </span>
    );
  }
  if (normalized.includes('pending') || normalized.includes('waiting')) {
    return (
      <span className="inline-flex items-center gap-1 rounded-pill bg-ds-state-warning/10 px-2 py-1 text-[12px] font-semibold text-ds-state-warning">
        <span className="h-1.5 w-1.5 rounded-pill bg-ds-state-warning" />
        Pending
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-pill bg-ds-state-danger/10 px-2 py-1 text-[12px] font-semibold text-ds-state-danger">
      <span className="h-1.5 w-1.5 rounded-pill bg-ds-state-danger" />
      Failed
    </span>
  );
}
