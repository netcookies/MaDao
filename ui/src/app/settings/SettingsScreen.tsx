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

export type SettingsScreenProps = {
  autoRefresh: boolean;
  setAutoRefresh: (value: boolean) => void;
  showAdvancedEditor: boolean;
  setShowAdvancedEditor: (value: boolean) => void;
  compactTables: boolean;
  setCompactTables: (value: boolean) => void;
  language: AppLanguageCode;
  setLanguage: (value: AppLanguageCode) => void;
  appearanceTheme: AppearanceTheme;
  setAppearanceTheme: (value: AppearanceTheme) => void;
  optionCacheEnabled: boolean;
  optionCachePollIntervalMinutes: number;
  optionCacheOverview: OptionCacheOverview;
  onOptionCacheEnabledChange: (enabled: boolean) => void;
  onOptionCachePollIntervalChange: (minutes: number) => void;
  apiBase: string;
  socketPath: string;
  configDirectory: string;
};

export function SettingsScreen(props: SettingsScreenProps) {
  const { t, i18n } = useTranslation();
  const language = (i18n.resolvedLanguage ?? i18n.language ?? 'en') as AppLanguageCode;
  function handlePollIntervalStep(nextValue: number) {
    props.onOptionCachePollIntervalChange(Math.max(1, nextValue));
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
          <ToggleSetting title={t('Compact Tables')} description={t('Tighten spacing for activity, provider and inventory tables.')} checked={props.compactTables} onChange={props.setCompactTables} last />
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
                  onChange={(event) => props.onOptionCachePollIntervalChange(Number(event.target.value || 30))}
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

        <div className="flex flex-col gap-4 px-6 py-4">
          <h3 className="m-0 text-section-title font-semibold tracking-[var(--ds-type-section-title-tracking)] text-ds-text-primary">{t('Server Configuration')}</h3>
          <div className="flex items-center justify-between gap-4">
            <span className="font-text text-utility font-normal tracking-[var(--ds-type-utility-tracking)] text-ds-text-secondary">{t('HTTP Endpoint')}</span>
            <div className="inline-block rounded-xs border border-ds-border bg-ds-surface-subtle px-2.5 py-[5px] font-mono text-caption text-ds-text-secondary">
              {props.apiBase}
            </div>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="font-text text-utility font-normal tracking-[var(--ds-type-utility-tracking)] text-ds-text-secondary">{t('Socket Path')}</span>
            <div className="inline-block rounded-xs border border-ds-border bg-ds-surface-subtle px-2.5 py-[5px] font-mono text-caption text-ds-text-secondary">
              {props.socketPath}
            </div>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="font-text text-utility font-normal tracking-[var(--ds-type-utility-tracking)] text-ds-text-secondary">{t('Config Directory')}</span>
            <div className="inline-block rounded-xs border border-ds-border bg-ds-surface-subtle px-2.5 py-[5px] font-mono text-caption text-ds-text-secondary">
              {props.configDirectory}
            </div>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="font-text text-utility font-normal tracking-[var(--ds-type-utility-tracking)] text-ds-text-secondary">{t('Desktop Runtime')}</span>
            <span className="text-[13px] leading-[1.43] tracking-[-0.224px] text-ds-text-secondary">Tauri v2</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 border-solid border-ds-border border-b-0 border-x-0 border-t px-6 py-3">
          <span className="font-text text-utility font-normal tracking-[var(--ds-type-utility-tracking)] text-ds-text-secondary">{t('Version')}</span>
          <span className="font-mono text-caption text-ds-text-secondary">v1.0.0</span>
        </div>
      </div>
    </div>
  );
}
