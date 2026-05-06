import type { ReactNode } from 'react';
import { Link2, Server } from 'lucide-react';
import { AppButton, StatusBadge, ToggleSwitch } from '../ui-bridge';
import type { ProviderManifest, ProviderSummary } from '../types';
import { formatProviderLabel } from '../../lib/formatters';

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
  return (
    <div className="flex flex-col gap-6">
      <p className="m-0 max-w-[720px] font-text text-utility font-normal tracking-[var(--ds-type-utility-tracking)] text-ds-text-secondary">
        Configure provider credentials and health from a card matrix. Routing priority is moving to the dedicated Routing workspace, so this screen now focuses on provider setup and connectivity.
      </p>

      <div className="grid grid-cols-1 gap-3 min-[760px]:grid-cols-2 min-[1180px]:grid-cols-3">
        {props.providers.map((provider) => {
          const summary = props.summaries?.find((item) => item.id === provider.id);
          const enableLocked = !provider.enabled && summary?.can_enable === false;
          const cacheState = summary?.option_cache_state ?? 'missing';
          const endpoint = summary?.primary_endpoint ?? provider.homepage ?? 'No endpoint';
          const protocolTag = summary?.protocol ?? provider.kind;
          const balanceLabel = props.balances?.[provider.id] ?? '—';

          return (
            <div
              key={provider.id}
              className="group relative flex min-h-[224px] cursor-pointer flex-col justify-between overflow-hidden rounded-[20px] border border-ds-border bg-[linear-gradient(180deg,var(--ds-color-surface-default)_0%,var(--ds-color-surface-subtle)_100%)] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.05)] transition-transform duration-fast ease-[var(--ds-motion-transition-fast)] hover:-translate-y-[1px]"
              onClick={() => props.onConfigure(provider.id)}
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,var(--ds-color-accent-blue)_0%,var(--ds-color-accent-blue-focus)_100%)] opacity-70" />
              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] bg-ds-accent-blue-soft text-ds-text-primary shadow-[inset_0_0_0_1px_var(--ds-color-accent-blue-soft)]">
                      <Server size={18} className="opacity-70" />
                    </div>
                    <div className="min-w-0">
                      <strong className="block truncate text-[17px] font-semibold tracking-[-0.02em] text-ds-text-primary">
                        {formatProviderLabel(provider.name)}
                      </strong>
                      <span className="mt-1 block truncate text-[12px] uppercase tracking-[0.08em] text-ds-text-secondary">
                        {protocolTag}
                      </span>
                    </div>
                  </div>
                  <ToggleSwitch
                    checked={provider.enabled}
                    onChange={(enabled) => {
                      if (enableLocked && enabled) return;
                      props.onToggleEnabled(provider.id, enabled);
                    }}
                    ariaLabel={`Toggle ${provider.name}`}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={provider.enabled ? 'green' : 'gray'}>
                    {provider.enabled ? 'Connected' : 'Standby'}
                  </StatusBadge>
                  <StatusBadge tone={cacheState === 'fresh' ? 'green' : cacheState === 'stale' ? 'orange' : 'gray'}>
                    {cacheState === 'fresh' ? 'Cache ready' : cacheState === 'stale' ? 'Cache stale' : 'No cache'}
                  </StatusBadge>
                </div>

                <div className="grid grid-cols-1 gap-2 rounded-[16px] bg-ds-surface p-3 shadow-[inset_0_0_0_1px_var(--ds-color-border-default)] backdrop-blur">
                  <InfoRow icon={<Link2 size={14} className="opacity-55" />} label="Endpoint" value={endpoint} mono />
                </div>
              </div>

              <div className="mt-4 flex items-end justify-between gap-3 border-t border-ds-border pt-3">
                <button
                  type="button"
                  className="flex flex-col gap-1 text-left"
                  onClick={(event) => {
                    event.stopPropagation();
                    props.onRefreshBalance(provider.id);
                  }}
                >
                  <span className="text-[11px] uppercase tracking-[0.08em] text-ds-text-secondary">
                    Balance
                  </span>
                  <span className="text-[16px] font-semibold tracking-[-0.02em] text-ds-text-primary">
                    {balanceLabel}
                  </span>
                </button>
                <AppButton variant="outline" size="utility" onClick={(event) => {
                  event.stopPropagation();
                  props.onConfigure(provider.id);
                }}>
                  Configure
                </AppButton>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InfoRow(props: {
  icon: ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-[1px] shrink-0 text-ds-text-secondary">{props.icon}</div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-[0.08em] text-ds-text-secondary">{props.label}</div>
        <div className={props.mono ? 'truncate font-mono text-[12px] text-ds-text-primary' : 'truncate text-[12px] text-ds-text-primary'}>
          {props.value}
        </div>
      </div>
    </div>
  );
}
