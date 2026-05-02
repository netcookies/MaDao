import { useRef } from 'react';
import { GripVertical } from 'lucide-react';
import { AppButton, DataTable, PageHeader, StatusBadge } from '../ui-bridge';
import type { ProviderManifest } from '../types';
import { formatServiceLabel } from '../../lib/formatters';
import styles from './ProvidersListScreen.module.css';

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
    <div className="d-page">
      <PageHeader
        title="SMS Providers"
        subtitle="Manage your SMS gateway connections and routing rules."
      />

      <div className="d-card d-card-flush">
        <DataTable
          headerClassName={`${styles.tableGrid} ${styles.tableLabels}`}
          header={(
            <>
              <span>Priority</span>
              <span>Provider</span>
              <span className={styles.actionsHead}>Status / Actions</span>
            </>
          )}
        >
          {props.providers.map((provider, index) => (
            <div
              key={provider.id}
              className={`${styles.tableGrid} ${styles.tableRow}`}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(event) => handleDragOver(event, index)}
              onDrop={handleDrop}
            >
              <div className={styles.priorityCell}>
                <GripVertical size={14} className={styles.grip} />
                <span className={styles.priorityNum}>{index + 1}</span>
              </div>
              <div className={styles.nameCell}>
                <span className={styles.name}>{provider.name}</span>
                <span className={styles.subcopy}>
                  {provider.kind} · {formatServiceLabel(provider.defaults.service)}
                </span>
              </div>
              <div className={styles.actionsCell}>
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
