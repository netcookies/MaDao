import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader, StatusBadge } from '../ui-bridge';
import type { LanguageCode, ProviderManifest, ProviderSummary } from '../types';
import { formatProviderLabel, formatProviderProtocolLabel } from '../../lib/formatters';
import { ResourceBadge } from '../../components/primitives';

export type ProvidersListScreenProps = {
  providers: ProviderManifest[];
  summaries?: ProviderSummary[];
  balances?: Record<string, string>;
  onConfigure: (id: string) => void;
  onRefreshBalance: (id: string) => void;
  onReorder: (ids: string[]) => void;
  onToggleEnabled: (id: string, enabled: boolean) => void;
};

export function ProvidersListScreen(props: ProvidersListScreenProps) {
  const { t, i18n } = useTranslation();
  const language = (i18n.resolvedLanguage ?? i18n.language ?? 'en') as LanguageCode;
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={t('Providers')}
        subtitle={t('Configure provider credentials and health. Routing priority is managed in the Routing workspace.')}
      />

      <div className="grid grid-cols-1 gap-4 min-[760px]:grid-cols-2">
        {props.providers.map((provider) => {
          const summary = props.summaries?.find((item) => item.id === provider.id);
          const enableLocked = !provider.enabled && summary?.can_enable === false;
          const endpoint = summary?.primary_endpoint ?? provider.homepage ?? t('No endpoint');
          const protocolTag = summary?.protocol_label
            ?? provider.ui?.protocol_label
            ?? summary?.protocol
            ?? provider.kind;
          const balanceLabel = props.balances?.[provider.id] ?? '—';
          const providerIconUrl = summary?.icon_url ?? provider.ui?.icon_url;
          const providerBadgeLabel = summary?.badge_label ?? provider.ui?.badge_label;

          return (
            <button
              key={provider.id}
              type="button"
              className="flex w-full flex-col gap-2.5 rounded-2xl border border-ds-border bg-ds-surface p-5 text-left shadow-ds backdrop-blur-ds transition-shadow hover:shadow-md"
              onClick={() => props.onConfigure(provider.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ResourceBadge kind="provider" value={provider.id} iconUrl={providerIconUrl} fallbackLabel={providerBadgeLabel ?? undefined} />
                  <span className="text-[14px] font-semibold text-ds-text-primary">
                    {formatProviderLabel(provider.name, language)}
                  </span>
                </div>
                <StatusBadge tone={provider.enabled ? 'green' : 'gray'}>
                  {provider.enabled ? t('Connected') : t('Standby')}
                </StatusBadge>
              </div>

              <div>
                <StatusBadge tone="blue">
                  {formatProviderProtocolLabel(protocolTag, language)}
                </StatusBadge>
              </div>

              <p className="line-clamp-2 text-[12px] leading-tight text-ds-text-secondary opacity-55">
                {endpoint}
              </p>

              <div className="flex items-center justify-between">
                <span
                  className="text-[12px] leading-tight text-ds-text-secondary"
                  style={{ opacity: 0.4 }}
                  onClick={(e) => { e.stopPropagation(); props.onRefreshBalance(provider.id); }}
                >
                  {balanceLabel}
                </span>
                <div className="flex items-center gap-1 text-ds-accent-blue">
                  <span className="text-[12px] font-medium">{t('Configure')}</span>
                  <ChevronRight size={12} />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
