import { AppButton, DataTable, PageHeader, SearchField, SegmentedControl } from '../ui-bridge';
import styles from './LogsScreen.module.css';

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
    <div className="d-page">
      <PageHeader
        title="System Logs"
        subtitle="Real-time event stream for debugging and monitoring."
        align="center"
        actions={(
          <div className="d-inline-actions">
            <AppButton variant="outline" size="utility" onClick={props.onRefresh}>Refresh</AppButton>
            <AppButton variant="outline" size="utility" onClick={() => props.onSearch('')}>Clear Search</AppButton>
          </div>
        )}
      />

      <div className={`d-detail-row ${styles.filterRow}`}>
        <SegmentedControl items={props.filters} value={props.filter} onChange={props.setFilter} appearance="rail" />
        <SearchField
          className={styles.search}
          value={props.search}
          onChange={(event) => props.onSearch(event.target.value)}
          placeholder="Search logs..."
        />
      </div>

      <div className="d-card d-card-flush">
        <DataTable
          headerClassName={`${styles.tableGrid} ${styles.tableHead}`}
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
            <div className={`${styles.tableGrid} ${styles.tableRow}`} key={`${entry.timestamp}-${index}`}>
              <span><span className={`d-log-badge ${entry.level.toLowerCase()}`}>{entry.level.toUpperCase()}</span></span>
              <span className={styles.time}>{new Date(entry.timestamp).toLocaleTimeString()}</span>
              <span>{entry.scope}</span>
              <span>{entry.message}</span>
            </div>
          )) : <div className="d-empty">No log events.</div>}
        </DataTable>
      </div>
    </div>
  );
}
