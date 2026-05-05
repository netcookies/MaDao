import {
  ChevronsUpDown,
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
  onToggleEnabled: (enabled: boolean) => void;
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
    <div className="overflow-hidden rounded-lg border border-ds-border bg-ds-surface">
      <div className="flex flex-col gap-5 border-b border-ds-border bg-ds-surface-subtle px-6 pt-[18px] min-[980px]:flex-row min-[980px]:items-center min-[980px]:justify-between">
        <div className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#8c8c92]">
          {manifest.name.toUpperCase()} WORKSPACE
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {WORKSPACE_SECTIONS.map(({ id, label, Icon }) => (
              <button
                key={id}
                className={cx(
                  'flex items-center gap-3 border-b-2 border-transparent pb-[14px] text-left text-utility font-semibold tracking-[var(--ds-type-utility-tracking)] text-ds-text-primary transition-colors duration-fast ease-[var(--ds-motion-transition-fast)]',
                  section === id ? 'border-ds-accent-blue text-ds-accent-blue' : 'text-ds-text-secondary',
                )}
                onClick={() => props.onSelectSection(id)}
              >
              <Icon size={16} className={section === id ? 'opacity-100' : 'opacity-60'} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-ds-surface px-10 py-8 max-[760px]:px-5">
        {section === 'config' && (
          <WorkspaceConfig
            manifest={manifest}
            summary={props.summary}
            isConnected={isConnected}
            busyAction={props.busyAction}
            apiKeyValue={props.apiKeyValue}
            showAdvancedEditor={props.showAdvancedEditor}
            onManifestFieldChange={props.onManifestFieldChange}
            onApiKeyChange={props.onApiKeyChange}
            onToggleEnabled={props.onToggleEnabled}
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
  summary?: ProviderSummary;
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
  onToggleEnabled: (enabled: boolean) => void;
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
      <div className="overflow-hidden rounded-lg border border-ds-border bg-ds-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="flex flex-col gap-3 px-5 py-5">
          <div className="flex items-center justify-between gap-4">
            <span className="font-text text-[11px] font-semibold uppercase tracking-[0.08em] text-ds-text-secondary">
              Provider Workspace
            </span>
            <div className="inline-flex items-center gap-2">
              <span className="font-text text-[11px] font-semibold tracking-[0] text-ds-text-primary">
                {toggleLabel}
              </span>
              <ToggleSwitch
                checked={props.isConnected}
                onChange={(enabled) => {
                  if (enableLocked && enabled) return;
                  props.onToggleEnabled(enabled);
                }}
                ariaLabel={`Toggle ${props.manifest.name}`}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <h2 className="m-0 text-page-title text-ds-text-primary">
              {manifest.name}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-pill bg-ds-accent-blue-soft px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-ds-accent-blue">
              Config Tab
            </span>
            <StatusBadge tone={props.isConnected ? 'green' : 'gray'}>
              {props.isConnected ? 'Connected' : 'Disabled'}
            </StatusBadge>
            <StatusBadge tone={cacheState === 'fresh' ? 'green' : cacheState === 'stale' ? 'orange' : 'gray'}>
              {cacheLabel}
            </StatusBadge>
            <span className="rounded-pill bg-ds-surface-subtle px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-ds-text-secondary">
              Provider Defaults
            </span>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            {props.showAdvancedEditor && (
              <AppButton variant="outline" size="utility" onClick={props.onOpenRawJson}>Raw JSON</AppButton>
            )}
            <AppButton variant="primary" size="utility" onClick={props.onSave} disabled={props.busyAction.includes('save')}>
              {props.busyAction.includes('save') ? 'Saving…' : 'Save'}
            </AppButton>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-ds-border bg-ds-surface">
        <ConfigRow label="Provider Name">
          <input
            className="min-h-control w-full rounded-sm border border-ds-border-strong bg-white px-4 py-[11px] text-utility tracking-[var(--ds-type-utility-tracking)] text-ds-text-primary"
            value={manifest.name}
            onChange={(event) => props.onManifestFieldChange('root', 'name', event.target.value)}
          />
        </ConfigRow>
        <ConfigRow label="API Key" last>
          <input
            className="min-h-control w-full rounded-sm border border-ds-border-strong bg-white px-4 py-[11px] text-utility tracking-[var(--ds-type-utility-tracking)] text-ds-text-primary"
            type="password"
            value={props.apiKeyValue}
            onChange={(event) => props.onApiKeyChange(event.target.value)}
            placeholder="Paste provider API key"
          />
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
    <div className="flex flex-col gap-5">
      <SectionHeader
        eyebrow="Store"
        title="Price Inventory"
        description="Stock by service, country and operator"
        actions={(
          <div className="flex flex-wrap justify-end gap-3">
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
        className="w-full min-[760px]:w-[260px]"
      />

      <div className="overflow-hidden rounded-lg border border-solid border-ds-border-strong bg-ds-surface">
        <DataTable
          headerClassName="grid grid-cols-1 items-center gap-4 border-b border-solid border-ds-border-strong border-x-0 border-t-0 px-5 py-[14px] text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8c8c92] min-[760px]:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_120px_96px]"
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
            <div className="grid grid-cols-1 items-center gap-4 border-b border-solid border-ds-border border-x-0 border-t-0 px-5 py-4 last:border-b-0 min-[760px]:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_120px_96px]" key={`${item.country}-${item.display_name}`}>
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

function WorkspaceWallet(props: {
  manifest: ProviderManifest;
  balanceLabel: string;
  summary?: ProviderSummary;
  busyAction: string;
  onFetchBalance: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="px-7 pb-6 pt-7">
        <span className="text-utility tracking-[var(--ds-type-utility-tracking)] text-ds-text-secondary">Current Balance</span>
        <strong className="block text-[48px] font-semibold leading-[1.1] tracking-[-0.48px] text-ds-text-primary">
          {props.balanceLabel === '—' ? '—' : props.balanceLabel}
        </strong>
        <div className="pt-6">
          <AppButton variant="primary" onClick={props.onFetchBalance} disabled={props.busyAction.includes('balance')}>
            Top Up / Refresh
          </AppButton>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-ds-border bg-ds-surface">
        <div className="border-b border-black/5 px-5 py-4 text-section-title font-semibold tracking-[var(--ds-type-section-title-tracking)] text-ds-text-primary">
          Provider Details
        </div>
        <DetailRow label="Protocol" value={props.summary?.protocol ?? props.manifest.kind} />
        <DetailRow label="Default Service" value={formatServiceLabel(props.manifest.defaults.service)} />
        <DetailRow label="Default Country" value={formatCountryLabel(props.manifest.defaults.country)} />
        <DetailRow label="Status" value={props.manifest.enabled ? 'Enabled' : 'Disabled'} last />
      </div>
    </div>
  );
}
