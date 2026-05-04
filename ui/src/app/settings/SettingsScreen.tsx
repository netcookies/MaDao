import { Moon, Sun } from 'lucide-react';
import {
  AppButton,
  SegmentedControl,
  SettingChoiceRow,
  ToggleSetting,
  ToggleSwitch,
} from '../ui-bridge';

export type RoutingStrategy = 'ordered_priority' | 'lowest_price' | 'highest_stock';
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
  routingStrategy: RoutingStrategy;
  autoFallback: boolean;
  onStrategyChange: (value: RoutingStrategy) => void;
  onAutoFallbackChange: (enabled: boolean) => void;
  onReload: () => void;
  reloadBusy: boolean;
  apiBase: string;
  socketPath: string;
  routingStrategies: Array<{ id: RoutingStrategy; label: string }>;
};

export function SettingsScreen(props: SettingsScreenProps) {
  return (
    <div className="flex flex-col gap-8">
      <p className="m-0 max-w-[640px] font-text text-utility font-normal tracking-[var(--ds-type-utility-tracking)] text-ds-text-secondary">
        Configure global preferences and app behavior.
      </p>

      <div className="overflow-hidden rounded-sm border border-black/[0.08] bg-ds-surface py-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="flex flex-col gap-0 border-b border-solid border-black/5 border-x-0 border-t-0 px-6 py-4">
          <h3 className="m-0 text-section-title font-semibold tracking-[var(--ds-type-section-title-tracking)] text-ds-text-primary">Appearance</h3>
          <SettingChoiceRow
            label="Language"
            control={<SegmentedControl items={[{ id: 'en', label: 'English' }, { id: 'zh', label: '中文' }]} value={props.language} onChange={props.setLanguage} appearance="rail" className="flex-nowrap" />}
          />
          <SettingChoiceRow
            label="Theme"
            control={<SegmentedControl items={[{ id: 'light', label: 'Light', icon: <Sun size={13} /> }, { id: 'dark', label: 'Dark', icon: <Moon size={13} /> }, { id: 'system', label: 'System' }]} value={props.appearanceTheme} onChange={props.setAppearanceTheme} appearance="rail" className="flex-nowrap" />}
          />
        </div>

        <div className="flex flex-col gap-0 border-b border-solid border-black/5 border-x-0 border-t-0 px-6 py-4">
          <h3 className="m-0 pb-4 text-section-title font-semibold tracking-[var(--ds-type-section-title-tracking)] text-ds-text-primary">General</h3>
          <ToggleSetting title="Auto Refresh" description="Refresh runtime snapshot every 4 seconds." checked={props.autoRefresh} onChange={props.setAutoRefresh} />
          <ToggleSetting title="Advanced Manifest Access" description="Allow opening the raw manifest editor modal." checked={props.showAdvancedEditor} onChange={props.setShowAdvancedEditor} />
          <ToggleSetting title="Compact Tables" description="Tighten spacing for activity, provider and inventory tables." checked={props.compactTables} onChange={props.setCompactTables} last />
        </div>

        <div className="flex flex-col gap-3 border-b border-solid border-black/5 border-x-0 border-t-0 px-6 py-4">
          <h3 className="m-0 text-section-title font-semibold tracking-[var(--ds-type-section-title-tracking)] text-ds-text-primary">Routing Rules</h3>
          <SettingChoiceRow
            label="Strategy"
            control={<SegmentedControl items={props.routingStrategies} value={props.routingStrategy} onChange={props.onStrategyChange} appearance="rail" className="flex-nowrap" />}
          />
          <div className="flex items-center justify-between gap-4">
            <span className="font-text text-utility font-normal tracking-[var(--ds-type-utility-tracking)] text-ds-text-primary opacity-70">Auto-fallback</span>
            <ToggleSwitch checked={props.autoFallback} onChange={props.onAutoFallbackChange} ariaLabel="Toggle auto-fallback" />
          </div>
          <p className="m-0 text-caption leading-[1.5] text-ds-text-secondary">
            Try providers in priority order. Skip to next if insufficient stock or request fails.
          </p>
        </div>

        <div className="flex flex-col gap-4 px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <h3 className="m-0 text-section-title font-semibold tracking-[var(--ds-type-section-title-tracking)] text-ds-text-primary">Server Configuration</h3>
            <AppButton variant="outline" size="utility" onClick={props.onReload} disabled={props.reloadBusy}>
              {props.reloadBusy ? 'Reloading…' : 'Reload Providers'}
            </AppButton>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="font-text text-utility font-normal tracking-[var(--ds-type-utility-tracking)] text-ds-text-secondary">HTTP Endpoint</span>
            <div className="inline-block rounded-xs border border-ds-border bg-ds-surface-subtle px-2.5 py-[5px] font-mono text-caption text-ds-text-secondary">
              {props.apiBase}
            </div>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="font-text text-utility font-normal tracking-[var(--ds-type-utility-tracking)] text-ds-text-secondary">Socket Path</span>
            <div className="inline-block rounded-xs border border-ds-border bg-ds-surface-subtle px-2.5 py-[5px] font-mono text-caption text-ds-text-secondary">
              {props.socketPath}
            </div>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="font-text text-utility font-normal tracking-[var(--ds-type-utility-tracking)] text-ds-text-secondary">Desktop Runtime</span>
            <span className="text-[13px] leading-[1.43] tracking-[-0.224px] text-ds-text-secondary">Tauri v2</span>
          </div>
        </div>
      </div>
    </div>
  );
}
