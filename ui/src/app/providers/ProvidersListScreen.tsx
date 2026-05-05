import { useRef } from 'react';
import { GripVertical } from 'lucide-react';
import { AppButton, DataTable, ToggleSwitch } from '../ui-bridge';
import type { ProviderManifest, ProviderSummary } from '../types';
import { formatServiceLabel } from '../../lib/formatters';

export type ProvidersListScreenProps = {
  providers: ProviderManifest[];
  summaries?: ProviderSummary[];
  onConfigure: (id: string) => void;
  onReorder: (ids: string[]) => void;
  onToggleEnabled: (id: string, enabled: boolean) => void;
};

export function ProvidersListScreen(props: ProvidersListScreenProps) {
  const dragIndex = useRef<number | null>(null);

  function handleDragStart(index: number) {
    dragIndex.current = index;
  }

  function handleDragOver(event: React.DragEvent, index: number) {
    event.preventDefault();
    if (dragIndex.current === null || dragIndex.current === index) return;
    const next = [...props.providers];
    const [moved] = next.splice(dragIndex.current, 1);
    next.splice(index, 0, moved);
    dragIndex.current = index;
    props.onReorder(next.map((provider) => provider.id));
  }

  function handleDrop() {
    dragIndex.current = null;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 max-w-[640px] font-text text-utility font-normal tracking-[var(--ds-type-utility-tracking)] text-ds-text-secondary">
        Manage your SMS gateway connections and routing rules.
      </p>

      <div className="flex items-center justify-between gap-3 rounded-sm border border-solid border-ds-border bg-ds-content px-3 py-2">
        <span className="font-text text-[11px] font-medium tracking-[0] text-ds-text-secondary">
          Routing order follows the list from top to bottom.
        </span>
        <span className="rounded-pill bg-ds-surface px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-ds-text-primary/80">
          Drag to sort
        </span>
      </div>

      <div className="overflow-hidden rounded-sm border border-solid border-ds-border-strong bg-ds-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <DataTable
          headerClassName="grid grid-cols-1 items-center gap-[10px] border-b border-solid border-ds-border-strong border-x-0 border-t-0 bg-ds-content px-[14px] py-[10px] text-[10px] font-medium uppercase tracking-[0.08em] text-[#8c8c92] min-[760px]:grid-cols-[52px_206px_148px_64px_86px]"
          header={(
            <>
              <span>Priority</span>
              <span>Provider</span>
              <span>Status</span>
              <span className="min-[760px]:text-center">Enabled</span>
              <span className="min-[760px]:text-right">Action</span>
            </>
          )}
        >
          {props.providers.map((provider, index) => (
            (() => {
              const summary = props.summaries?.find((item) => item.id === provider.id);
              const enableLocked = !provider.enabled && summary?.can_enable === false;
              const cacheState = summary?.option_cache_state ?? 'missing';
              return (
            <div
              key={provider.id}
              className="grid grid-cols-1 items-center gap-[10px] border-b border-solid border-ds-border border-x-0 border-t-0 px-[14px] py-3 last:border-b-0 min-[760px]:grid-cols-[52px_206px_148px_64px_86px]"
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(event) => handleDragOver(event, index)}
              onDrop={handleDrop}
            >
              <div className="inline-flex items-center gap-2">
                <GripVertical size={14} className="shrink-0 opacity-30" />
                <span className="inline-flex w-4 text-[12px] font-semibold opacity-40">
                  {index + 1}
                </span>
              </div>

              <div className="flex min-w-0 flex-col gap-1">
                <span className="truncate text-[13px] font-semibold tracking-[0] text-ds-text-primary">
                  {provider.name}
                </span>
                <span className="truncate text-[11px] leading-[1.4] tracking-[0] text-ds-text-secondary">
                  {provider.kind} · {formatServiceLabel(provider.defaults.service)}
                </span>
              </div>

              <div className="flex min-w-0 flex-col gap-1">
                <div className="inline-flex w-fit items-center gap-1.5 rounded-pill bg-ds-surface-subtle px-2 py-1">
                  <span className={provider.enabled ? 'inline-flex h-1.5 w-1.5 rounded-full bg-[#27c93f]' : 'inline-flex h-1.5 w-1.5 rounded-full bg-[#ff9500]'} />
                  <span className="text-[10px] font-semibold tracking-[0] text-ds-text-primary">
                    {provider.enabled ? 'Connected' : 'Standby'}
                  </span>
                </div>
                <span className="truncate text-[9px] text-ds-text-secondary">
                  {provider.enabled
                    ? 'Cache ready'
                    : cacheState === 'fresh'
                      ? 'Cache ready'
                      : cacheState === 'stale'
                        ? 'Cache stale'
                        : 'No cache'}
                </span>
              </div>

              <div className="flex justify-start min-[760px]:justify-center">
                <ToggleSwitch
                  checked={provider.enabled}
                  onChange={(enabled) => {
                    if (enableLocked && enabled) return;
                    props.onToggleEnabled(provider.id, enabled);
                  }}
                  ariaLabel={`Toggle ${provider.name}`}
                />
              </div>

              <div className="flex justify-start min-[760px]:justify-end">
                <AppButton variant="outline" size="utility" onClick={() => props.onConfigure(provider.id)}>Configure</AppButton>
              </div>
            </div>
          )})()
          ))}
        </DataTable>
      </div>
    </div>
  );
}
