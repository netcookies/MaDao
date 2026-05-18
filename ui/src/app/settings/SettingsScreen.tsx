import type { ReactNode } from 'react';
import { Minus, Moon, Plus, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  AppButton,
  PageHeader,
  SegmentedControl,
  SettingChoiceRow,
  TextField,
  ToggleSetting,
  ToggleSwitch,
} from '../ui-bridge';
import type { LanguageCode as AppLanguageCode, OptionCacheOverview } from '../types';

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
  checkUpdatesOnLaunch: boolean;
  updateCheckBusy: boolean;
  isDesktopRuntime: boolean;
  isWebRuntime: boolean;
  httpPort: number;
  httpSecret: string;
  httpSecretOverridden: boolean;
  onOptionCacheEnabledChange: (enabled: boolean) => void;
  onOptionCachePollIntervalChange: (minutes: number) => void;
  onCheckUpdatesOnLaunchChange: (enabled: boolean) => void;
  onHttpPortChange: (port: number) => void;
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
                ? t('Used for direct external HTTP access. Desktop UI itself uses the local socket.')
                : t('Used for direct external daemon HTTP access. The web console continues to enter through the current page address.')}
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
      </div>
    </div>
  );
}
