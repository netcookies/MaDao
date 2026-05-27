import type { ReactNode } from 'react';
import { Minus, Moon, Plus, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  AppButton,
  DataTable,
  PageHeader,
  SegmentedControl,
  SettingChoiceRow,
  TextField,
  ToggleSetting,
  ToggleSwitch,
} from '../ui-bridge';
import type {
  LanguageCode as AppLanguageCode,
  OptionCacheOverview,
  RemoteStatsSummaryResponse,
} from '../types';

export type AppearanceTheme = 'light' | 'dark' | 'system';
declare const __APP_VERSION__: string;
const APP_VERSION = __APP_VERSION__;

export type SettingsScreenProps = {
  autoRefresh: boolean;
  setAutoRefresh: (value: boolean) => void;
  showAdvancedEditor: boolean;
  setShowAdvancedEditor: (value: boolean) => void;
  language: AppLanguageCode;
  setLanguage: (value: AppLanguageCode) => void;
  appearanceTheme: AppearanceTheme;
  setAppearanceTheme: (value: AppearanceTheme) => void;
  optionCacheEnabled: boolean;
  optionCachePollIntervalMinutes: number;
  optionCacheOverview: OptionCacheOverview;
  onlyShowOpenAiSmsCountries: boolean;
  checkUpdatesOnLaunch: boolean;
  updateCheckBusy: boolean;
  isDesktopRuntime: boolean;
  isWebRuntime: boolean;
  httpPort: number;
  httpSecret: string;
  httpSecretOverridden: boolean;
  statsSyncEnabled: boolean;
  statsSyncBaseUrl: string;
  statsSyncApiToken: string;
  statsSyncPendingEvents?: number;
  statsSyncLastAttemptAt?: string | null;
  statsSyncLastSuccessAt?: string | null;
  statsSyncLastError?: string | null;
  onOptionCacheEnabledChange: (enabled: boolean) => void;
  onOptionCachePollIntervalChange: (minutes: number) => void;
  onOnlyShowOpenAiSmsCountriesChange: (enabled: boolean) => void;
  onCheckUpdatesOnLaunchChange: (enabled: boolean) => void;
  onHttpPortChange: (port: number) => void;
  onStatsSyncEnabledChange: (enabled: boolean) => void;
  onStatsSyncBaseUrlChange: (value: string) => void;
  onStatsSyncApiTokenChange: (value: string) => void;
  onSyncStatsNow: () => void;
  syncStatsBusy: boolean;
  remoteStatsQuery: {
    provider: string;
    service: string;
    country: string;
    operator: string;
    lookbackHours: number;
  };
  onRemoteStatsQueryChange: (
    field: 'provider' | 'service' | 'country' | 'operator' | 'lookbackHours',
    value: string | number,
  ) => void;
  onFetchRemoteStatsSummary: () => void;
  remoteStatsSummaryBusy: boolean;
  remoteStatsSummary?: RemoteStatsSummaryResponse | null;
  onRegenerateHttpSecret: () => void;
  regenerateSecretBusy: boolean;
  onCheckForUpdates: () => void;
  apiBase: string;
  socketPath: string;
  configDirectory: string;
};

function ServerConfigRow(props: {
  label: string;
  children: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div className="grid gap-2 py-2 min-[720px]:grid-cols-[minmax(0,1fr)_auto] min-[720px]:items-center">
      <span className="font-text text-utility font-normal tracking-[var(--ds-type-utility-tracking)] text-ds-text-secondary">
        {props.label}
      </span>
      <div className="min-w-0 min-[720px]:justify-self-end">{props.children}</div>
      {props.note ? (
        <p className="m-0 text-[12px] leading-[1.45] text-ds-text-secondary min-[720px]:col-span-2">
          {props.note}
        </p>
      ) : null}
    </div>
  );
}

