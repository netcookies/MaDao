import type { ReactNode } from 'react';
import { Check, Send, Server } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AppButton, PageHeader } from '../ui-bridge';
import type { LanguageCode, TicketRecord } from '../types';
import { formatProviderLabel, formatServiceLabel } from '../../lib/formatters';
import { ResourceBadge } from '../../components/primitives';

export type OverviewStats = {
  totalMessages: string;
  activeProviders: string;
  successRate: string;
};

export type OverviewScreenProps = {
  stats: OverviewStats;
  activity: TicketRecord[];
  onViewAll: () => void;
};

export function OverviewScreen(props: OverviewScreenProps) {
  const { t, i18n } = useTranslation();
  const language = (i18n.resolvedLanguage ?? i18n.language ?? 'en') as LanguageCode;
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

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="m-0 font-text text-[14px] font-semibold tracking-[0] text-ds-text-primary">
            {t('Recent Activity')}
          </h2>
          <AppButton variant="outline" size="utility" onClick={props.onViewAll}>{t('View All')}</AppButton>
        </div>
        <div className="overflow-hidden rounded-[8px] border border-[var(--ds-color-card-border)] bg-[var(--ds-color-card-surface)] shadow-[0_2px_2px_rgba(0,0,0,0.06)] backdrop-blur-ds">
          <div className="grid grid-cols-[130px_136px_minmax(0,1fr)_124px] items-center gap-3 border-b border-[var(--ds-color-divider-soft)] bg-[var(--ds-color-table-header)] px-4 py-2.5 text-[12px] font-medium tracking-[0] text-ds-text-primary/60">
            <span>{t('Provider')}</span>
            <span>{t('Status')}</span>
            <span>{t('Recipient')}</span>
            <span>{t('Service')}</span>
          </div>
          {props.activity.length > 0 ? (
            <div className="overflow-hidden rounded-b-[8px] bg-transparent">
              {props.activity.map((item) => (
                <div className="grid grid-cols-[130px_136px_minmax(0,1fr)_124px] items-center gap-3 border-b border-[var(--ds-color-divider-soft)] px-4 py-2 last:border-b-0" key={item.id}>
                  <span className="inline-flex min-w-0 items-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-medium text-ds-text-primary/80">
                    <ResourceBadge kind="provider" value={item.provider} size="sm" />
                    <span className="truncate">{formatProviderLabel(item.provider, language)}</span>
                  </span>
                  <span className="min-w-0"><OverviewStatusTag status={item.status} language={language} /></span>
                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-normal text-ds-text-primary/80">{item.phone_number}</span>
                  <span className="inline-flex min-w-0 items-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-normal text-ds-text-secondary/80">
                    <ResourceBadge kind="service" value={item.service} size="sm" />
                    <span className="truncate">{formatServiceLabel(item.service, language)}</span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-[140px] flex-col items-center justify-center gap-2 px-6 py-8 text-center">
              <strong className="text-[14px] font-semibold tracking-[0] text-ds-text-primary">{t('No recent activity yet')}</strong>
              <p className="m-0 max-w-[320px] text-[13px] leading-[1.45] text-ds-text-secondary">
                {t('Create a new activation to populate this activity feed with live provider results.')}
              </p>
            </div>
          )}
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

function OverviewStatusTag(props: { status: string; language: 'en' | 'zh' }) {
  const { t } = useTranslation();
  const normalized = props.status.toLowerCase();
  if (normalized.includes('deliver') || normalized.includes('received') || normalized.includes('connected') || normalized.includes('operational')) {
    return (
      <span className="inline-flex items-center gap-1 rounded-pill bg-ds-state-success/10 px-2 py-1 text-[12px] font-semibold text-ds-state-success">
        <span className="h-1.5 w-1.5 rounded-pill bg-ds-state-success" />
        {t('Delivered')}
      </span>
    );
  }
  if (normalized.includes('pending') || normalized.includes('waiting') || normalized.includes('standby')) {
    return (
      <span className="inline-flex items-center gap-1 rounded-pill bg-ds-state-warning/10 px-2 py-1 text-[12px] font-semibold text-ds-state-warning">
        <span className="h-1.5 w-1.5 rounded-pill bg-ds-state-warning" />
        {t('Pending')}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-pill bg-ds-state-danger/10 px-2 py-1 text-[12px] font-semibold text-ds-state-danger">
      <span className="h-1.5 w-1.5 rounded-pill bg-ds-state-danger" />
      {t('Failed')}
    </span>
  );
}
