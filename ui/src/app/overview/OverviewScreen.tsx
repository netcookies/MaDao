import type { ReactNode } from 'react';
import { Check, Send, Server } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AppButton, PageHeader } from '../ui-bridge';
import type { ActivityEntry, ProviderManifest, TicketDecoration } from '../types';
import { ActivityTable } from '../activity/ActivityTable';
import type { OverviewStatisticsProps } from './OverviewStatistics';
import { OverviewStatistics } from './OverviewStatistics';

export type OverviewStats = {
  totalMessages: string;
  activeProviders: string;
  successRate: string;
};

export type OverviewScreenProps = {
  stats: OverviewStats;
  activity: ActivityEntry[];
  providers?: Record<string, ProviderManifest>;
  decorations?: Record<string, TicketDecoration>;
  onViewAll: () => void;
  statistics?: OverviewStatisticsProps;
  statisticsLoading?: boolean;
};

export function OverviewScreen(props: OverviewScreenProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={t('Good morning, Developer')}
        subtitle={t("Here's what's happening with your SMS services today.")}
      />

      <div className="grid grid-cols-1 gap-4 min-[760px]:grid-cols-3">
        <StatCard title={t('Messages Sent')} value={props.stats.totalMessages} caption={t('+15% from yesterday')} positive icon={<Send size={12} className="opacity-40" />} />
        <StatCard title={t('Active Providers')} value={props.stats.activeProviders} caption={t('All systems operational')} positive icon={<Server size={12} className="opacity-40" />} />
        <StatCard title={t('Success Rate')} value={props.stats.successRate} caption={t('-0.1% from yesterday')} icon={<Check size={12} className="opacity-40" />} />
      </div>

      {props.statistics && (
        <OverviewStatistics
          {...props.statistics}
          loading={props.statisticsLoading}
        />
      )}

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="m-0 font-text text-[14px] font-semibold tracking-[0] text-ds-text-primary">
            {t('Recent Activity')}
          </h2>
          <AppButton variant="outline" size="utility" onClick={props.onViewAll}>{t('View All')}</AppButton>
        </div>
        <div className="overflow-hidden rounded-[8px] border border-[var(--ds-color-card-border)] bg-[var(--ds-color-card-surface)] shadow-[0_2px_2px_rgba(0,0,0,0.06)] backdrop-blur-ds">
          <ActivityTable
            activity={props.activity}
            providers={props.providers}
            decorations={props.decorations}
            density="compact"
            emptyTitle={t('No recent activity yet')}
            emptyDescription={t('Create a new activation to populate this activity feed with live provider results.')}
          />
        </div>
      </div>

    </div>
  );
}

function StatCard(props: { title: string; value: string; caption: string; positive?: boolean; icon?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-[8px] border border-[var(--ds-color-card-border)] bg-[var(--ds-color-card-surface)] p-4 shadow-[0_2px_2px_rgba(0,0,0,0.06)] backdrop-blur-ds">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.02em] text-ds-text-primary/50">{props.title}</span>
        {props.icon}
      </div>
      <strong className="text-[24px] font-semibold leading-[1.1] tracking-[-0.4px] text-ds-text-primary">{props.value}</strong>
      <span className={props.positive ? 'text-[10px] text-ds-state-success' : 'text-[10px] text-ds-state-danger'}>
        {props.caption}
      </span>
    </div>
  );
}
