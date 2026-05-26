import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AppButton, DataTable, PageHeader, SegmentedControl } from '../ui-bridge';
import { cx } from '../../lib/cx';
import type { ActivityEntry, LanguageCode, ProviderManifest, TicketDecoration } from '../types';
import { formatScopeLabel } from '../../lib/formatters';
import { ActivityTable } from '../activity/ActivityTable';

export type LogFilter = 'all' | 'info' | 'warn' | 'error';
export type ActivityViewMode = 'activity' | 'logs';

export type LogEntry = {
  timestamp: string;
  scope: string;
  level: string;
  message: string;
};

export type LogsScreenProps = {
  logs: LogEntry[];
  activity?: ActivityEntry[];
  providers?: Record<string, ProviderManifest>;
  decorations?: Record<string, TicketDecoration>;
  viewMode: ActivityViewMode;
  setViewMode: (value: ActivityViewMode) => void;
  filter: LogFilter;
  setFilter: (value: LogFilter) => void;
  filters: Array<{ id: LogFilter; label: string }>;
  search: string;
  onSearch: (value: string) => void;
  onClearLogs: () => void;
};

export function LogsScreen(props: LogsScreenProps) {
  const { t, i18n } = useTranslation();
  const language = (i18n.resolvedLanguage ?? i18n.language ?? 'en') as LanguageCode;
  const timeLocale = language === 'zh' ? 'zh-CN' : 'en-US';
  const visibleLogs = [...props.logs].sort((left, right) => (
    new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()
  ));
  const visibleActivity = [...(props.activity ?? [])].sort((left, right) => (
    new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()
  ));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t('Activity')}
        subtitle={props.viewMode === 'activity' ? t('Full event history across tickets, routing, and releases.') : t('Real-time event stream for debugging and monitoring.')}
        align="center"
        actions={(
          props.viewMode === 'activity' ? null : (
            <AppButton variant="danger-outline" size="utility" onClick={props.onClearLogs}>
              <Trash2 size={14} />
              {t('Clear Logs')}
            </AppButton>
          )
        )}
      />

      <div className="flex flex-wrap items-center justify-end gap-4">
        <SegmentedControl
          items={[
            { id: 'activity', label: t('Activity Feed') },
            { id: 'logs', label: t('System Logs') },
          ]}
          value={props.viewMode}
          onChange={props.setViewMode}
          appearance="rail"
          className="min-h-0"
        />
        <SegmentedControl items={props.filters} value={props.filter} onChange={props.setFilter} appearance="rail" className="min-h-0" />
      </div>

      <div className="overflow-hidden rounded-[12px] border border-solid border-ds-border-strong bg-ds-surface shadow-ds backdrop-blur-ds">
        {props.viewMode === 'activity' ? (
          <ActivityTable
            activity={visibleActivity}
            providers={props.providers}
            decorations={props.decorations}
            density="full"
            emptyTitle={t('No activity events.')}
          />
        ) : (
          <DataTable
            headerClassName="grid grid-cols-1 items-center gap-3 border-b border-solid border-ds-border-strong border-x-0 border-t-0 bg-ds-content px-4 py-2.5 text-[12px] font-medium uppercase tracking-[0.08em] text-ds-text-secondary min-[760px]:grid-cols-[58px_96px_72px_minmax(0,1fr)]"
            header={(
              <>
                <span>{t('Level')}</span>
                <span>{t('Time')}</span>
                <span>{t('Scope')}</span>
                <span>{t('Message')}</span>
              </>
            )}
          >
            {visibleLogs.length > 0 ? visibleLogs.map((entry, index) => (
              <div
                className={cx(
                  'grid grid-cols-1 items-center gap-3 border-b border-solid border-ds-border border-x-0 border-t-0 px-4 py-2.5 last:border-b-0 min-[760px]:grid-cols-[58px_96px_72px_minmax(0,1fr)]',
                  entry.level.toLowerCase() === 'error' && 'bg-ds-state-danger/10',
                  entry.level.toLowerCase() === 'warn' && 'bg-ds-state-warning/10',
                  entry.level.toLowerCase() !== 'error' && entry.level.toLowerCase() !== 'warn' && 'bg-ds-surface',
                )}
                key={`${entry.timestamp}-${index}`}
              >
                <span>
                  <span
                    className={cx(
                      'inline-flex min-w-[58px] items-center justify-center rounded-[4px] px-2 py-1 text-[11px] font-normal uppercase tracking-[0] text-white',
                      entry.level.toLowerCase() === 'error' && 'bg-ds-state-danger',
                      entry.level.toLowerCase() === 'warn' && 'bg-ds-state-warning',
                      entry.level.toLowerCase() !== 'error' && entry.level.toLowerCase() !== 'warn' && 'bg-ds-accent-blue',
                    )}
                  >
                    {entry.level.toUpperCase()}
                  </span>
                </span>
                <span className="text-[12px] text-ds-text-secondary">{new Date(entry.timestamp).toLocaleTimeString(timeLocale)}</span>
                <span className="break-words text-[12px] text-ds-text-secondary">{formatScopeLabel(entry.scope, language)}</span>
                <span className={cx(
                  'text-[13px]',
                  entry.level.toLowerCase() === 'error' && 'text-ds-state-danger',
                  entry.level.toLowerCase() === 'warn' && 'text-ds-state-warning',
                  entry.level.toLowerCase() !== 'error' && entry.level.toLowerCase() !== 'warn' && 'text-ds-text-primary/85',
                )}
                >
                  {entry.message}
                </span>
              </div>
            )) : (
              <div className="px-5 py-7 text-center text-utility tracking-[var(--ds-type-utility-tracking)] text-ds-text-secondary">
                {t('No log events.')}
              </div>
            )}
          </DataTable>
        )}
      </div>
    </div>
  );
}
