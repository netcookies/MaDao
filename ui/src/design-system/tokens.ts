export type ThemeValue<T> = {
  light: T;
  dark: T;
};

export const tokens = {
  color: {
    windowBg: { light: '#f5f5f7', dark: '#1c1c1e' },
    sidebarBg: { light: '#f6f6f6', dark: '#232325' },
    contentBg: { light: '#f5f5f7', dark: '#232325' },
    surface: {
      default: { light: '#ffffff', dark: '#2c2c2e' },
      subtle: { light: '#fafafc', dark: '#3a3a3c' },
      chip: { light: '#d2d2d7', dark: '#48484a' },
    },
    border: {
      default: { light: 'rgba(0, 0, 0, 0.08)', dark: 'rgba(255, 255, 255, 0.10)' },
      strong: { light: 'rgba(0, 0, 0, 0.12)', dark: 'rgba(255, 255, 255, 0.15)' },
    },
    text: {
      primary: { light: '#1d1d1f', dark: '#f5f5f7' },
      secondary: { light: '#6e6e73', dark: 'rgba(245, 245, 247, 0.55)' },
    },
    accent: {
      blue: { light: '#0066cc', dark: '#3d9dff' },
      blueFocus: { light: '#0071e3', dark: '#409cff' },
    },
    state: {
      success: { light: '#27c93f', dark: '#30d158' },
      warning: { light: '#ff9500', dark: '#ff9f0a' },
      danger: { light: '#ff5f56', dark: '#ff453a' },
    },
  },
  radius: {
    xs: '5px',
    sm: '8px',
    md: '11px',
    lg: '18px',
    pill: '9999px',
  },
  space: {
    xxs: '4px',
    xs: '8px',
    sm: '12px',
    md: '17px',
    lg: '24px',
    xl: '32px',
    xxl: '48px',
  },
  size: {
    sidebarWidth: '240px',
    toolbarHeight: '52px',
    controlDefault: '44px',
    controlCompact: '32px',
    notificationPanelWidth: '320px',
    activationModalWidth: '480px',
  },
  font: {
    familyText: '"SF Pro Text", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
    familyDisplay: '"SF Pro Display", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
  },
  type: {
    pageTitle: {
      fontSize: '34px',
      lineHeight: '1.12',
      fontWeight: '600',
      letterSpacing: '-0.374px',
    },
    sectionTitle: {
      fontSize: '21px',
      lineHeight: '1.19',
      fontWeight: '600',
      letterSpacing: '0.231px',
    },
    body: {
      fontSize: '17px',
      lineHeight: '1.47',
      fontWeight: '400',
      letterSpacing: '-0.374px',
    },
    bodyStrong: {
      fontSize: '17px',
      lineHeight: '1.24',
      fontWeight: '600',
      letterSpacing: '-0.374px',
    },
    utility: {
      fontSize: '14px',
      lineHeight: '1.29',
      fontWeight: '400',
      letterSpacing: '-0.224px',
    },
    utilityStrong: {
      fontSize: '14px',
      lineHeight: '1.29',
      fontWeight: '600',
      letterSpacing: '-0.224px',
    },
    caption: {
      fontSize: '12px',
      lineHeight: '1.43',
      fontWeight: '400',
      letterSpacing: '-0.224px',
    },
  },
  motion: {
    transitionFast: '180ms ease',
    pressScale: '0.95',
  },
} as const;

export type DesignTokens = typeof tokens;
