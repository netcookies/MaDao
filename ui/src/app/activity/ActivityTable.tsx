import { useTranslation } from 'react-i18next';
import { cx } from '../../lib/cx';
import { formatProviderLabel, formatRelativeTime, formatServiceLabel } from '../../lib/formatters';
import { ResourceBadge } from '../../components/primitives';
import { DataTable } from '../ui-bridge';
import type { ActivityEntry, LanguageCode, ProviderManifest, TicketDecoration } from '../types';

type ActivityTableDensity = 'compact' | 'full';

type ActivityTableProps = {
  activity: ActivityEntry[];
  providers?: Record<string, ProviderManifest>;
  decorations?: Record<string, TicketDecoration>;
  density?: ActivityTableDensity;
  emptyTitle: string;
  emptyDescription?: string;
};

type ActivityLevel = ActivityEntry['level'];

const LEVEL_STYLES: Record<ActivityLevel, { text: string; subtleText: string; chip: string; letter: string }> = {
  info: {
    text: 'text-ds-accent-blue',
    subtleText: 'text-ds-accent-blue/70',
    chip: 'bg-ds-accent-soft text-ds-accent-blue',
    letter: 'I',
  },
  warn: {
    text: 'text-ds-state-warning',
    subtleText: 'text-ds-state-warning/75',
    chip: 'bg-[var(--ds-color-state-warning-soft)] text-ds-state-warning',
    letter: 'W',
  },
  error: {
    text: 'text-ds-state-danger',
    subtleText: 'text-ds-state-danger/75',
    chip: 'bg-ds-state-danger/10 text-ds-state-danger',
    letter: 'E',
  },
};

function buildActivityContext(entry: ActivityEntry, language: LanguageCode, t: (key: string) => string) {
  return {
    service: entry.service ?? null,
    routeLabel: entry.routing_plan_name ?? entry.routing_plan_id ?? entry.ticket_id ?? null,
    emptyLabel: t('Service'),
    serviceLabel: entry.service ? formatServiceLabel(entry.service, language) : null,
  };
}

function buildActivityMetaLine(entry: ActivityEntry, language: LanguageCode) {
  const relativeTime = formatRelativeTime(entry.timestamp, language);
  if (!entry.detail) {
    return relativeTime;
  }
  return `${entry.detail} · ${relativeTime}`;
}

function ActivityLevelLetter(props: { level: ActivityLevel }) {
  const style = LEVEL_STYLES[props.level];
  return (
    <span className={cx('inline-flex min-w-[24px] items-center justify-center rounded-pill px-1.5 py-0.5 text-[10px] font-semibold leading-none', style.chip)}>
      {style.letter}
    </span>
  );
}

export function ActivityTable(props: ActivityTableProps) {
  const { t, i18n } = useTranslation();
  const language = (i18n.resolvedLanguage ?? i18n.language ?? 'en') as LanguageCode;
  const density = props.density ?? 'full';

  const headerClassName = density === 'compact'
    ? 'grid grid-cols-1 items-center gap-4 border-b border-[var(--ds-color-divider-soft)] bg-[var(--ds-color-table-header)] px-4 py-2.5 text-[12px] font-medium tracking-[0] text-ds-text-primary/60 min-[760px]:grid-cols-[12ch_minmax(0,1fr)_156px]'
    : 'grid grid-cols-1 items-center gap-4 border-b border-solid border-ds-border-strong border-x-0 border-t-0 bg-ds-content px-4 py-2.5 text-[12px] font-medium tracking-[0] text-ds-text-secondary min-[760px]:grid-cols-[12ch_minmax(0,1fr)_156px_88px]';

  const rowClassName = density === 'compact'
    ? 'grid grid-cols-1 items-center gap-4 border-b border-[var(--ds-color-divider-soft)] px-4 py-2.5 last:border-b-0 min-[760px]:grid-cols-[12ch_minmax(0,1fr)_156px]'
    : 'grid grid-cols-1 items-center gap-4 border-b border-solid border-ds-border border-x-0 border-t-0 px-4 py-2.5 last:border-b-0 min-[760px]:grid-cols-[12ch_minmax(0,1fr)_156px_88px]';

  return (
    <DataTable
      headerClassName={headerClassName}
      header={(
        <>
          <span>{t('Provider')}</span>
          <span>{t('Event')}</span>
          <span>{t('Service')}</span>
          {density === 'full' ? <span>{t('Time')}</span> : null}
        </>
      )}
    >
      {props.activity.length > 0 ? props.activity.map((entry) => {
        const providerId = entry.provider ?? '';
        const providerManifest = providerId ? props.providers?.[providerId] : undefined;
        const providerIconUrl = providerManifest?.ui?.icon_url;
        const providerBadgeLabel = providerManifest?.ui?.badge_label;
        const levelStyle = LEVEL_STYLES[entry.level];
        const context = buildActivityContext(entry, language, t);
        const decoration = entry.ticket_id ? props.decorations?.[entry.ticket_id] : undefined;

        return (
          <div className={rowClassName} key={entry.id}>
            <span className="inline-flex min-w-0 items-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-medium text-ds-text-primary/80">
              {providerId ? (
                <>
                  <ResourceBadge kind="provider" value={providerId} size="sm" iconUrl={providerIconUrl} fallbackLabel={providerBadgeLabel ?? undefined} />
                  <span className="truncate">{formatProviderLabel(providerId, language)}</span>
                </>
              ) : (
                <span className="truncate text-ds-text-secondary">{t('Routing')}</span>
              )}
            </span>
            <span className="min-w-0">
              <span className="flex min-w-0 items-center gap-2">
                <ActivityLevelLetter level={entry.level} />
                <span className={cx('block min-w-0 truncate text-[13px] font-medium', levelStyle.text)} title={entry.title}>
                  {entry.title}
                </span>
              </span>
              <span className={cx('block truncate text-[12px]', levelStyle.subtleText)} title={buildActivityMetaLine(entry, language)}>
                {buildActivityMetaLine(entry, language)}
              </span>
            </span>
            <span className="inline-flex min-w-0 items-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-normal text-ds-text-secondary/85">
              {context.service ? (
                <>
                  <ResourceBadge kind="service" value={context.service} size="sm" iconUrl={decoration?.service_icon_url} />
                  <span className="truncate">{context.serviceLabel}</span>
                </>
              ) : context.routeLabel ? (
                <span className="truncate">{context.routeLabel}</span>
              ) : (
                <span className="truncate">{context.emptyLabel}</span>
              )}
            </span>
            {density === 'full' ? (
              <span className="text-[12px] text-ds-text-secondary" title={new Date(entry.timestamp).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}>
                {formatRelativeTime(entry.timestamp, language)}
              </span>
            ) : null}
          </div>
        );
      }) : (
        <div className="px-5 py-7 text-center">
          <strong className="block text-[14px] font-semibold tracking-[0] text-ds-text-primary">{props.emptyTitle}</strong>
          {props.emptyDescription ? (
            <p className="m-0 mt-2 text-[13px] leading-[1.45] text-ds-text-secondary">{props.emptyDescription}</p>
          ) : null}
        </div>
      )}
    </DataTable>
  );
}
