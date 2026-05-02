import {
  AppButton,
  PageHeader,
  SegmentedControl,
  SettingChoiceRow,
  ToggleSetting,
  ToggleSwitch,
} from '../ui-bridge';
import styles from './SettingsScreen.module.css';

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
    <div className="d-page">
      <PageHeader
        title="Settings"
        subtitle="Configure global preferences and app behavior."
      />

      <div className="d-card">
        <div className={`${styles.settingsSection} ${styles.first}`}>
          <h3 className="d-section-title">Appearance</h3>
          <SettingChoiceRow
            label="Language"
            control={<SegmentedControl items={[{ id: 'en', label: 'English' }, { id: 'zh', label: '中文' }]} value={props.language} onChange={props.setLanguage} appearance="rail" className={styles.segmented} />}
          />
          <SettingChoiceRow
            label="Theme"
            control={<SegmentedControl items={[{ id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }, { id: 'system', label: 'System' }]} value={props.appearanceTheme} onChange={props.setAppearanceTheme} appearance="rail" className={styles.segmented} />}
          />
        </div>

        <div className={styles.settingsSection}>
          <h3 className="d-section-title">General</h3>
          <ToggleSetting title="Auto Refresh" description="Refresh runtime snapshot every 4 seconds." checked={props.autoRefresh} onChange={props.setAutoRefresh} />
          <ToggleSetting title="Advanced Manifest Access" description="Allow opening the raw manifest editor modal." checked={props.showAdvancedEditor} onChange={props.setShowAdvancedEditor} />
          <ToggleSetting title="Compact Tables" description="Tighten spacing for activity, provider and inventory tables." checked={props.compactTables} onChange={props.setCompactTables} last />
        </div>

        <div className={styles.settingsSection}>
          <SettingChoiceRow
            label="Strategy"
            control={<SegmentedControl items={props.routingStrategies} value={props.routingStrategy} onChange={props.onStrategyChange} appearance="rail" className={styles.segmented} />}
          />
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Auto-fallback</span>
            <ToggleSwitch checked={props.autoFallback} onChange={props.onAutoFallbackChange} ariaLabel="Toggle auto-fallback" />
          </div>
          <p className={styles.pageNote}>
            Try providers in priority order. Skip to next if insufficient stock or request fails.
          </p>
        </div>

        <div className={styles.settingsSection}>
          <div className="d-card-head">
            <h3 className="d-section-title">Server Configuration</h3>
            <AppButton variant="outline" size="utility" onClick={props.onReload} disabled={props.reloadBusy}>
              {props.reloadBusy ? 'Reloading…' : 'Reload Providers'}
            </AppButton>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>HTTP Endpoint</span>
            <div className={styles.codeBox}>{props.apiBase}</div>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Socket Path</span>
            <div className={styles.codeBox}>{props.socketPath}</div>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Desktop Runtime</span>
            <span className={styles.detailCaption}>Tauri v2</span>
          </div>
        </div>
      </div>
    </div>
  );
}
