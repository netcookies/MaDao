import { AppButton, DataTable, PageHeader, SearchField, SegmentedControl } from '../ui-bridge';
import { cx } from '../../lib/cx';

export type LogFilter = 'all' | 'info' | 'warn' | 'error';

export type LogEntry = {
  timestamp: string;
  scope: string;
  level: string;
  message: string;
};

export type LogsScreenProps = {
  logs: LogEntry[];
  filter: LogFilter;
  setFilter: (value: LogFilter) => void;
  filters: Array<{ id: LogFilter; label: string }>;
  onRefresh: () => void;
  search: string;
  onSearch: (value: string) => void;
};

export function LogsScreen(props: LogsScreenProps) {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="System Logs"
        subtitle="Real-time event stream for debugging and monitoring."
        align="center"
        actions={(
          <div className="flex flex-wrap items-center gap-3">
            <AppButton variant="outline" size="utility" onClick={props.onRefresh}>Refresh</AppButton>
            <AppButton variant="outline" size="utility" onClick={() => props.onSearch('')}>Clear Search</AppButton>
          </div>
        )}
      />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <SegmentedControl items={props.filters} value={props.filter} onChange={props.setFilter} appearance="rail" />
        <SearchField
          className="w-full min-[760px]:w-[240px]"
          value={props.search}
          onChange={(event) => props.onSearch(event.target.value)}
          placeholder="Search logs..."
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-ds-border bg-ds-surface">
        <DataTable
          headerClassName="grid grid-cols-1 items-center gap-4 border-b border-ds-border px-5 py-[14px] text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8c8c92] min-[760px]:grid-cols-[120px_160px_120px_minmax(0,1fr)]"
          header={(
            <>
              <span>Level</span>
              <span>Time</span>
              <span>Scope</span>
              <span>Message</span>
            </>
          )}
        >
          {props.logs.length > 0 ? props.logs.map((entry, index) => (
            <div className="grid grid-cols-1 items-center gap-4 border-t border-ds-border px-5 py-4 min-[760px]:grid-cols-[120px_160px_120px_minmax(0,1fr)]" key={`${entry.timestamp}-${index}`}>
              <span>
                <span
                  className={cx(
                    'inline-flex rounded-xs px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white',
                    entry.level.toLowerCase() === 'error' && 'bg-ds-state-danger',
                    entry.level.toLowerCase() === 'warn' && 'bg-ds-state-warning',
                    entry.level.toLowerCase() !== 'error' && entry.level.toLowerCase() !== 'warn' && 'bg-ds-accent-blue',
                  )}
                >
                  {entry.level.toUpperCase()}
                </span>
              </span>
              <span className="text-ds-text-secondary">{new Date(entry.timestamp).toLocaleTimeString()}</span>
              <span>{entry.scope}</span>
              <span>{entry.message}</span>
            </div>
          )) : (
            <div className="px-5 py-7 text-center text-utility tracking-[var(--ds-type-utility-tracking)] text-ds-text-secondary">
              No log events.
            </div>
          )}
        </DataTable>
      </div>
    </div>
  );
}