export function SettingsScreen(props: SettingsScreenProps) {
  const { t, i18n } = useTranslation();
  const language = (i18n.resolvedLanguage ?? i18n.language ?? 'en') as AppLanguageCode;
  function handlePollIntervalStep(nextValue: number) {
    props.onOptionCachePollIntervalChange(Math.max(1, nextValue));
  }
  function handlePollIntervalInput(rawValue: string) {
    const trimmed = rawValue.trim();
    if (!trimmed) return;
    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(parsed)) return;
    props.onOptionCachePollIntervalChange(Math.max(1, parsed));
  }
  function handleHttpPortInput(rawValue: string) {
    const trimmed = rawValue.trim();
    if (!trimmed) return;
    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(parsed)) return;
    props.onHttpPortChange(Math.max(1, Math.min(65535, parsed)));
  }
  function handleLookbackHoursInput(rawValue: string) {
    const trimmed = rawValue.trim();
    if (!trimmed) return;
    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(parsed)) return;
    props.onRemoteStatsQueryChange('lookbackHours', Math.max(1, parsed));
  }
  const statsStatusText = [
    props.statsSyncPendingEvents != null ? `${t('Pending events')}: ${props.statsSyncPendingEvents}` : null,
    props.statsSyncLastSuccessAt ? `${t('Last success')}: ${props.statsSyncLastSuccessAt}` : null,
    props.statsSyncLastAttemptAt ? `${t('Last attempt')}: ${props.statsSyncLastAttemptAt}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={t('Settings')}
        subtitle={t('Configure global preferences and app behavior.')}
      />

      <div className="overflow-hidden rounded-sm border border-ds-border bg-ds-surface py-2 shadow-ds backdrop-blur-ds">
        <div className="flex flex-col gap-0 border-b border-solid border-ds-border border-x-0 border-t-0 px-6 py-4">
          <h3 className="m-0 text-section-title font-semibold tracking-[var(--ds-type-section-title-tracking)] text-ds-text-primary">{t('Appearance')}</h3>
          <SettingChoiceRow
            label={t('Language')}
            control={<SegmentedControl items={[{ id: 'en', label: t('English') }, { id: 'zh', label: t('中文') }]} value={props.language} onChange={props.setLanguage} appearance="rail" className="min-h-0" />}
          />
          <SettingChoiceRow
            label={t('Theme')}
            control={<SegmentedControl items={[{ id: 'light', label: t('Light'), icon: <Sun size={13} /> }, { id: 'dark', label: t('Dark'), icon: <Moon size={13} /> }, { id: 'system', label: t('System') }]} value={props.appearanceTheme} onChange={props.setAppearanceTheme} appearance="rail" className="min-h-0" />}
          />
        </div>

        <div className="flex flex-col gap-0 border-b border-solid border-ds-border border-x-0 border-t-0 px-6 py-4">
          <h3 className="m-0 pb-4 text-section-title font-semibold tracking-[var(--ds-type-section-title-tracking)] text-ds-text-primary">{t('General')}</h3>
          <ToggleSetting title={t('Auto Refresh')} description={t('Refresh runtime snapshot every 4 seconds.')} checked={props.autoRefresh} onChange={props.setAutoRefresh} />
          <ToggleSetting title={t('Advanced Manifest Access')} description={t('Allow opening the raw manifest editor modal.')} checked={props.showAdvancedEditor} onChange={props.setShowAdvancedEditor} />
        </div>

        <div className="flex flex-col gap-3 border-b border-solid border-ds-border border-x-0 border-t-0 px-6 py-4">
          <h3 className="m-0 text-section-title font-semibold tracking-[var(--ds-type-section-title-tracking)] text-ds-text-primary">{t('Provider Option Cache')}</h3>
          <div className="flex items-center justify-between gap-4">
            <span className="font-text text-utility font-normal tracking-[var(--ds-type-utility-tracking)] text-ds-text-primary opacity-70">{t('Enable cache')}</span>
            <ToggleSwitch checked={props.optionCacheEnabled} onChange={props.onOptionCacheEnabledChange} ariaLabel={t('Toggle option cache')} />
          </div>
          <ToggleSetting
            title={t('Only show OpenAI SMS countries')}
            description={t('Hide countries that are WhatsApp-only for OpenAI verification. Countries explicitly listed in OpenAI SMS regions stay visible. Region data refreshes daily and is cached locally.')}
            checked={props.onlyShowOpenAiSmsCountries}
            onChange={props.onOnlyShowOpenAiSmsCountriesChange}
          />
          <SettingChoiceRow
            label={t('Polling Interval')}
            control={(
              <div className="flex items-center gap-2">
                <AppButton
                  variant="outline"
                  size="utility"
                  aria-label={t('Decrease polling interval')}
                  className="w-10 min-w-10 px-0"
                  onClick={() => handlePollIntervalStep(props.optionCachePollIntervalMinutes - 1)}
                >
                  <Minus size={18} strokeWidth={2.4} />
                </AppButton>
                <TextField
                  type="number"
                  min={1}
                  step={1}
                  value={props.optionCachePollIntervalMinutes}
                  onChange={(event) => handlePollIntervalInput(event.target.value)}
                  compact
                  aria-label={t('Polling interval in minutes')}
                  className="w-[88px]"
                  inputClassName="text-center [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <AppButton
                  variant="outline"
                  size="utility"
                  aria-label={t('Increase polling interval')}
                  className="w-10 min-w-10 px-0"
                  onClick={() => handlePollIntervalStep(props.optionCachePollIntervalMinutes + 1)}
                >
                  <Plus size={18} strokeWidth={2.4} />
                </AppButton>
              </div>
            )}
          />
          <div className="flex flex-wrap items-center gap-3 text-caption text-ds-text-secondary">
            <span>{t('Fresh: ')}{props.optionCacheOverview.fresh_providers}</span>
            <span>{t('Stale: ')}{props.optionCacheOverview.stale_providers}</span>
            <span>{t('Missing: ')}{props.optionCacheOverview.missing_providers}</span>
          </div>
        </div>

        <div className="flex flex-col gap-3 px-6 py-4">
          <div className="flex flex-col gap-1.5">
            <h3 className="m-0 text-section-title font-semibold tracking-[var(--ds-type-section-title-tracking)] text-ds-text-primary">{t('Server Configuration')}</h3>
            <p className="m-0 text-[12px] leading-[1.45] text-ds-text-secondary">
              {props.isDesktopRuntime
                ? t('The HTTP service listens on all interfaces for direct external access. Desktop UI itself still uses the local socket.')
                : t('The HTTP service listens on all interfaces for direct external access. The web console still enters through the current page address.')}
            </p>
          </div>
          <ServerConfigRow
            label={t('HTTP Endpoint')}
          >
              <div className="inline-block max-w-full overflow-x-auto rounded-xs border border-ds-border bg-ds-surface-subtle px-2.5 py-[5px] font-mono text-caption text-ds-text-secondary">
                {props.apiBase || '—'}
              </div>
          </ServerConfigRow>
          <ServerConfigRow
            label={`${t('HTTP Port')}（${t('Takes effect after daemon restart')}）`}
          >
            <TextField
              type="number"
              min={1}
              max={65535}
              step={1}
              value={props.httpPort}
              onChange={(event) => handleHttpPortInput(event.target.value)}
              compact
              fullWidth={false}
              className="w-[110px]"
              inputClassName="text-center [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </ServerConfigRow>
          <ServerConfigRow label={t('HTTP Secret')}>
            <div className="flex max-w-full items-center gap-3">
              <div className="inline-block max-w-full overflow-x-auto rounded-xs border border-ds-border bg-ds-surface-subtle px-2.5 py-[5px] font-mono text-caption text-ds-text-secondary">
                {props.httpSecret}
              </div>
              <AppButton variant="outline" size="utility" onClick={props.onRegenerateHttpSecret} disabled={props.regenerateSecretBusy}>
                {props.regenerateSecretBusy ? t('Regenerating…') : t('Regenerate')}
              </AppButton>
            </div>
          </ServerConfigRow>
          {props.httpSecretOverridden ? (
            <p className="m-0 text-[12px] leading-[1.45] text-ds-text-secondary">
              {t('Docker environment variable is overriding the persisted secret.')}
            </p>
          ) : null}
          <ServerConfigRow label={t('Socket Path')}>
            <div className="inline-block max-w-full overflow-x-auto rounded-xs border border-ds-border bg-ds-surface-subtle px-2.5 py-[5px] font-mono text-caption text-ds-text-secondary">
              {props.socketPath}
            </div>
          </ServerConfigRow>
          <ServerConfigRow label={t('Config Directory')}>
            <div className="inline-block max-w-full overflow-x-auto rounded-xs border border-ds-border bg-ds-surface-subtle px-2.5 py-[5px] font-mono text-caption text-ds-text-secondary">
              {props.configDirectory}
            </div>
          </ServerConfigRow>
          <ServerConfigRow label={t('Runtime Mode')}>
            <span className="text-[13px] leading-[1.43] tracking-[-0.224px] text-ds-text-secondary">
              {props.isDesktopRuntime ? 'Tauri v2 Desktop' : 'Docker Web'}
            </span>
          </ServerConfigRow>
          <div className="border-solid border-ds-border border-b-0 border-x-0 border-t pt-4">
            <ServerConfigRow label={t('Version')}>
              <span className="font-mono text-caption text-ds-text-secondary">v{APP_VERSION}</span>
            </ServerConfigRow>
          </div>
          <ServerConfigRow label={t('Check for updates on launch')}>
            <ToggleSwitch checked={props.checkUpdatesOnLaunch} onChange={props.onCheckUpdatesOnLaunchChange} ariaLabel={t('Toggle check for updates on launch')} />
          </ServerConfigRow>
          <ServerConfigRow label={t('Check for updates')}>
            <AppButton variant="outline" size="utility" onClick={props.onCheckForUpdates} disabled={props.updateCheckBusy}>
              {props.updateCheckBusy ? t('Checking…') : t('Check now')}
            </AppButton>
          </ServerConfigRow>
        </div>

        <div className="flex flex-col gap-3 border-solid border-ds-border border-b-0 border-x-0 border-t px-6 py-4">
          <div className="flex flex-col gap-1.5">
            <h3 className="m-0 text-section-title font-semibold tracking-[var(--ds-type-section-title-tracking)] text-ds-text-primary">{t('Stats Sync')}</h3>
            <p className="m-0 text-[12px] leading-[1.45] text-ds-text-secondary">
              {t('Upload local ticket outcome events to the shared Cloudflare Worker and keep summary queries consistent across devices.')}
            </p>
          </div>
          <ServerConfigRow label={t('Enable stats sync')}>
            <ToggleSwitch checked={props.statsSyncEnabled} onChange={props.onStatsSyncEnabledChange} ariaLabel={t('Toggle stats sync')} />
          </ServerConfigRow>
          <ServerConfigRow
            label={t('Worker Base URL')}
            note={t('Example: https://madao-stats.example.workers.dev')}
          >
            <TextField
              type="text"
              value={props.statsSyncBaseUrl}
              onChange={(event) => props.onStatsSyncBaseUrlChange(event.target.value)}
              compact
              className="min-w-[280px] max-w-[420px]"
            />
          </ServerConfigRow>
          <ServerConfigRow label={t('Worker API Token')}>
            <TextField
              type="password"
              value={props.statsSyncApiToken}
              onChange={(event) => props.onStatsSyncApiTokenChange(event.target.value)}
              compact
              className="min-w-[280px] max-w-[420px]"
            />
          </ServerConfigRow>
          <ServerConfigRow label={t('Sync status')}>
            <div className="flex flex-col items-start gap-2">
              <AppButton variant="outline" size="utility" onClick={props.onSyncStatsNow} disabled={props.syncStatsBusy}>
                {props.syncStatsBusy ? t('Syncing…') : t('Sync now')}
              </AppButton>
              {statsStatusText ? (
                <span className="text-[12px] leading-[1.45] text-ds-text-secondary">{statsStatusText}</span>
              ) : null}
              {props.statsSyncLastError ? (
                <span className="text-[12px] leading-[1.45] text-ds-danger">{props.statsSyncLastError}</span>
              ) : null}
            </div>
          </ServerConfigRow>
          <div className="grid gap-3 min-[960px]:grid-cols-2">
            <ServerConfigRow label={t('Lookback hours')}>
              <TextField
                type="number"
                min={1}
                step={1}
                value={props.remoteStatsQuery.lookbackHours}
                onChange={(event) => handleLookbackHoursInput(event.target.value)}
                compact
                fullWidth={false}
                className="w-[110px]"
                inputClassName="text-center [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </ServerConfigRow>
            <ServerConfigRow label={t('Summary provider filter')}>
              <TextField
                type="text"
                value={props.remoteStatsQuery.provider}
                onChange={(event) => props.onRemoteStatsQueryChange('provider', event.target.value)}
                placeholder={t('Leave empty for all providers')}
                compact
                className="min-w-[220px]"
              />
            </ServerConfigRow>
            <ServerConfigRow label={t('Summary service filter')}>
              <TextField
                type="text"
                value={props.remoteStatsQuery.service}
                onChange={(event) => props.onRemoteStatsQueryChange('service', event.target.value)}
                placeholder={t('Leave empty for all services')}
                compact
                className="min-w-[220px]"
              />
            </ServerConfigRow>
            <ServerConfigRow label={t('Summary country filter')}>
              <TextField
                type="text"
                value={props.remoteStatsQuery.country}
                onChange={(event) => props.onRemoteStatsQueryChange('country', event.target.value)}
                placeholder={t('Leave empty for all countries')}
                compact
                className="min-w-[220px]"
              />
            </ServerConfigRow>
            <ServerConfigRow label={t('Summary operator filter')}>
              <TextField
                type="text"
                value={props.remoteStatsQuery.operator}
                onChange={(event) => props.onRemoteStatsQueryChange('operator', event.target.value)}
                placeholder={t('Leave empty for all operators')}
                compact
                className="min-w-[220px]"
              />
            </ServerConfigRow>
          </div>
          <ServerConfigRow
            label={t('Remote summary')}
            note={t('Use daemon proxy to query the current Worker aggregate and inspect recent provider quality by route dimensions.')}
          >
            <AppButton variant="outline" size="utility" onClick={props.onFetchRemoteStatsSummary} disabled={props.remoteStatsSummaryBusy}>
              {props.remoteStatsSummaryBusy ? t('Loading summary…') : t('Load summary')}
            </AppButton>
          </ServerConfigRow>
          <div className="overflow-x-auto rounded-xs border border-ds-border bg-ds-surface-subtle">
            <DataTable
              className="min-w-[1060px]"
              headerClassName="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,1fr)_72px_86px_86px_86px_72px_72px] items-center gap-3 border-b border-solid border-ds-border border-x-0 border-t-0 px-4 py-2.5 text-[12px] font-medium uppercase tracking-[0.08em] text-ds-text-secondary"
              header={(
                <>
                  <span>{t('Provider')}</span>
                  <span>{t('Service')}</span>
                  <span>{t('Country')}</span>
                  <span>{t('Operator')}</span>
                  <span>{t('Success')}</span>
                  <span>{t('Success count')}</span>
                  <span>{t('Total')}</span>
                  <span>{t('Cancelled')}</span>
                  <span>{t('Banned')}</span>
                  <span>{t('Failed')}</span>
                </>
              )}
            >
              {props.remoteStatsSummary?.items?.length ? props.remoteStatsSummary.items.map((item, index) => (
                <div
                  className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,1fr)_72px_86px_86px_86px_72px_72px] items-center gap-3 border-b border-solid border-ds-border border-x-0 border-t-0 px-4 py-2.5 text-[13px] text-ds-text-primary last:border-b-0"
                  key={`${item.provider}-${item.service}-${item.country}-${item.operator}-${index}`}
                >
                  <span className="truncate">{item.provider}</span>
                  <span className="truncate">{item.service}</span>
                  <span className="truncate">{item.country}</span>
                  <span className="truncate">{item.operator}</span>
                  <span>{(item.success_rate * 100).toFixed(1)}%</span>
                  <span>{item.success_count}</span>
                  <span>{item.total}</span>
                  <span>{item.cancelled_count}</span>
                  <span>{item.banned_count}</span>
                  <span>{item.failed_count}</span>
                </div>
              )) : (
                <div className="px-5 py-7 text-center text-utility tracking-[var(--ds-type-utility-tracking)] text-ds-text-secondary">
                  {props.remoteStatsSummary
                    ? t('No summary data matched the current filters.')
                    : t('Load the remote summary to inspect recent route quality by provider, service, country, and operator.')}
                </div>
              )}
            </DataTable>
          </div>
        </div>
      </div>
    </div>
  );
}
