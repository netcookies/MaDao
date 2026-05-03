import { useRef } from 'react';
import { GripVertical } from 'lucide-react';
import { AppButton, DataTable, PageHeader, StatusBadge } from '../ui-bridge';
import type { ProviderManifest } from '../types';
import { formatServiceLabel } from '../../lib/formatters';

export type ProvidersListScreenProps = {
  providers: ProviderManifest[];
  onConfigure: (id: string) => void;
  onReorder: (ids: string[]) => void;
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
    <div className="flex flex-col gap-5">
      <PageHeader
        title="SMS Providers"
        subtitle="Manage your SMS gateway connections and routing rules."
      />

      <div className="overflow-hidden rounded-lg border border-ds-border bg-ds-surface">
        <DataTable
          headerClassName="grid grid-cols-1 items-center gap-4 px-5 py-4 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8c8c92] min-[760px]:grid-cols-[120px_minmax(0,1fr)_220px]"
          header={(
            <>
              <span>Priority</span>
              <span>Provider</span>
              <span className="text-left min-[760px]:text-right">Status / Actions</span>
            </>
          )}
        >
          {props.providers.map((provider, index) => (
            <div
              key={provider.id}
              className="grid grid-cols-1 items-center gap-4 border-t border-ds-border px-5 py-5 min-[760px]:grid-cols-[120px_minmax(0,1fr)_220px]"
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(event) => handleDragOver(event, index)}
              onDrop={handleDrop}
            >
              <div className="inline-flex items-center gap-2.5">
                <GripVertical size={14} className="shrink-0 opacity-30" />
                <span className="inline-flex h-9 min-w-9 items-center justify-center text-[14px] font-semibold">
                  {index + 1}
                </span>
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-section-title font-semibold tracking-[var(--ds-type-section-title-tracking)] text-ds-text-primary">
                  {provider.name}
                </span>
                <span className="text-[13px] leading-[1.43] tracking-[-0.224px] text-ds-text-secondary">
                  {provider.kind} · {formatServiceLabel(provider.defaults.service)}
                </span>
              </div>
              <div className="inline-flex flex-wrap items-center justify-start gap-3 min-[760px]:justify-end">
                <StatusBadge tone={provider.enabled ? 'green' : 'orange'}>
                  {provider.enabled ? 'Connected' : 'Standby'}
                </StatusBadge>
                <AppButton variant="ghost" size="utility" onClick={() => props.onConfigure(provider.id)}>Configure</AppButton>
              </div>
            </div>
          ))}
        </DataTable>
      </div>
    </div>
  );
}
