import {
  ChevronsUpDown,
  ShoppingCart,
  Sliders,
  type LucideIcon,
} from 'lucide-react';
import {
  AppButton,
  ConfigRow,
  DataTable,
  SearchField,
  SelectTrigger,
  StatusBadge,
  ToggleSwitch,
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
import { cx } from '../../lib/cx';

const WORKSPACE_SECTIONS: Array<{
  id: ProviderSectionId;
  label: string;
  Icon: LucideIcon;
}> = [
  { id: 'config', label: 'Configuration', Icon: Sliders },
  { id: 'store', label: 'Store & Inventory', Icon: ShoppingCart },
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
  onToggleEnabled: (enabled: boolean) => void;
  onRefresh: () => void;
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
    <div className="flex flex-col">
      <div className="flex h-[46px] items-stretch gap-7 border-b border-white/[38%] bg-white/70 px-10">
        {WORKSPACE_SECTIONS.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={cx(
              'flex items-center gap-[7px] border-b-2 border-transparent font-text text-[14px] transition-colors duration-fast ease-[var(--ds-motion-transition-fast)]',
              section === id
                ? 'border-ds-accent-blue font-semibold text-ds-accent-blue'
                : 'font-normal text-[#1d1d1f]/40',
            )}
            onClick={() => props.onSelectSection(id)}
          >
            <Icon size={15} className={section === id ? 'opacity-100' : 'opacity-40'} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="px-10 pt-6 pb-6 max-[760px]:px-5">
        {section === 'config' && (
          <WorkspaceConfig
            manifest={manifest}
            summary={props.summary}
            isConnected={isConnected}
            balanceLabel={props.balanceLabel}
            busyAction={props.busyAction}
            apiKeyValue={props.apiKeyValue}
            showAdvancedEditor={props.showAdvancedEditor}
            onManifestFieldChange={props.onManifestFieldChange}
            onApiKeyChange={props.onApiKeyChange}
            onToggleEnabled={props.onToggleEnabled}
            onRefresh={props.onRefresh}
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
      </div>
    </div>
  );
}

function WorkspaceConfig(props: {
  manifest: ProviderManifest;
  summary?: ProviderSummary;
  isConnected: boolean;
  balanceLabel: string;
  busyAction: string;
  apiKeyValue: string;
  showAdvancedEditor: boolean;
  onManifestFieldChange: (
    section: 'root' | 'defaults' | 'handler_api' | 'five_sim' | 'mock',
    field: string,
    value: string | number | boolean,
  ) => void;
  onApiKeyChange: (value: string) => void;
  onToggleEnabled: (enabled: boolean) => void;
  onRefresh: () => void;
  onSave: () => void;
  onOpenRawJson: () => void;
  onOpenSelector: (kind: SelectorKind) => void;
}) {
  const { manifest } = props;
  const enableLocked = !props.isConnected && props.summary?.can_enable === false;
  const cacheState = props.summary?.option_cache_state ?? 'missing';
  const cacheLabel = cacheState === 'fresh'
    ? 'Fresh Cache'
    : cacheState === 'stale'
      ? 'Stale Cache'
      : 'No Cache';
  const toggleLabel = props.isConnected ? 'Enabled' : 'Disabled';

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-[3px]">
        <h1 className="m-0 text-[20px] font-semibold leading-none tracking-[-0.3px] text-ds-text-primary">
          {manifest.name}
        </h1>
        <p className="m-0 text-[13px] leading-none text-ds-text-secondary opacity-50">
          Manage API credentials and connection settings
        </p>
      </div>

      <div className="overflow-hidden rounded-[10px] border border-white/50 bg-ds-surface shadow-ds backdrop-blur-ds">
        <div className="flex items-center justify-between px-5 py-[14px]">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ds-text-secondary">
            {manifest.name}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-ds-text-primary">
              {toggleLabel}
            </span>
            <ToggleSwitch
              checked={props.isConnected}
              onChange={(enabled) => {
                if (enableLocked && enabled) return;
                props.onToggleEnabled(enabled);
              }}
              ariaLabel={`Toggle ${manifest.name}`}
            />
          </div>
        </div>
        <div className="px-5 pb-[14px]">
          <span className="text-page-title text-ds-text-primary">
            {props.balanceLabel}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-ds-border px-5 py-3">
          <StatusBadge tone={props.isConnected ? 'green' : 'gray'}>
            {props.isConnected ? 'Connected' : 'Disabled'}
          </StatusBadge>
          <StatusBadge tone={cacheState === 'fresh' ? 'green' : cacheState === 'stale' ? 'orange' : 'gray'}>
            {cacheLabel}
          </StatusBadge>
        </div>
      </div>

      <div className="overflow-hidden rounded-[10px] border border-white/50 bg-ds-surface">
        <ConfigRow label="API Key">
          <input
            className="min-h-control w-full rounded-sm border border-ds-border-strong bg-ds-surface px-4 py-[11px] text-utility tracking-[var(--ds-type-utility-tracking)] text-ds-text-primary"
            type="password"
            value={props.apiKeyValue}
            onChange={(e) => props.onApiKeyChange(e.target.value)}
            placeholder="Paste provider API key"
          />
        </ConfigRow>
        <div className="flex items-center justify-between px-5 py-3">
          <div>
            {props.showAdvancedEditor && (
              <AppButton variant="ghost" size="utility" className="min-h-0 px-0 py-0 text-ds-accent-blue" onClick={props.onOpenRawJson}>
                Raw JSON
              </AppButton>
            )}
          </div>
          <div className="flex items-center gap-2">
            <AppButton variant="ghost" size="utility" className="min-h-0 px-0 py-0 text-ds-accent-blue" onClick={props.onRefresh} disabled={props.busyAction.includes('refresh') || props.busyAction.includes('save')}>
              {props.busyAction.includes('refresh') ? 'Refreshing…' : 'Refresh'}
            </AppButton>
            <AppButton variant="primary" size="utility" onClick={props.onSave} disabled={props.busyAction.includes('save')}>
              {props.busyAction.includes('save') ? 'Saving…' : 'Save'}
            </AppButton>
          </div>
        </div>
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
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-[3px]">
          <h2 className="m-0 text-[20px] font-semibold leading-none tracking-[-0.3px] text-ds-text-primary">
            Price Inventory
          </h2>
          <p className="m-0 text-[13px] leading-none text-ds-text-secondary opacity-50">
            Stock by service, country and operator
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
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
        </div>
      </div>

      <SearchField
        value={props.storeQuery.search}
        onChange={(event) => props.onStoreQueryChange({ search: event.target.value })}
        placeholder="Filter by country or operator..."
        className="w-full"
      />

      <div className="overflow-hidden rounded-xl border border-white/50 bg-ds-surface">
        <DataTable
          headerClassName="grid grid-cols-1 items-center gap-4 border-b border-solid border-black/[0.08] border-x-0 border-t-0 bg-[#e8ecf0cc] px-4 py-[10px] text-[12px] font-medium text-ds-text-primary/60 min-[760px]:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_120px_96px]"
          header={(
            <>
              <button className="inline-flex items-center justify-start gap-1.5 bg-transparent p-0 text-left text-inherit" onClick={() => props.onSortPrices('country')}>
                <span>Country</span>
                <ChevronsUpDown size={12} />
              </button>
              <span>Operator</span>
              <button className="inline-flex items-center justify-start gap-1.5 bg-transparent p-0 text-left text-inherit min-[760px]:justify-self-end" onClick={() => props.onSortPrices('price')}>
                <span>Price</span>
                <ChevronsUpDown size={12} />
              </button>
              <button className="inline-flex items-center justify-start gap-1.5 bg-transparent p-0 text-left text-inherit min-[760px]:justify-self-end" onClick={() => props.onSortPrices('stock')}>
                <span>Stock</span>
                <ChevronsUpDown size={12} />
              </button>
            </>
          )}
        >
        {props.prices.length > 0 ? props.prices.slice(0, 20).map((item) => (
            <div className="grid grid-cols-1 items-center gap-4 border-b border-solid border-black/[0.04] border-x-0 border-t-0 px-4 py-3 last:border-b-0 min-[760px]:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_120px_96px]" key={`${item.country}-${item.display_name}`}>
              <span className="inline-flex min-w-0 items-center gap-2.5">
                <span className="shrink-0">{countryBadge(item.country)}</span>
                <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{item.display_name}</span>
              </span>
              <span className="text-[13px] text-ds-text-secondary">{item.operator || 'any'}</span>
              <span className="text-left font-medium tabular-nums min-[760px]:text-right">${item.price.toFixed(3)}</span>
              <span className="text-left tabular-nums min-[760px]:text-right">{item.stock.toLocaleString()}</span>
            </div>
          )) : (
            <div className="px-5 py-7 text-center text-utility tracking-[var(--ds-type-utility-tracking)] text-ds-text-secondary">
              Click Load Prices to fetch inventory.
            </div>
          )}
        </DataTable>
      </div>
    </div>
  );
}
