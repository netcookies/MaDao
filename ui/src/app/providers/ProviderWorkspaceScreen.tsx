import {
  ChevronsUpDown,
  MessageSquare,
  ShoppingCart,
  Sliders,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import {
  AppButton,
  ConfigRow,
  DataTable,
  DetailRow,
  SearchField,
  SectionHeader,
  SelectTrigger,
  StatusBadge,
} from '../ui-bridge';
import type {
  PriceSortKey,
  ProviderManifest,
  ProviderPriceItem,
  ProviderSectionId,
  ProviderSummary,
  SelectorKind,
  StoreQueryState,
} from '../types';
import {
  countryBadge,
  formatCountryLabel,
  formatServiceLabel,
} from '../../lib/formatters';
import styles from './ProviderWorkspaceScreen.module.css';

const WORKSPACE_SECTIONS: Array<{
  id: ProviderSectionId;
  label: string;
  Icon: LucideIcon;
}> = [
  { id: 'config', label: 'Configuration', Icon: Sliders },
  { id: 'store', label: 'Store & Inventory', Icon: ShoppingCart },
  { id: 'wallet', label: 'Wallet Balance', Icon: Wallet },
];

export type ProviderWorkspaceScreenProps = {
  manifest: ProviderManifest;
  summary?: ProviderSummary;
  section: ProviderSectionId;
  prices: ProviderPriceItem[];
  balanceLabel: string;
  busyAction: string;
  rawEditor: string;
  showAdvancedEditor: boolean;
  apiKeyValue: string;
  onSelectSection: (section: ProviderSectionId) => void;
  onManifestFieldChange: (
    section: 'root' | 'defaults' | 'handler_api' | 'five_sim' | 'mock',
    field: string,
    value: string | number | boolean,
  ) => void;
  onApiKeyChange: (value: string) => void;
  onFetchBalance: () => void;
  onFetchPrices: () => void;
  onSave: () => void;
  onOpenRawJson: () => void;
  onOpenSelector: (kind: SelectorKind) => void;
  storeQuery: StoreQueryState;
  onStoreQueryChange: (patch: Partial<StoreQueryState>) => void;
  onSortPrices: (key: PriceSortKey) => void;
  priceSort: { key: PriceSortKey; dir: 'asc' | 'desc' };
};

export function ProviderWorkspaceScreen(props: ProviderWorkspaceScreenProps) {
  const { manifest, section } = props;
  const isConnected = manifest.enabled;

  return (
    <div className={styles.workspace}>
      <div className={styles.tabsBar}>
        <div className={styles.tabsTitle}>{manifest.name.toUpperCase()} WORKSPACE</div>
        <div className={styles.tabsList}>
          {WORKSPACE_SECTIONS.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`${styles.tab}${section === id ? ` ${styles.tabActive}` : ''}`}
              onClick={() => props.onSelectSection(id)}
            >
              <Icon size={16} style={{ opacity: section === id ? 1 : 0.6 }} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.detail}>
        {section === 'config' && (
          <WorkspaceConfig
            manifest={manifest}
            isConnected={isConnected}
            busyAction={props.busyAction}
            apiKeyValue={props.apiKeyValue}
            showAdvancedEditor={props.showAdvancedEditor}
            onManifestFieldChange={props.onManifestFieldChange}
            onApiKeyChange={props.onApiKeyChange}
            onSave={props.onSave}
            onOpenRawJson={props.onOpenRawJson}
            onOpenSelector={props.onOpenSelector}
          />
        )}
        {section === 'store' && (
          <WorkspaceStore
            manifest={manifest}
            prices={props.prices}
            busyAction={props.busyAction}
            onFetchPrices={props.onFetchPrices}
            onOpenSelector={props.onOpenSelector}
            storeQuery={props.storeQuery}
            onStoreQueryChange={props.onStoreQueryChange}
            onSortPrices={props.onSortPrices}
            priceSort={props.priceSort}
          />
        )}
        {section === 'wallet' && (
          <WorkspaceWallet
            manifest={manifest}
            balanceLabel={props.balanceLabel}
            summary={props.summary}
            busyAction={props.busyAction}
            onFetchBalance={props.onFetchBalance}
          />
        )}
      </div>
    </div>
  );
}

function WorkspaceConfig(props: {
  manifest: ProviderManifest;
  isConnected: boolean;
  busyAction: string;
  apiKeyValue: string;
  showAdvancedEditor: boolean;
  onManifestFieldChange: (
    section: 'root' | 'defaults' | 'handler_api' | 'five_sim' | 'mock',
    field: string,
    value: string | number | boolean,
  ) => void;
  onApiKeyChange: (value: string) => void;
  onSave: () => void;
  onOpenRawJson: () => void;
  onOpenSelector: (kind: SelectorKind) => void;
}) {
  const { manifest } = props;

  return (
      <div className={styles.body}>
        <SectionHeader
        eyebrow="Provider Workspace"
        title={manifest.name}
        description={manifest.description ?? `${manifest.kind} provider`}
        icon={<MessageSquare size={28} color="#0066cc" />}
        badge={<StatusBadge tone={props.isConnected ? 'green' : 'gray'}>{props.isConnected ? 'Connected' : 'Disabled'}</StatusBadge>}
        actions={(
          <>
            {props.showAdvancedEditor && (
              <AppButton variant="outline" size="utility" onClick={props.onOpenRawJson}>Raw JSON</AppButton>
            )}
            <AppButton variant="primary" size="utility" onClick={props.onSave} disabled={props.busyAction.includes('save')}>
              {props.busyAction.includes('save') ? 'Saving…' : 'Save'}
            </AppButton>
          </>
        )}
      />

      <div className={styles.formCard}>
        <ConfigRow label="Provider Name">
          <input className={styles.input} value={manifest.name} onChange={(event) => props.onManifestFieldChange('root', 'name', event.target.value)} />
        </ConfigRow>
        <ConfigRow label="API Key" last>
          <input className={styles.input} type="password" value={props.apiKeyValue} onChange={(event) => props.onApiKeyChange(event.target.value)} placeholder="Paste provider API key" />
        </ConfigRow>
      </div>
    </div>
  );
}

