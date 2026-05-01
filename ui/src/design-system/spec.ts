export type ThemeMode = 'light' | 'dark';

export type ComponentFamily =
  | 'shell'
  | 'navigation'
  | 'primitive'
  | 'data-display'
  | 'feedback'
  | 'overlay'
  | 'domain';

export type TokenPath =
  | `color.${string}`
  | `radius.${string}`
  | `space.${string}`
  | `size.${string}`
  | `type.${string}`
  | `motion.${string}`
  | `effect.${string}`;

export type ComponentSpec = {
  name: string;
  family: ComponentFamily;
  description: string;
  designSource: {
    penNodeId?: string;
    penNodeName?: string;
    screenshotTargets?: string[];
  };
  currentImplementation: {
    functions: string[];
    classes: string[];
  };
  structure: string[];
  variants: string[];
  states: string[];
  tokens: TokenPath[];
  migrationTarget: {
    componentName: string;
    suggestedPath: string;
  };
};

export const designTokens = {
  color: {
    window: {
      bg: {
        light: '#f5f5f7',
        dark: '#1c1c1e',
      },
    },
    sidebar: {
      bg: {
        light: '#f6f6f6',
        dark: '#232325',
      },
    },
    content: {
      bg: {
        light: '#f5f5f7',
        dark: '#232325',
      },
    },
    surface: {
      default: {
        light: '#ffffff',
        dark: '#2c2c2e',
      },
      subtle: {
        light: '#fafafc',
        dark: '#3a3a3c',
      },
      chip: {
        light: '#d2d2d7',
        dark: '#48484a',
      },
    },
    border: {
      default: {
        light: 'rgba(0, 0, 0, 0.08)',
        dark: 'rgba(255, 255, 255, 0.10)',
      },
      strong: {
        light: 'rgba(0, 0, 0, 0.12)',
        dark: 'rgba(255, 255, 255, 0.15)',
      },
    },
    text: {
      primary: {
        light: '#1d1d1f',
        dark: '#f5f5f7',
      },
      secondary: {
        light: '#6e6e73',
        dark: 'rgba(245, 245, 247, 0.55)',
      },
    },
    accent: {
      blue: {
        light: '#0066cc',
        dark: '#3d9dff',
      },
      blueFocus: {
        light: '#0071e3',
        dark: '#409cff',
      },
    },
    state: {
      success: {
        light: '#27c93f',
        dark: '#30d158',
      },
      warning: {
        light: '#ff9500',
        dark: '#ff9f0a',
      },
      danger: {
        light: '#ff5f56',
        dark: '#ff453a',
      },
    },
  },
  radius: {
    xs: 5,
    sm: 8,
    md: 11,
    lg: 18,
    pill: 9999,
  },
  space: {
    xxs: 4,
    xs: 8,
    sm: 12,
    md: 17,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  size: {
    window: {
      width: 1024,
      height: 768,
    },
    sidebar: {
      width: 240,
    },
    toolbar: {
      height: 52,
    },
    control: {
      default: 44,
      compact: 32,
    },
    panel: {
      notificationWidth: 320,
    },
    modal: {
      activationWidth: 480,
    },
  },
  type: {
    pageTitle: {
      fontSize: 34,
      lineHeight: 1.12,
      fontWeight: 600,
      letterSpacing: '-0.374px',
    },
    sectionTitle: {
      fontSize: 21,
      lineHeight: 1.19,
      fontWeight: 600,
      letterSpacing: '0.231px',
    },
    body: {
      fontSize: 17,
      lineHeight: 1.47,
      fontWeight: 400,
      letterSpacing: '-0.374px',
    },
    bodyStrong: {
      fontSize: 17,
      lineHeight: 1.24,
      fontWeight: 600,
      letterSpacing: '-0.374px',
    },
    utility: {
      fontSize: 14,
      lineHeight: 1.29,
      fontWeight: 400,
      letterSpacing: '-0.224px',
    },
    utilityStrong: {
      fontSize: 14,
      lineHeight: 1.29,
      fontWeight: 600,
      letterSpacing: '-0.224px',
    },
    caption: {
      fontSize: 12,
      lineHeight: 1.43,
      fontWeight: 400,
      letterSpacing: '-0.224px',
    },
  },
  motion: {
    transitionFast: '180ms ease',
    pressScale: 0.95,
  },
  effect: {
    toolbarFrostedBg: 'rgba(255, 255, 255, 0.72)',
    sidebarBlurRadius: 40,
    modalShadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
  },
} as const;

export const componentSpecs: readonly ComponentSpec[] = [
  {
    name: 'AppShell',
    family: 'shell',
    description: '桌面应用双列壳层，左侧导航固定宽度，右侧为 toolbar 与 content。',
    designSource: {
      penNodeId: 'xAOQW',
      penNodeName: 'Mac App',
      screenshotTargets: ['Overview', 'Providers', 'Messages', 'Settings', 'Logs'],
    },
    currentImplementation: {
      functions: ['App'],
      classes: ['mac-window', 'd-main', 'd-content'],
    },
    structure: ['Sidebar', 'MainArea', 'Toolbar', 'PageContent'],
    variants: ['default'],
    states: ['compact'],
    tokens: ['size.window.width', 'size.sidebar.width', 'color.content.bg'],
    migrationTarget: {
      componentName: 'AppShell',
      suggestedPath: 'ui/src/components/composites/AppShell/AppShell.tsx',
    },
  },
  {
    name: 'AppSidebar',
    family: 'navigation',
    description: '全局侧边栏，包含 traffic lights 与一级导航。',
    designSource: {
      penNodeId: 'vMhdP',
      penNodeName: 'Sidebar Component',
      screenshotTargets: ['Overview', 'Providers', 'Messages', 'Settings', 'Logs'],
    },
    currentImplementation: {
      functions: ['App'],
      classes: ['d-sidebar', 'd-traffic', 'd-nav', 'd-nav-item'],
    },
    structure: ['TrafficLights', 'SidebarNav', 'SidebarNavItem'],
    variants: ['default'],
    states: ['active'],
    tokens: ['color.sidebar.bg', 'radius.sm', 'type.caption'],
    migrationTarget: {
      componentName: 'AppSidebar',
      suggestedPath: 'ui/src/components/composites/AppSidebar/AppSidebar.tsx',
    },
  },
  {
    name: 'AppToolbar',
    family: 'navigation',
    description: '顶部上下文栏，负责标题、返回、通知入口和主操作入口。',
    designSource: {
      penNodeId: 'rlf7R',
      penNodeName: 'Toolbar Component',
      screenshotTargets: ['Overview', 'Providers', 'Messages', 'Settings', 'Logs'],
    },
    currentImplementation: {
      functions: ['App'],
      classes: ['d-toolbar', 'd-toolbar-left', 'd-toolbar-right', 'd-toolbar-title'],
    },
    structure: ['ToolbarNav', 'ToolbarTitle', 'ToolbarActions'],
    variants: ['default', 'workspace'],
    states: ['back-enabled', 'notifications-open'],
    tokens: ['size.toolbar.height', 'color.surface.default', 'effect.toolbarFrostedBg'],
    migrationTarget: {
      componentName: 'AppToolbar',
      suggestedPath: 'ui/src/components/composites/AppToolbar/AppToolbar.tsx',
    },
  },
  {
    name: 'Button',
    family: 'primitive',
    description: '统一按钮体系。',
    designSource: {
      screenshotTargets: ['Overview', 'Providers', 'Settings', 'NewActivation'],
    },
    currentImplementation: {
      functions: ['AppButton'],
      classes: ['d-btn-primary', 'd-btn-outline', 'd-btn-success', 'd-btn-ghost', 'd-btn-text'],
    },
    structure: ['ButtonRoot', 'OptionalLeadingIcon', 'Label', 'OptionalTrailingIcon'],
    variants: ['primary', 'outline', 'success', 'ghost', 'dangerOutline', 'text'],
    states: ['default', 'disabled', 'focus-visible', 'pressed'],
    tokens: ['color.accent.blue', 'radius.pill', 'size.control.default', 'motion.pressScale'],
    migrationTarget: {
      componentName: 'Button',
      suggestedPath: 'ui/src/components/primitives/Button/Button.tsx',
    },
  },
  {
    name: 'IconButton',
    family: 'primitive',
    description: '图标按钮，支持 surface 与 toolbar 两种视觉语义。',
    designSource: {
      screenshotTargets: ['Overview', 'Notifications'],
    },
    currentImplementation: {
      functions: ['App'],
      classes: ['d-icon-btn', 'd-icon-btn-toolbar'],
    },
    structure: ['ButtonRoot', 'Icon'],
    variants: ['surface', 'toolbar'],
    states: ['default', 'disabled', 'focus-visible'],
    tokens: ['size.control.default', 'color.surface.chip', 'radius.pill'],
    migrationTarget: {
      componentName: 'IconButton',
      suggestedPath: 'ui/src/components/primitives/IconButton/IconButton.tsx',
    },
  },
  {
    name: 'SegmentedControl',
    family: 'primitive',
    description: '同级切换控件，支持 pill 与 rail 两种变体。',
    designSource: {
      screenshotTargets: ['Messages', 'Logs', 'Settings'],
    },
    currentImplementation: {
      functions: ['SegmentedControl'],
      classes: ['d-seg-tabs', 'd-seg-tab'],
    },
    structure: ['SegmentedRoot', 'SegmentedItem'],
    variants: ['pill', 'rail'],
    states: ['default', 'active', 'focus-visible'],
    tokens: ['radius.pill', 'radius.sm', 'color.accent.blue', 'type.utilityStrong'],
    migrationTarget: {
      componentName: 'SegmentedControl',
      suggestedPath: 'ui/src/components/primitives/SegmentedControl/SegmentedControl.tsx',
    },
  },
  {
    name: 'SearchField',
    family: 'primitive',
    description: '带 leading icon 的统一搜索输入。',
    designSource: {
      screenshotTargets: ['Logs', 'ProviderWorkspace_Store', 'SearchSelectorModal'],
    },
    currentImplementation: {
      functions: ['SearchField'],
      classes: ['d-search-bar'],
    },
    structure: ['SearchRoot', 'SearchIcon', 'Input'],
    variants: ['default', 'compact'],
    states: ['default', 'focus-visible', 'disabled'],
    tokens: ['size.control.default', 'color.border.strong', 'type.utility'],
    migrationTarget: {
      componentName: 'SearchField',
      suggestedPath: 'ui/src/components/primitives/SearchField/SearchField.tsx',
    },
  },
  {
    name: 'SelectTrigger',
    family: 'primitive',
    description: '只承担展示与弹出职责的选择器触发器。',
    designSource: {
      screenshotTargets: ['ProviderWorkspace_Store', 'NewActivation'],
    },
    currentImplementation: {
      functions: ['SelectTrigger'],
      classes: ['d-select-display', 'd-select-button'],
    },
    structure: ['TriggerRoot', 'ValueLabel', 'ChevronIcon'],
    variants: ['default', 'compact', 'prominent', 'disabledLook'],
    states: ['default', 'placeholder', 'disabled', 'focus-visible'],
    tokens: ['size.control.default', 'radius.sm', 'type.utility'],
    migrationTarget: {
      componentName: 'SelectTrigger',
      suggestedPath: 'ui/src/components/primitives/SelectTrigger/SelectTrigger.tsx',
    },
  },
  {
    name: 'ToggleSwitch',
    family: 'primitive',
    description: '二元状态切换。',
    designSource: {
      screenshotTargets: ['Settings'],
    },
    currentImplementation: {
      functions: ['ToggleSwitch'],
      classes: ['d-toggle', 'd-toggle-thumb'],
    },
    structure: ['SwitchRoot', 'SwitchThumb'],
    variants: ['default'],
    states: ['checked', 'unchecked', 'focus-visible', 'disabled'],
    tokens: ['color.accent.blue', 'size.control.compact', 'motion.transitionFast'],
    migrationTarget: {
      componentName: 'ToggleSwitch',
      suggestedPath: 'ui/src/components/primitives/ToggleSwitch/ToggleSwitch.tsx',
    },
  },
  {
    name: 'SurfaceCard',
    family: 'primitive',
    description: '所有 panel / card / section 的基础容器。',
    designSource: {
      screenshotTargets: ['Overview', 'Providers', 'Settings', 'Logs'],
    },
    currentImplementation: {
      functions: ['OverviewScreen', 'ProvidersListScreen', 'SettingsScreen', 'LogsScreen'],
      classes: ['d-card', 'd-stat-card', 'd-balance-card', 'd-form-card', 'd-act-card'],
    },
    structure: ['CardRoot', 'CardHeader', 'CardBody', 'CardFooter'],
    variants: ['default', 'flush', 'activity', 'stats'],
    states: ['default'],
    tokens: ['color.surface.default', 'radius.lg', 'color.border.default'],
    migrationTarget: {
      componentName: 'SurfaceCard',
      suggestedPath: 'ui/src/components/primitives/SurfaceCard/SurfaceCard.tsx',
    },
  },
  {
    name: 'NotificationPopover',
    family: 'overlay',
    description: '通知弹层，包含 header、list、footer。',
    designSource: {
      penNodeId: 'v71IQ',
      penNodeName: 'Notification Panel — Popover',
      screenshotTargets: ['Notifications'],
    },
    currentImplementation: {
      functions: ['App', 'NotifIcon'],
      classes: ['d-notification-panel', 'd-notification-list', 'd-notification-item'],
    },
    structure: ['PopoverHeader', 'NotificationList', 'NotificationItem', 'PopoverFooter'],
    variants: ['default'],
    states: ['open', 'hasUnread', 'empty'],
    tokens: ['size.panel.notificationWidth', 'radius.lg', 'color.surface.default'],
    migrationTarget: {
      componentName: 'NotificationPopover',
      suggestedPath: 'ui/src/components/overlays/NotificationPopover/NotificationPopover.tsx',
    },
  },
  {
    name: 'NewActivationModal',
    family: 'overlay',
    description: '新建激活流程弹窗。',
    designSource: {
      penNodeId: 'UE0DB',
      penNodeName: 'Modal — New Activation',
      screenshotTargets: ['NewActivation'],
    },
    currentImplementation: {
      functions: ['NewActivationModal', 'ModalField'],
      classes: ['d-modal', 'd-modal-activation', 'd-modal-footer-activation', 'd-activation-form'],
    },
    structure: ['ModalHeader', 'FormFields', 'ErrorMessage', 'ModalFooter'],
    variants: ['activation'],
    states: ['open', 'busy', 'error'],
    tokens: ['size.modal.activationWidth', 'radius.lg', 'color.surface.default'],
    migrationTarget: {
      componentName: 'NewActivationModal',
      suggestedPath: 'ui/src/components/overlays/NewActivationModal/NewActivationModal.tsx',
    },
  },
  {
    name: 'SearchSelectorModal',
    family: 'overlay',
    description: '大列表搜索选择器。',
    designSource: {
      screenshotTargets: ['ProviderWorkspace_Store'],
    },
    currentImplementation: {
      functions: ['SearchSelectorModal'],
      classes: ['d-modal-selector', 'd-selector-list', 'd-selector-item'],
    },
    structure: ['ModalHeader', 'SearchField', 'OptionList', 'OptionItem'],
    variants: ['selector'],
    states: ['open', 'filtered', 'empty'],
    tokens: ['color.surface.default', 'radius.lg', 'type.utility'],
    migrationTarget: {
      componentName: 'SearchSelectorModal',
      suggestedPath: 'ui/src/components/overlays/SearchSelectorModal/SearchSelectorModal.tsx',
    },
  },
  {
    name: 'DataTable',
    family: 'data-display',
    description: '基础表格容器。',
    designSource: {
      screenshotTargets: ['Overview', 'Providers', 'Logs'],
    },
    currentImplementation: {
      functions: ['DataTable'],
      classes: ['d-table', 'd-table-row', 'd-table-header'],
    },
    structure: ['TableRoot', 'TableHeaderRow', 'TableRow', 'TableCell'],
    variants: ['default', 'compact'],
    states: ['loading', 'empty'],
    tokens: ['color.border.default', 'type.utility', 'space.sm'],
    migrationTarget: {
      componentName: 'DataTable',
      suggestedPath: 'ui/src/components/composites/DataTable/DataTable.tsx',
    },
  },
  {
    name: 'ActivityCard',
    family: 'domain',
    description: '消息与验证码激活卡片。',
    designSource: {
      screenshotTargets: ['Messages'],
    },
    currentImplementation: {
      functions: ['MessagesScreen'],
      classes: ['d-act-card', 'd-act-phone-pill', 'd-code-area', 'd-act-footer'],
    },
    structure: ['Header', 'PhonePill', 'CodeState', 'FooterActions'],
    variants: ['waiting', 'received', 'failed'],
    states: ['busy', 'refunded'],
    tokens: ['color.surface.subtle', 'radius.pill', 'type.bodyStrong'],
    migrationTarget: {
      componentName: 'ActivityCard',
      suggestedPath: 'ui/src/app/messages/components/ActivityCard/ActivityCard.tsx',
    },
  },
  {
    name: 'ProviderWorkspace',
    family: 'domain',
    description: 'provider 的三段式工作区，含 config、store、wallet。',
    designSource: {
      penNodeId: 'N6Lgb',
      penNodeName: 'Mac App - Provider Workspace - Config',
      screenshotTargets: ['ProviderWorkspace_Config', 'ProviderWorkspace_Store', 'ProviderWorkspace_Wallet'],
    },
    currentImplementation: {
      functions: ['ProviderWorkspaceScreen', 'WorkspaceConfig', 'WorkspaceStore', 'WorkspaceWallet'],
      classes: ['d-ws-body', 'provider-tab', 'd-store-header', 'd-detail-row'],
    },
    structure: ['WorkspaceHeader', 'WorkspaceTabs', 'WorkspaceSection'],
    variants: ['config', 'store', 'wallet'],
    states: ['loading-balance', 'loading-prices', 'editor-open'],
    tokens: ['color.surface.default', 'radius.md', 'type.sectionTitle'],
    migrationTarget: {
      componentName: 'ProviderWorkspace',
      suggestedPath: 'ui/src/app/providers/components/ProviderWorkspace/ProviderWorkspace.tsx',
    },
  },
  {
    name: 'SettingsPanel',
    family: 'domain',
    description: '设置页容器，承载 theme、language、routing 等设置项。',
    designSource: {
      penNodeId: '7PXST',
      penNodeName: 'Mac App - Settings',
      screenshotTargets: ['Settings'],
    },
    currentImplementation: {
      functions: ['SettingsScreen', 'SettingChoiceRow', 'ToggleSetting'],
      classes: ['d-settings-section', 'd-detail-row-choice', 'd-toggle-row'],
    },
    structure: ['SettingsSection', 'SettingChoiceRow', 'ToggleSetting', 'ServerConfigPanel'],
    variants: ['appearance', 'runtime', 'server'],
    states: ['compact-tables', 'dark', 'system'],
    tokens: ['type.sectionTitle', 'type.utility', 'space.lg'],
    migrationTarget: {
      componentName: 'SettingsPanel',
      suggestedPath: 'ui/src/app/settings/components/SettingsPanel/SettingsPanel.tsx',
    },
  },
] as const;

export const migrationPlan = [
  {
    phase: 'phase-1',
    goal: '抽离 design token 与 machine-readable 组件规范。',
    components: ['Button', 'SegmentedControl', 'SearchField', 'SelectTrigger', 'ToggleSwitch', 'SurfaceCard'],
  },
  {
    phase: 'phase-2',
    goal: '抽离 shell 与 overlay，减少 App.tsx 直出 JSX。',
    components: ['AppShell', 'AppSidebar', 'AppToolbar', 'NotificationPopover', 'NewActivationModal', 'SearchSelectorModal'],
  },
  {
    phase: 'phase-3',
    goal: '按 screen 拆分 domain 组件与 hooks。',
    components: ['SettingsPanel', 'ActivityCard', 'ProviderWorkspace', 'DataTable'],
  },
] as const;
