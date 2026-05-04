import { useRef } from 'react';
import { GripVertical } from 'lucide-react';
import { AppButton, DataTable } from '../ui-bridge';
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
      <p className="m-0 max-w-[640px] font-text text-utility font-normal tracking-[var(--ds-type-utility-tracking)] text-ds-text-secondary">
        Manage your SMS gateway connections and routing rules.
      </p>

      <div className="overflow-hidden rounded-sm border border-solid border-ds-border-strong bg-ds-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <DataTable
          headerClassName="grid grid-cols-1 items-center gap-4 border-b border-solid border-ds-border-strong border-x-0 border-t-0 bg-ds-content px-4 py-2.5 text-[12px] font-medium uppercase tracking-[0.08em] text-[#8c8c92] min-[760px]:grid-cols-[300px_166px]"
          header={(
            <>
              <span>Priority / Provider</span>
              <span className="text-left min-[760px]:text-right">Status / Actions</span>
            </>
          )}
        >
          {props.providers.map((provider, index) => (
            <div
              key={provider.id}
              className="grid grid-cols-1 items-center gap-4 border-b border-solid border-ds-border border-x-0 border-t-0 px-4 py-3 last:border-b-0 min-[760px]:grid-cols-[300px_166px]"
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(event) => handleDragOver(event, index)}
              onDrop={handleDrop}
            >
              <div className="inline-flex min-w-0 items-center gap-3">
                <div className="inline-flex w-12 items-center gap-2">
                  <GripVertical size={14} className="shrink-0 opacity-30" />
                  <span className="inline-flex w-6 text-[12px] font-semibold opacity-40">
                    {index + 1}
                  </span>
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-[13px] font-semibold tracking-[0] text-ds-text-primary">
                    {provider.name}
                  </span>
                  <span className="text-[13px] leading-[1.43] tracking-[0] text-ds-text-secondary">
                    {provider.kind} · {formatServiceLabel(provider.defaults.service)}
                  </span>
                </div>
              </div>
              <div className="inline-flex flex-wrap items-center justify-start gap-3 min-[760px]:justify-end">
                <span className={provider.enabled ? 'text-[12px] text-[#27c93f]' : 'text-[12px] text-[#ff9500]'}>
                  ● {provider.enabled ? 'Connected' : 'Standby'}
                </span>
                <AppButton variant="ghost" size="utility" onClick={() => props.onConfigure(provider.id)}>Configure</AppButton>
              </div>
            </div>
          ))}
        </DataTable>
      </div>
    </div>
  );
}