function WorkspaceStore(props: {
  manifest: ProviderManifest;
  prices: ProviderPriceItem[];
  busyAction: string;
  onFetchPrices: () => void;
  onOpenSelector: (kind: SelectorKind) => void;
  storeQuery: StoreQueryState;
  onStoreQueryChange: (patch: Partial<StoreQueryState>) => void;
  onSortPrices: (key: PriceSortKey) => void;
  priceSort: { key: PriceSortKey; dir: 'asc' | 'desc' };
}) {
  return (
    <div className={styles.body}>
      <SectionHeader
        eyebrow="Store"
        title="Price Inventory"
        description="Stock by service, country and operator"
        actions={(
          <div className={`d-inline-actions ${styles.inlineActionsWrap}`}>
            <SelectTrigger
              value={formatServiceLabel(props.storeQuery.service || props.manifest.defaults.service)}
              onClick={() => props.onOpenSelector('store-service')}
            />
            <SelectTrigger
              value={props.storeQuery.country ? formatCountryLabel(props.storeQuery.country) : ''}
              placeholder="All countries"
              muted={!props.storeQuery.country}
              onClick={() => props.onOpenSelector('store-country')}
            />
            <SelectTrigger
              value={props.storeQuery.operator}
              placeholder="All operators"
              muted={!props.storeQuery.operator}
              onClick={() => props.onOpenSelector('store-operator')}
            />
            <AppButton variant="primary" size="utility" onClick={props.onFetchPrices} disabled={props.busyAction.includes('prices')}>
              Load Prices
            </AppButton>
          </div>
        )}
      />

      <SearchField
        value={props.storeQuery.search}
        onChange={(event) => props.onStoreQueryChange({ search: event.target.value })}
        placeholder="Filter by country or operator..."
      />

      <div className="d-card d-card-flush">
        <DataTable
          headerClassName={`${styles.storeGrid} ${styles.storeHead}`}
          header={(
            <>
              <button className={styles.sortable} onClick={() => props.onSortPrices('country')}>
                <span>Country</span>
                <ChevronsUpDown size={12} />
              </button>
              <span>Operator</span>
              <button className={`${styles.sortable} ${styles.sortableRight}`} onClick={() => props.onSortPrices('price')}>
                <span>Price</span>
                <ChevronsUpDown size={12} />
              </button>
              <button className={`${styles.sortable} ${styles.sortableRight}`} onClick={() => props.onSortPrices('stock')}>
                <span>Stock</span>
                <ChevronsUpDown size={12} />
              </button>
            </>
          )}
        >
          {props.prices.length > 0 ? props.prices.slice(0, 20).map((item) => (
            <div className={`${styles.storeGrid} ${styles.storeTableRow}`} key={`${item.country}-${item.display_name}`}>
              <span className={styles.storeCountryCell}>
                <span className={styles.storeCountryFlag}>{countryBadge(item.country)}</span>
                <span className={styles.storeCountryCopy}>{item.display_name}</span>
              </span>
              <span className={styles.storeOperatorCell}>{item.operator || 'any'}</span>
              <span className={styles.storePriceCell}>${item.price.toFixed(3)}</span>
              <span className={styles.storeStockCell}>{item.stock.toLocaleString()}</span>
            </div>
          )) : (
            <div className="d-empty">Click Load Prices to fetch inventory.</div>
          )}
        </DataTable>
      </div>
    </div>
  );
}

function WorkspaceWallet(props: {
  manifest: ProviderManifest;
  balanceLabel: string;
  summary?: ProviderSummary;
  busyAction: string;
  onFetchBalance: () => void;
}) {
  return (
    <div className={styles.body}>
      <div className={styles.balanceCard}>
        <span className={styles.balanceKicker}>Current Balance</span>
        <strong className={styles.balanceValue}>
          {props.balanceLabel === '—' ? '—' : props.balanceLabel}
        </strong>
        <div className={styles.balanceActions}>
          <AppButton variant="primary" onClick={props.onFetchBalance} disabled={props.busyAction.includes('balance')}>
            Top Up / Refresh
          </AppButton>
        </div>
      </div>

      <div className="d-card d-card-flush">
        <div className="d-pd-header">Provider Details</div>
        <DetailRow label="Protocol" value={props.summary?.protocol ?? props.manifest.kind} />
        <DetailRow label="Default Service" value={formatServiceLabel(props.manifest.defaults.service)} />
        <DetailRow label="Default Country" value={formatCountryLabel(props.manifest.defaults.country)} />
        <DetailRow label="Status" value={props.manifest.enabled ? 'Enabled' : 'Disabled'} last />
      </div>
    </div>
  );
}
