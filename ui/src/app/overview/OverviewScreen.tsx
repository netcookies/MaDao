import type { ReactNode } from 'react';
import { Check, Send, Server } from 'lucide-react';
import { AppButton, PageHeader } from '../ui-bridge';
import type { TicketRecord } from '../types';
import { formatProviderLabel, formatServiceLabel } from '../../lib/formatters';
import { useLanguage } from '../language';

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
  const language = useLanguage();
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={language === 'zh' ? '早上好，开发者' : 'Good morning, Developer'}
        subtitle={language === 'zh' ? '这里是你今天的短信服务运行概况。' : "Here's what's happening with your SMS services today."}
      />

      <div className="grid grid-cols-1 gap-4 min-[760px]:grid-cols-3">
        <StatCard title={language === 'zh' ? '已发送消息' : 'Messages Sent'} value={props.stats.totalMessages} caption={language === 'zh' ? '较昨天 +15%' : '+15% from yesterday'} positive icon={<Send size={12} className="opacity-40" />} />
        <StatCard title={language === 'zh' ? '活跃服务商' : 'Active Providers'} value={props.stats.activeProviders} caption={language === 'zh' ? '系统运行正常' : 'All systems operational'} positive icon={<Server size={12} className="opacity-40" />} />
        <StatCard title={language === 'zh' ? '成功率' : 'Success Rate'} value={props.stats.successRate} caption={language === 'zh' ? '较昨天 -0.1%' : '-0.1% from yesterday'} icon={<Check size={12} className="opacity-40" />} />
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="m-0 font-text text-[14px] font-semibold tracking-[0] text-ds-text-primary">
            {language === 'zh' ? '最近活动' : 'Recent Activity'}
          </h2>
          <AppButton variant="outline" size="utility" onClick={props.onViewAll}>{language === 'zh' ? '查看全部' : 'View All'}</AppButton>
        </div>
        <div className="overflow-hidden rounded-[8px] border border-[var(--ds-color-card-border)] bg-[var(--ds-color-card-surface)] shadow-[0_2px_2px_rgba(0,0,0,0.06)] backdrop-blur-ds">
          <div className="grid grid-cols-[130px_136px_minmax(0,1fr)_124px] items-center gap-3 border-b border-[var(--ds-color-divider-soft)] bg-[var(--ds-color-table-header)] px-4 py-2.5 text-[12px] font-medium tracking-[0] text-ds-text-primary/60">
            <span>{language === 'zh' ? '服务商' : 'Provider'}</span>
            <span>{language === 'zh' ? '状态' : 'Status'}</span>
            <span>{language === 'zh' ? '号码' : 'Recipient'}</span>
            <span>{language === 'zh' ? '服务' : 'Service'}</span>
          </div>
          {props.activity.length > 0 ? (
            <div className="overflow-hidden rounded-b-[8px] bg-transparent">
              {props.activity.map((item) => (
                <div className="grid grid-cols-[130px_136px_minmax(0,1fr)_124px] items-center gap-3 border-b border-[var(--ds-color-divider-soft)] px-4 py-2 last:border-b-0" key={item.id}>
                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-medium text-ds-text-primary/80">{formatProviderLabel(item.provider, language)}</span>
                  <span className="min-w-0"><OverviewStatusTag status={item.status} language={language} /></span>
                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-normal text-ds-text-primary/80">{item.phone_number}</span>
                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-normal text-ds-text-secondary/80">{formatServiceLabel(item.service, language)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-[140px] flex-col items-center justify-center gap-2 px-6 py-8 text-center">
              <strong className="text-[14px] font-semibold tracking-[0] text-ds-text-primary">{language === 'zh' ? '暂无最近活动' : 'No recent activity yet'}</strong>
              <p className="m-0 max-w-[320px] text-[13px] leading-[1.45] text-ds-text-secondary">
                {language === 'zh' ? '创建一个新的激活请求后，这里会显示实时的 Provider 结果。' : 'Create a new activation to populate this activity feed with live provider results.'}
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
  const normalized = props.status.toLowerCase();
  if (normalized.includes('deliver') || normalized.includes('received') || normalized.includes('connected') || normalized.includes('operational')) {
    return (
      <span className="inline-flex items-center gap-1 rounded-pill bg-ds-state-success/10 px-2 py-1 text-[12px] font-semibold text-ds-state-success">
        <span className="h-1.5 w-1.5 rounded-pill bg-ds-state-success" />
        {props.language === 'zh' ? '已送达' : 'Delivered'}
      </span>
    );
  }
  if (normalized.includes('pending') || normalized.includes('waiting') || normalized.includes('standby')) {
    return (
      <span className="inline-flex items-center gap-1 rounded-pill bg-ds-state-warning/10 px-2 py-1 text-[12px] font-semibold text-ds-state-warning">
        <span className="h-1.5 w-1.5 rounded-pill bg-ds-state-warning" />
        {props.language === 'zh' ? '等待中' : 'Pending'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-pill bg-ds-state-danger/10 px-2 py-1 text-[12px] font-semibold text-ds-state-danger">
      <span className="h-1.5 w-1.5 rounded-pill bg-ds-state-danger" />
      {props.language === 'zh' ? '失败' : 'Failed'}
    </span>
  );
}
