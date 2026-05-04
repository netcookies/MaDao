import { RefreshCw, Trash2 } from 'lucide-react';
import { AppButton, DataTable, SearchField, SegmentedControl } from '../ui-bridge';
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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="m-0 max-w-[640px] font-text text-utility font-normal tracking-[var(--ds-type-utility-tracking)] text-ds-text-secondary">
          Real-time event stream for debugging and monitoring.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <AppButton variant="outline" size="utility" onClick={props.onRefresh}>
            <RefreshCw size={14} />
            Refresh
          </AppButton>
          <AppButton variant="danger-outline" size="utility" onClick={() => props.onSearch('')}>
            <Trash2 size={14} />
            Clear Logs
          </AppButton>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <SegmentedControl items={props.filters} value={props.filter} onChange={props.setFilter} appearance="rail" className="min-h-0" />
        <SearchField
          compact
          className="w-full min-[760px]:w-[200px]"
          value={props.search}
          onChange={(event) => props.onSearch(event.target.value)}
          placeholder="Search logs..."
        />
      </div>

      <div className="overflow-hidden rounded-[12px] border border-solid border-ds-border-strong bg-ds-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <DataTable
          headerClassName="grid grid-cols-1 items-center gap-3 border-b border-solid border-ds-border-strong border-x-0 border-t-0 bg-ds-content px-4 py-2.5 text-[12px] font-medium uppercase tracking-[0.08em] text-[#8c8c92] min-[760px]:grid-cols-[58px_96px_72px_minmax(0,1fr)]"
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
            <div
              className={cx(
                'grid grid-cols-1 items-center gap-3 border-b border-solid border-ds-border border-x-0 border-t-0 px-4 py-2.5 last:border-b-0 min-[760px]:grid-cols-[58px_96px_72px_minmax(0,1fr)]',
                entry.level.toLowerCase() === 'error' && 'bg-[#fff5f5]',
                entry.level.toLowerCase() === 'warn' && 'bg-[#fffbf0]',
                entry.level.toLowerCase() !== 'error' && entry.level.toLowerCase() !== 'warn' && 'bg-white',
              )}
              key={`${entry.timestamp}-${index}`}
            >
              <span>
                <span
                  className={cx(
                    'inline-flex min-w-[58px] items-center justify-center rounded-[4px] px-2 py-1 text-[11px] font-normal uppercase tracking-[0] text-white',
                    entry.level.toLowerCase() === 'error' && 'bg-[#e0443e]',
                    entry.level.toLowerCase() === 'warn' && 'bg-[#f59e0b]',
                    entry.level.toLowerCase() !== 'error' && entry.level.toLowerCase() !== 'warn' && 'bg-ds-accent-blue',
                  )}
                >
                  {entry.level.toUpperCase()}
                </span>
              </span>
              <span className="text-[12px] text-ds-text-secondary">{new Date(entry.timestamp).toLocaleTimeString()}</span>
              <span className="text-[12px] text-ds-text-secondary">{entry.scope}</span>
              <span className={cx(
                'text-[13px]',
                entry.level.toLowerCase() === 'error' && 'text-[#c0312e]',
                entry.level.toLowerCase() === 'warn' && 'text-[#92600a]',
                entry.level.toLowerCase() !== 'error' && entry.level.toLowerCase() !== 'warn' && 'text-ds-text-primary/85',
              )}
              >
                {entry.message}
              </span>
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
