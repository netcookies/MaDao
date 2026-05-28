import type { AppearanceTheme } from './types';

export type ResolvedAppearanceTheme = 'light' | 'dark';

const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

type LegacyMediaQueryList = MediaQueryList & {
  addListener: (listener: () => void) => void;
  removeListener: (listener: () => void) => void;
};

export function getSystemAppearanceTheme(): ResolvedAppearanceTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia(DARK_SCHEME_QUERY).matches ? 'dark' : 'light';
}

export function normalizeAppearanceTheme(value: string | null): AppearanceTheme {
  if (value === 'light' || value === 'dark' || value === 'system') return value;
  return 'light';
}

export function resolveAppearanceTheme(theme: AppearanceTheme): ResolvedAppearanceTheme {
  return theme === 'system' ? getSystemAppearanceTheme() : theme;
}

export function getSystemThemeMediaQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || !window.matchMedia) return null;
  return window.matchMedia(DARK_SCHEME_QUERY);
}

export function subscribeToSystemThemeChange(listener: () => void): (() => void) | null {
  const mediaQuery = getSystemThemeMediaQuery();
  if (!mediaQuery) return null;

  if ('addEventListener' in mediaQuery) {
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }

  const legacyMediaQuery = mediaQuery as LegacyMediaQueryList;
  legacyMediaQuery.addListener(listener);
  return () => legacyMediaQuery.removeListener(listener);
}

export function applyDocumentTheme(theme: AppearanceTheme, language: string) {
  const root = document.documentElement;
  const resolvedTheme = resolveAppearanceTheme(theme);
  root.dataset.theme = resolvedTheme;
  root.dataset.themePreference = theme;
  root.dataset.language = language;
  root.style.colorScheme = resolvedTheme;
}
