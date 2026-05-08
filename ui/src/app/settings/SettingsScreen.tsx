import { Minus, Moon, Plus, Sun } from 'lucide-react';
import {
  AppButton,
  PageHeader,
  SegmentedControl,
  SettingChoiceRow,
  TextField,
  ToggleSetting,
  ToggleSwitch,
} from '../ui-bridge';
import type { OptionCacheOverview } from '../types';
import { useLanguage } from '../language';

export type AppearanceTheme = 'light' | 'dark' | 'system';
export type LanguageCode = 'en' | 'zh';

export type SettingsScreenProps = {
  autoRefresh: boolean;
  setAutoRefresh: (value: boolean) => void;
  showAdvancedEditor: boolean;
  setShowAdvancedEditor: (value: boolean) => void;
  compactTables: boolean;
  setCompactTables: (value: boolean) => void;
  language: LanguageCode;
  setLanguage: (value: LanguageCode) => void;
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
  const language = useLanguage();
  function handlePollIntervalStep(nextValue: number) {
    props.onOptionCachePollIntervalChange(Math.max(1, nextValue));
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={language === 'zh' ? '设置' : 'Settings'}
        subtitle={language === 'zh' ? '配置全局偏好与应用行为。' : 'Configure global preferences and app behavior.'}
      />

      <div className="overflow-hidden rounded-sm border border-ds-border bg-ds-surface py-2 shadow-ds backdrop-blur-ds">
        <div className="flex flex-col gap-0 border-b border-solid border-ds-border border-x-0 border-t-0 px-6 py-4">
          <h3 className="m-0 text-section-title font-semibold tracking-[var(--ds-type-section-title-tracking)] text-ds-text-primary">{language === 'zh' ? '外观' : 'Appearance'}</h3>
          <SettingChoiceRow
            label={language === 'zh' ? '语言' : 'Language'}
            control={<SegmentedControl items={[{ id: 'en', label: 'English' }, { id: 'zh', label: '中文' }]} value={props.language} onChange={props.setLanguage} appearance="rail" className="min-h-0" />}
          />
          <SettingChoiceRow
            label={language === 'zh' ? '主题' : 'Theme'}
            control={<SegmentedControl items={[{ id: 'light', label: 'Light', icon: <Sun size={13} /> }, { id: 'dark', label: 'Dark', icon: <Moon size={13} /> }, { id: 'system', label: 'System' }]} value={props.appearanceTheme} onChange={props.setAppearanceTheme} appearance="rail" className="min-h-0" />}
          />
        </div>

        <div className="flex flex-col gap-0 border-b border-solid border-ds-border border-x-0 border-t-0 px-6 py-4">
          <h3 className="m-0 pb-4 text-section-title font-semibold tracking-[var(--ds-type-section-title-tracking)] text-ds-text-primary">{language === 'zh' ? '通用' : 'General'}</h3>
          <ToggleSetting title={language === 'zh' ? '自动刷新' : 'Auto Refresh'} description={language === 'zh' ? '每 4 秒刷新一次运行时快照。' : 'Refresh runtime snapshot every 4 seconds.'} checked={props.autoRefresh} onChange={props.setAutoRefresh} />
          <ToggleSetting title={language === 'zh' ? '高级 Manifest 访问' : 'Advanced Manifest Access'} description={language === 'zh' ? '允许打开原始 manifest 编辑器弹窗。' : 'Allow opening the raw manifest editor modal.'} checked={props.showAdvancedEditor} onChange={props.setShowAdvancedEditor} />
          <ToggleSetting title={language === 'zh' ? '紧凑表格' : 'Compact Tables'} description={language === 'zh' ? '收紧活动、Provider 和库存表格的间距。' : 'Tighten spacing for activity, provider and inventory tables.'} checked={props.compactTables} onChange={props.setCompactTables} last />
        </div>

        <div className="flex flex-col gap-3 border-b border-solid border-ds-border border-x-0 border-t-0 px-6 py-4">
          <h3 className="m-0 text-section-title font-semibold tracking-[var(--ds-type-section-title-tracking)] text-ds-text-primary">{language === 'zh' ? 'Provider 选项缓存' : 'Provider Option Cache'}</h3>
          <div className="flex items-center justify-between gap-4">
            <span className="font-text text-utility font-normal tracking-[var(--ds-type-utility-tracking)] text-ds-text-primary opacity-70">{language === 'zh' ? '启用缓存' : 'Enable cache'}</span>
            <ToggleSwitch checked={props.optionCacheEnabled} onChange={props.onOptionCacheEnabledChange} ariaLabel="Toggle option cache" />
          </div>
          <SettingChoiceRow
            label={language === 'zh' ? '轮询间隔' : 'Polling Interval'}
            control={(
              <div className="flex items-center gap-2">
                <AppButton
                  variant="outline"
                  size="utility"
                  aria-label="Decrease polling interval"
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
                  aria-label="Polling interval in minutes"
                  className="w-[88px]"
                  inputClassName="text-center [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <AppButton
                  variant="outline"
                  size="utility"
                  aria-label="Increase polling interval"
                  className="w-10 min-w-10 px-0"
                  onClick={() => handlePollIntervalStep(props.optionCachePollIntervalMinutes + 1)}
                >
                  <Plus size={18} strokeWidth={2.4} />
                </AppButton>
              </div>
            )}
          />
          <div className="flex flex-wrap items-center gap-3 text-caption text-ds-text-secondary">
            <span>{language === 'zh' ? '新鲜：' : 'Fresh: '}{props.optionCacheOverview.fresh_providers}</span>
            <span>{language === 'zh' ? '过期：' : 'Stale: '}{props.optionCacheOverview.stale_providers}</span>
            <span>{language === 'zh' ? '缺失：' : 'Missing: '}{props.optionCacheOverview.missing_providers}</span>
          </div>
        </div>

        <div className="flex flex-col gap-4 px-6 py-4">
          <h3 className="m-0 text-section-title font-semibold tracking-[var(--ds-type-section-title-tracking)] text-ds-text-primary">{language === 'zh' ? '服务端配置' : 'Server Configuration'}</h3>
          <div className="flex items-center justify-between gap-4">
            <span className="font-text text-utility font-normal tracking-[var(--ds-type-utility-tracking)] text-ds-text-secondary">{language === 'zh' ? 'HTTP 地址' : 'HTTP Endpoint'}</span>
            <div className="inline-block rounded-xs border border-ds-border bg-ds-surface-subtle px-2.5 py-[5px] font-mono text-caption text-ds-text-secondary">
              {props.apiBase}
            </div>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="font-text text-utility font-normal tracking-[var(--ds-type-utility-tracking)] text-ds-text-secondary">{language === 'zh' ? 'Socket 路径' : 'Socket Path'}</span>
            <div className="inline-block rounded-xs border border-ds-border bg-ds-surface-subtle px-2.5 py-[5px] font-mono text-caption text-ds-text-secondary">
              {props.socketPath}
            </div>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="font-text text-utility font-normal tracking-[var(--ds-type-utility-tracking)] text-ds-text-secondary">{language === 'zh' ? '配置目录' : 'Config Directory'}</span>
            <div className="inline-block rounded-xs border border-ds-border bg-ds-surface-subtle px-2.5 py-[5px] font-mono text-caption text-ds-text-secondary">
              {props.configDirectory}
            </div>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="font-text text-utility font-normal tracking-[var(--ds-type-utility-tracking)] text-ds-text-secondary">{language === 'zh' ? '桌面运行时' : 'Desktop Runtime'}</span>
            <span className="text-[13px] leading-[1.43] tracking-[-0.224px] text-ds-text-secondary">Tauri v2</span>
          </div>
        </div>
      </div>
    </div>
  );
}
